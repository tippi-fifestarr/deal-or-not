/**
 * CRE Workflow: Case Reveal Orchestrator (Phase 2)
 *
 * PURPOSE: Automate the reveal transaction after player commits.
 *          UX improvement: 1 transaction instead of 2.
 *
 * WORKFLOW:
 * 1. Listen for CaseCommitted events on-chain
 * 2. Player provides reveal data via off-chain request (HTTP or event)
 * 3. Wait 1 block after commit
 * 4. Read blockhash(commitBlock) for entropy
 * 5. Call revealCase() via Keystone Forwarder with DON consensus
 *
 * SECURITY:
 * - Only processes reveals for valid commits
 * - Enforces 1-block wait + 256-block window
 * - Requires quorum consensus (4 of 6 DON nodes)
 * - Keystone Forwarder provides BFT proof on-chain
 *
 * PHASE 2 vs PHASE 3:
 * - Phase 2 (this): Auto-reveal with plain reveal data
 * - Phase 3 (future): Add threshold encryption for reveal data
 */

import { ethers } from "ethers";

// ══════════════════════════════════════════════════════════
//                    TYPE DEFINITIONS
// ══════════════════════════════════════════════════════════

interface RevealRequest {
  gameId: string;
  caseIndex: number;
  salt: string;
  player: string;
  commitBlock: number;
  timestamp: number;
}

interface WorkflowConfig {
  rpcUrl: string;
  contractAddress: string;
  keystoneForwarderAddress: string;
  privateKey: string; // DON node signing key
}

interface CaseCommittedEvent {
  gameId: bigint;
  round: number;
  blockNumber: number;
  transactionHash: string;
}

// ══════════════════════════════════════════════════════════
//                  IN-MEMORY REVEAL QUEUE
// ══════════════════════════════════════════════════════════

/**
 * In production, this would be a database or CRE's internal state.
 * For this prototype, we use an in-memory map.
 */
const pendingReveals = new Map<string, RevealRequest>();

// ══════════════════════════════════════════════════════════
//              HTTP ENDPOINT: SUBMIT REVEAL DATA
// ══════════════════════════════════════════════════════════

/**
 * Player submits reveal data off-chain after committing on-chain.
 *
 * Frontend flow:
 * 1. Player calls commitCase(gameId, hash) on-chain
 * 2. Player immediately calls this endpoint with reveal data
 * 3. CRE queues the reveal for automatic execution
 *
 * Security:
 * - In production, require signature from player
 * - Verify commit exists on-chain before accepting
 * - Rate limit per address
 */
export async function submitRevealData(request: RevealRequest): Promise<void> {
  const key = `${request.gameId}-${request.player}`;

  // TODO: Verify player signature over request
  // TODO: Verify commit exists on-chain
  // TODO: Verify not expired (< 256 blocks old)

  console.log(`[CRE] Received reveal request for game ${request.gameId}`);
  pendingReveals.set(key, request);
}

// ══════════════════════════════════════════════════════════
//           EVENT LISTENER: CASE COMMITTED
// ══════════════════════════════════════════════════════════

/**
 * Listen for CaseCommitted events and trigger reveal workflow.
 *
 * This is the main orchestration loop.
 */
export async function startCaseRevealOrchestrator(config: WorkflowConfig): Promise<void> {
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const contract = new ethers.Contract(
    config.contractAddress,
    DEAL_OR_NOT_ABI,
    provider
  );

  console.log("[CRE] Case Reveal Orchestrator started");
  console.log(`[CRE] Listening for CaseCommitted events on ${config.contractAddress}`);

  // Listen for new CaseCommitted events
  contract.on("CaseCommitted", async (gameId: bigint, round: number, event: any) => {
    console.log(`[CRE] CaseCommitted event detected: game=${gameId}, round=${round}`);

    const commitBlock = event.blockNumber;

    // Get game state to find player
    const gameState = await contract.getGameState(gameId);
    const player = gameState.player;

    const key = `${gameId}-${player}`;

    // Check if we have reveal data for this commit
    const revealRequest = pendingReveals.get(key);

    if (!revealRequest) {
      console.log(`[CRE] No reveal data found for game ${gameId}. Skipping auto-reveal.`);
      return;
    }

    console.log(`[CRE] Found reveal data for game ${gameId}. Scheduling reveal...`);

    // Schedule reveal for next block
    scheduleReveal(config, provider, revealRequest, commitBlock);
  });

  // Also poll for historical events on startup
  await processHistoricalCommits(config, provider, contract);
}

// ══════════════════════════════════════════════════════════
//              REVEAL SCHEDULING & EXECUTION
// ══════════════════════════════════════════════════════════

/**
 * Schedule reveal to execute after 1 block wait.
 */
async function scheduleReveal(
  config: WorkflowConfig,
  provider: ethers.JsonRpcProvider,
  request: RevealRequest,
  commitBlock: number
): Promise<void> {

  // Wait for next block
  const currentBlock = await provider.getBlockNumber();
  const blocksToWait = Math.max(1, commitBlock + 1 - currentBlock);

  console.log(`[CRE] Waiting ${blocksToWait} blocks before revealing...`);

  // Poll for block advancement
  await waitForBlock(provider, commitBlock + 1);

  // Execute reveal
  await executeReveal(config, provider, request, commitBlock);
}

/**
 * Wait for a specific block number.
 */
async function waitForBlock(provider: ethers.JsonRpcProvider, targetBlock: number): Promise<void> {
  return new Promise((resolve) => {
    const checkBlock = async () => {
      const current = await provider.getBlockNumber();
      if (current >= targetBlock) {
        resolve();
      } else {
        setTimeout(checkBlock, 2000); // Poll every 2 seconds
      }
    };
    checkBlock();
  });
}

