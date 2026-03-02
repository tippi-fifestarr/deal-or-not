/**
 * CRE Workflow: Sponsor Jackpot (Cron Trigger)
 *
 * PURPOSE: Every 30 seconds, deposit a random sponsor amount into the
 *          active game's jackpot. The amount is chosen from the range
 *          between the 2nd-highest and highest remaining case values.
 *
 * TRIGGER: Cron (every 30 seconds)
 *
 * FLOW:
 *   1. Read DealOrNot.nextGameId() to find active games
 *   2. For each active game with at least 1 case opened:
 *      a. Read getRemainingValuePool(gameId)
 *      b. Sort descending, take top 2 as range [low, high]
 *      c. Deterministic random in [low, high] using block number
 *      d. Call SponsorJackpot.addToJackpot(gameId, amount)
 *
 * NARRATIVE: "This episode of Deal or NOT is sponsored by Chainlink.
 *             CRE enables real-time sponsor mechanics — a countdown
 *             jackpot that grows while you play."
 *
 * NOTE: The CRE SDK API below is based on the docs as of March 2026.
 *       Adjust imports and method signatures to match the actual SDK
 *       version available at build time.
 */

// ══════════════════════════════════════════════════════════
//                    CONFIGURATION
// ══════════════════════════════════════════════════════════

const DEAL_OR_NOT_ADDR = "0x9f9744D9c49b4E7B5DE85269042d1922Ba2A922F";
const SPONSOR_JACKPOT_ADDR = "0x7B04840165E05877A772E3b1c71fE05399101De0";
const CHAIN_ID = 84532; // Base Sepolia

// Game phases (from DealOrNot.sol)
const PHASE_WAITING_FOR_VRF = 0;
const PHASE_CREATED = 1;
const PHASE_GAME_OVER = 8;

// How many recent games to scan
const SCAN_WINDOW = 5;

// ══════════════════════════════════════════════════════════
//                    ABI FRAGMENTS
// ══════════════════════════════════════════════════════════

const DEAL_OR_NOT_ABI = [
  "function nextGameId() view returns (uint256)",
  "function getGameState(uint256 gameId) view returns (address host, address player, uint8 mode, uint8 phase, uint8 playerCase, uint8 currentRound, uint8 totalCollapsed, uint256 bankerOffer, uint256 finalPayout, uint256 ethPerDollar, uint256 commitBlock, uint256[5] caseValues, bool[5] opened)",
  "function getRemainingValuePool(uint256 gameId) view returns (uint256[])",
];

const SPONSOR_JACKPOT_ABI = [
  "function addToJackpot(uint256 gameId, uint256 amountCents) external",
  "function getJackpot(uint256 gameId) view returns (uint256)",
  "function gameSponsor(uint256 gameId) view returns (address)",
];

// ══════════════════════════════════════════════════════════
//                    WORKFLOW LOGIC
// ══════════════════════════════════════════════════════════

/**
 * Main workflow callback. Runs every 30 seconds on all DON nodes.
 *
 * Because all DON nodes see the same block number at consensus time,
 * the random amount computation is deterministic across nodes.
 */
async function sponsorJackpotCallback(runtime: any) {
  const evm = runtime.getEVMClient(CHAIN_ID);

  // 1. Get total number of games
  const nextId = await evm.readContract({
    address: DEAL_OR_NOT_ADDR,
    abi: DEAL_OR_NOT_ABI,
    functionName: "nextGameId",
  });

  const nextGameId = Number(nextId);
  if (nextGameId === 0) {
    runtime.log("No games exist yet");
    return;
  }

  // 2. Get current block number (deterministic across DON nodes at consensus)
  const blockNumber = await evm.getBlockNumber();

  // 3. Scan recent games
  const startId = Math.max(0, nextGameId - SCAN_WINDOW);

  for (let id = startId; id < nextGameId; id++) {
    try {
      await processGame(evm, runtime, id, blockNumber);
    } catch (err) {
      runtime.log(`Error processing game ${id}: ${err}`);
    }
  }
}

