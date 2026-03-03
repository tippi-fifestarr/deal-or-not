/**
 * CRE Workflow: Game Timer (Cron Trigger)
 *
 * TRIGGER: Cron — every 10 minutes (minimum allowed by CRE deployment policy)
 *
 * FLOW:
 *   1. Read nextGameId(), scan last 5 games
 *   2. For each active game with createdAt > 0:
 *      a. Attempt expireGame(gameId) on DealOrNotConfidential
 *         (on-chain guard: block.timestamp > createdAt + 600)
 *      b. If expired + sponsored + has jackpot: clearExpiredJackpot(gameId) on SponsorJackpot
 *
 * DETERMINISM: No Date.now() — all decisions use on-chain state read via callContract.
 * The on-chain expireGame() is the source of truth for the 10-min expiry check.
 * Each expired game may need TWO separate writeReport calls to different receivers.
 */

import {
  bytesToHex,
  cre,
  CronCapability,
  type CronPayload,
  encodeCallMsg,
  getNetwork,
  hexToBase64,
  LATEST_BLOCK_NUMBER,
  Runner,
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import {
  encodeFunctionData,
  decodeFunctionResult,
  parseAbi,
  zeroAddress,
  type Address,
} from "viem";

// ── Config ──

type Config = {
  contractAddress: string;
  sponsorJackpotAddress: string;
  chainSelectorName: string;
  gasLimit: string;
  schedule: string;
};

// ── Constants ──

const SCAN_WINDOW = 5;

// ── ABI Fragments ──

const dealOrNotAbi = parseAbi([
  "function nextGameId() view returns (uint256)",
  "function getGameState(uint256 gameId) view returns (address host, address player, uint8 mode, uint8 phase, uint8 playerCase, uint8 currentRound, uint8 totalCollapsed, uint256 bankerOffer, uint256 finalPayout, uint256 ethPerDollar, uint256[5] caseValues, bool[5] opened)",
  "function getGameCreatedAt(uint256 gameId) view returns (uint256)",
  "function expireGame(uint256 gameId)",
]);

const sponsorJackpotAbi = parseAbi([
  "function gameSponsor(uint256 gameId) view returns (address)",
  "function getJackpot(uint256 gameId) view returns (uint256)",
  "function clearExpiredJackpot(uint256 gameId)",
]);

// ── Cron Trigger Handler ──

const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): string => {
  runtime.log("Game timer tick");

  // Set up EVM client
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Network not found: ${runtime.config.chainSelectorName}`);

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const contractAddr = runtime.config.contractAddress as Address;
  const sponsorAddr = runtime.config.sponsorJackpotAddress as Address;

  // 1. Read nextGameId
  const nextIdCallData = encodeFunctionData({
    abi: dealOrNotAbi,
    functionName: "nextGameId",
  });

  const nextIdResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: contractAddr,
        data: nextIdCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const nextGameId = decodeFunctionResult({
    abi: dealOrNotAbi,
    functionName: "nextGameId",
    data: bytesToHex(nextIdResult.data),
  });

  if (nextGameId === 0n) {
    runtime.log("No games exist yet");
    return "No games";
  }

  // 2. Scan last SCAN_WINDOW games
  const startId = nextGameId > BigInt(SCAN_WINDOW) ? nextGameId - BigInt(SCAN_WINDOW) : 0n;
  const results: string[] = [];

  for (let gameId = startId; gameId < nextGameId; gameId++) {
    try {
      const result = processGame(runtime, evmClient, contractAddr, sponsorAddr, gameId);
      if (result) results.push(result);
    } catch (err) {
      runtime.log(`Error processing game ${gameId}: ${err}`);
    }
  }

  const summary = results.length > 0 ? results.join("; ") : "No games expired";
  runtime.log(summary);
  return summary;
};

function processGame(
  runtime: Runtime<Config>,
  evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
  contractAddr: Address,
  sponsorAddr: Address,
  gameId: bigint,
): string | null {
  // a. Read game state
  const stateCallData = encodeFunctionData({
    abi: dealOrNotAbi,
    functionName: "getGameState",
    args: [gameId],
  });

  const stateResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: contractAddr,
        data: stateCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const state = decodeFunctionResult({
    abi: dealOrNotAbi,
    functionName: "getGameState",
    data: bytesToHex(stateResult.data),
  });

  // state[3] = phase
  const phase = state[3] as number;

  // Skip GameOver (8) or WaitingForVRF (0) — VRF hasn't fired, createdAt is 0
  if (phase >= 8 || phase === 0) {
    return null;
  }

  // b. Read createdAt
  const createdAtCallData = encodeFunctionData({
    abi: dealOrNotAbi,
    functionName: "getGameCreatedAt",
    args: [gameId],
  });

  const createdAtResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: contractAddr,
        data: createdAtCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const createdAt = decodeFunctionResult({
    abi: dealOrNotAbi,
    functionName: "getGameCreatedAt",
    data: bytesToHex(createdAtResult.data),
  });

  if (createdAt === 0n) {
    return null;
  }

  // No client-side time check — the on-chain expireGame() enforces
  // block.timestamp > createdAt + 600. This keeps the workflow fully
  // deterministic across DON nodes (no Date.now() dependency).
  // If the game isn't expired yet, the tx will revert and we handle it below.
  runtime.log(`Game ${gameId}: active (phase=${phase}), attempting expire`);

  // c. EXPIRE: report + writeReport expireGame(gameId) → DealOrNotConfidential
  const expireCallData = encodeFunctionData({
    abi: dealOrNotAbi,
    functionName: "expireGame",
    args: [gameId],
  });

  const expireReport = runtime
    .report({
      encodedPayload: hexToBase64(expireCallData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const expireResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.contractAddress,
      report: expireReport,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result();

  if (expireResult.txStatus !== TxStatus.SUCCESS) {
    // On-chain revert means game isn't expired yet (< 10 min) — skip gracefully
    runtime.log(`Game ${gameId}: expireGame reverted (not expired yet or wrong phase): ${expireResult.errorMessage || expireResult.txStatus}`);
    return null;
  }

  const expireTxHash = expireResult.txHash || new Uint8Array(32);
  runtime.log(`Expired game ${gameId}, tx=${bytesToHex(expireTxHash)}`);

  // d. Check if game has sponsor + jackpot to clear
  const sponsorCallData = encodeFunctionData({
    abi: sponsorJackpotAbi,
    functionName: "gameSponsor",
    args: [gameId],
  });

  const sponsorResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: sponsorAddr,
        data: sponsorCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const gameSponsor = decodeFunctionResult({
    abi: sponsorJackpotAbi,
    functionName: "gameSponsor",
    data: bytesToHex(sponsorResult.data),
  });

  if (gameSponsor === zeroAddress) {
    return `Game ${gameId}: expired (no sponsor)`;
  }

  const jackpotCallData = encodeFunctionData({
    abi: sponsorJackpotAbi,
    functionName: "getJackpot",
    args: [gameId],
  });

  const jackpotResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: sponsorAddr,
        data: jackpotCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const jackpot = decodeFunctionResult({
    abi: sponsorJackpotAbi,
    functionName: "getJackpot",
    data: bytesToHex(jackpotResult.data),
  });

  if (jackpot === 0n) {
    return `Game ${gameId}: expired (no jackpot to clear)`;
  }

  // e. Clear jackpot: report + writeReport clearExpiredJackpot(gameId) → SponsorJackpot
  const clearCallData = encodeFunctionData({
    abi: sponsorJackpotAbi,
    functionName: "clearExpiredJackpot",
    args: [gameId],
  });

  const clearReport = runtime
    .report({
      encodedPayload: hexToBase64(clearCallData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const clearResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.sponsorJackpotAddress,
      report: clearReport,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result();

  if (clearResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`clearExpiredJackpot(${gameId}) failed: ${clearResult.errorMessage || clearResult.txStatus}`);
  }

  const clearTxHash = clearResult.txHash || new Uint8Array(32);
  runtime.log(`Cleared jackpot for game ${gameId}: ${jackpot} cents, tx=${bytesToHex(clearTxHash)}`);

  return `Game ${gameId}: expired + jackpot cleared (${jackpot} cents)`;
}

// ── Workflow Init ──

const initWorkflow = (config: Config) => {
  const cronCapability = new CronCapability();

  return [
    cre.handler(
      cronCapability.trigger({ schedule: config.schedule }),
      onCronTrigger
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