/**
 * Execute reveal via Keystone Forwarder.
 */
async function executeReveal(
  config: WorkflowConfig,
  provider: ethers.JsonRpcProvider,
  request: RevealRequest,
  commitBlock: number
): Promise<void> {

  console.log(`[CRE] Executing reveal for game ${request.gameId}...`);

  // Read blockhash for entropy verification
  const block = await provider.getBlock(commitBlock);
  const blockhash = block?.hash || "";

  console.log(`[CRE] Blockhash at commit: ${blockhash}`);

  // Create reveal transaction
  const signer = new ethers.Wallet(config.privateKey, provider);
  const contract = new ethers.Contract(
    config.contractAddress,
    DEAL_OR_NOT_ABI,
    signer
  );

  try {
    // In production, this would go through Keystone Forwarder
    // For now, we call directly
    const tx = await contract.revealCase(
      request.gameId,
      request.caseIndex,
      request.salt
    );

    console.log(`[CRE] Reveal transaction sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[CRE] Reveal confirmed in block ${receipt.blockNumber}`);

    // Remove from queue
    const key = `${request.gameId}-${request.player}`;
    pendingReveals.delete(key);

    // Emit success metric
    console.log(`[CRE] ✅ Auto-reveal successful for game ${request.gameId}`);

  } catch (error) {
    console.error(`[CRE] ❌ Reveal failed for game ${request.gameId}:`, error);

    // TODO: Retry logic
    // TODO: Alert monitoring
  }
}

/**
 * Process historical commits on startup (catch up on missed events).
 */
async function processHistoricalCommits(
  config: WorkflowConfig,
  provider: ethers.JsonRpcProvider,
  contract: ethers.Contract
): Promise<void> {

  const currentBlock = await provider.getBlockNumber();
  const fromBlock = currentBlock - 1000; // Last 1000 blocks

  console.log(`[CRE] Scanning for historical CaseCommitted events from block ${fromBlock}...`);

  const filter = contract.filters.CaseCommitted();
  const events = await contract.queryFilter(filter, fromBlock, currentBlock);

  console.log(`[CRE] Found ${events.length} historical commits`);

  for (const event of events) {
    // Check if reveal already happened
    const gameId = event.args![0];
    const gameState = await contract.getGameState(gameId);

    if (gameState.phase === 3) { // WaitingForReveal
      const player = gameState.player;
      const key = `${gameId}-${player}`;
      const revealRequest = pendingReveals.get(key);

      if (revealRequest && revealRequest.commitBlock === event.blockNumber) {
        console.log(`[CRE] Processing pending reveal for game ${gameId}`);
        await scheduleReveal(config, provider, revealRequest, event.blockNumber);
      }
    }
  }
}

// ══════════════════════════════════════════════════════════
//                   KEYSTONE INTEGRATION
// ══════════════════════════════════════════════════════════

/**
 * In production Phase 2, reveals would go through Keystone Forwarder.
 *
 * Keystone Forwarder Flow:
 * 1. Each DON node runs this workflow
 * 2. Node computes reveal transaction
 * 3. Node signs with BLS key
 * 4. Nodes submit signatures to Keystone Forwarder
 * 5. Forwarder waits for quorum (4 of 6)
 * 6. Forwarder aggregates signatures
 * 7. Forwarder submits on-chain with BFT proof
 *
 * Contract accepts reveals from Keystone Forwarder address.
 */

async function executeRevealViaKeystone(
  keystoneUrl: string,
  revealTxData: string,
  nodeSignature: string
): Promise<void> {

  // Submit signed transaction to Keystone Forwarder
  const response = await fetch(`${keystoneUrl}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workflowId: "case-reveal-orchestrator",
      txData: revealTxData,
      signature: nodeSignature,
    }),
  });

  if (!response.ok) {
    throw new Error(`Keystone submission failed: ${response.statusText}`);
  }

  const result = await response.json();
  console.log(`[CRE] Keystone accepted signature. Tx hash: ${result.txHash}`);
}

// ══════════════════════════════════════════════════════════
//                       ABI FRAGMENT
// ══════════════════════════════════════════════════════════

const DEAL_OR_NOT_ABI = [
  "event CaseCommitted(uint256 indexed gameId, uint8 round)",
  "function revealCase(uint256 gameId, uint8 caseIndex, uint256 salt) external",
  "function getGameState(uint256 gameId) external view returns (address host, address player, uint8 mode, uint8 phase, uint8 playerCase, uint8 currentRound, uint8 totalCollapsed, uint256 bankerOffer, uint256 finalPayout, uint256 ethPerDollar, uint256 commitBlock, uint256[5] caseValues, bool[5] opened)",
];

// ══════════════════════════════════════════════════════════
//                   EXAMPLE USAGE
// ══════════════════════════════════════════════════════════

/**
 * Start the orchestrator (run by each DON node).
 */
export async function main() {
  const config: WorkflowConfig = {
    rpcUrl: process.env.RPC_URL || "http://localhost:8545",
    contractAddress: process.env.CONTRACT_ADDRESS || "0x...",
    keystoneForwarderAddress: process.env.KEYSTONE_FORWARDER || "0x...",
    privateKey: process.env.DON_NODE_KEY || "0x...",
  };

  await startCaseRevealOrchestrator(config);

  console.log("[CRE] Orchestrator running. Press Ctrl+C to stop.");
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