/**
 * Process a single game: check if active, compute sponsor amount, deposit.
 */
async function processGame(
  evm: any,
  runtime: any,
  gameId: number,
  blockNumber: number
) {
  // Read game state
  const state = await evm.readContract({
    address: DEAL_OR_NOT_ADDR,
    abi: DEAL_OR_NOT_ABI,
    functionName: "getGameState",
    args: [gameId],
  });

  const phase = Number(state.phase);
  const totalCollapsed = Number(state.totalCollapsed);

  // Skip inactive games (not started or finished)
  if (phase <= PHASE_CREATED || phase >= PHASE_GAME_OVER) {
    return;
  }

  // Skip if no cases opened yet
  if (totalCollapsed === 0) {
    return;
  }

  // Check that a sponsor is assigned to this game
  const sponsorAddr: string = await evm.readContract({
    address: SPONSOR_JACKPOT_ADDR,
    abi: SPONSOR_JACKPOT_ABI,
    functionName: "gameSponsor",
    args: [gameId],
  });

  if (sponsorAddr === "0x0000000000000000000000000000000000000000") {
    runtime.log(`Game ${gameId}: no sponsor assigned, skipping`);
    return;
  }

  // Get remaining value pool
  const remaining: bigint[] = await evm.readContract({
    address: DEAL_OR_NOT_ADDR,
    abi: DEAL_OR_NOT_ABI,
    functionName: "getRemainingValuePool",
    args: [gameId],
  });

  if (remaining.length < 2) {
    runtime.log(`Game ${gameId}: fewer than 2 values remaining, skipping`);
    return;
  }

  // Sort descending
  const sorted = [...remaining].sort((a: bigint, b: bigint) =>
    a > b ? -1 : a < b ? 1 : 0
  );

  const high = Number(sorted[0]); // highest remaining value
  const low = Number(sorted[1]);  // 2nd highest remaining value

  // Deterministic random in [low, high]
  // All DON nodes see the same blockNumber, so they compute the same result.
  // We use a simple hash of (blockNumber, gameId, "sponsor") as entropy.
  const seedInput = `${blockNumber}-${gameId}-sponsor`;
  const seedHash = simpleHash(seedInput);
  const range = high - low + 1;
  const randomAmount = low + (seedHash % range);

  runtime.log(
    `Game ${gameId}: remaining top 2 = [${low}, ${high}], ` +
    `sponsor amount = ${randomAmount} cents`
  );

  // Write to SponsorJackpot contract
  await evm.writeContract({
    address: SPONSOR_JACKPOT_ADDR,
    abi: SPONSOR_JACKPOT_ABI,
    functionName: "addToJackpot",
    args: [gameId, randomAmount],
  });

  runtime.log(`Game ${gameId}: jackpot increased by ${randomAmount} cents`);
}

/**
 * Simple deterministic hash for random seed.
 * In production, use keccak256 or the CRE SDK's crypto utilities.
 */
function simpleHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

// ══════════════════════════════════════════════════════════
//                    WORKFLOW REGISTRATION
// ══════════════════════════════════════════════════════════

/**
 * Register the workflow with CRE.
 *
 * NOTE: The exact registration API depends on the CRE SDK version.
 * This follows the pattern from the docs:
 *   - Define a cron trigger
 *   - Wire it to the callback
 *   - Export for the CRE runtime
 */

// Cron trigger: every 30 seconds (minimum allowed interval)
export const trigger = {
  type: "cron" as const,
  schedule: "*/30 * * * * *",
};

export const handler = sponsorJackpotCallback;

// If CRE SDK provides a registration function:
// import { CRE } from "@aspect-build/cre-sdk";
// const cronTrigger = CRE.cronTrigger({ schedule: "*/30 * * * * *" });
// CRE.handle(cronTrigger, sponsorJackpotCallback);
