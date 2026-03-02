/**
 * CRE Workflow: Confidential Case Reveal (Event Trigger)
 *
 * PURPOSE: When a player opens a case, compute the case value inside a CRE
 *          enclave using the VRF seed + a per-game secret, then write the
 *          value back to the contract. After game ends, publish the secret
 *          for full auditability.
 *
 * TRIGGER: EVM Log — CaseOpenRequested(uint256 gameId, uint8 caseIndex)
 *
 * SECURITY MODEL:
 *   VRF on-chain    = FAIRNESS  (verifiable random seed)
 *   CRE secret      = PRIVACY   (player can't precompute)
 *   Attestation      = INTEGRITY (enclave proves correct computation)
 *   Post-game secret = AUDITABILITY (anyone can verify all values)
 *
 * FLOW:
 *   1. Listen for CaseOpenRequested event from DealOrNotConfidential
 *   2. Read vrfSeed + usedValuesBitmap from chain
 *   3. Retrieve per-game secret from Vault DON
 *   4. Compute: hash(vrfSeed, caseIndex, secret, usedBitmap) → value
 *   5. Write value via fulfillCaseValue(gameId, caseIndex, valueCents)
 *   6. On GameResolved event, publish secret via publishGameSecret()
 *
 * NOTE: The CRE SDK API below is based on the docs as of March 2026.
 *       Adjust imports and method signatures to match the actual SDK
 *       version available at build time.
 */

import {
  EVMClient,
  handler,
  bytesToHex,
  getNetwork,
  Runner,
  hexToBase64,
  encodeCallMsg,
  LAST_FINALIZED_BLOCK_NUMBER,
  type Runtime,
  type EVMLog,
} from "@chainlink/cre-sdk";
import {
  encodeFunctionData,
  decodeFunctionResult,
  parseAbi,
  keccak256,
  encodePacked,
  zeroAddress,
  type Address,
} from "viem";

// ══════════════════════════════════════════════════════════
//                    CONFIGURATION
// ══════════════════════════════════════════════════════════

type Config = {
  chainSelectorName: string;
  contractAddress: string;
};

// Case values in USD cents — must match DealOrNotConfidential.sol
const CASE_VALUES_CENTS = [1n, 5n, 10n, 50n, 100n];
const NUM_CASES = 5;

// Event signatures (keccak256 of event signature string)
const CASE_OPEN_REQUESTED_TOPIC = keccak256(
  encodePacked(["string"], ["CaseOpenRequested(uint256,uint8)"])
);
const GAME_RESOLVED_TOPIC = keccak256(
  encodePacked(["string"], ["GameResolved(uint256,uint256,bool)"])
);

// ══════════════════════════════════════════════════════════
//                    ABI FRAGMENTS
// ══════════════════════════════════════════════════════════

const confidentialAbi = parseAbi([
  "function getGameState(uint256 gameId) view returns (address host, address player, uint8 mode, uint8 phase, uint8 playerCase, uint8 currentRound, uint8 totalCollapsed, uint256 bankerOffer, uint256 finalPayout, uint256 ethPerDollar, uint256[5] caseValues, bool[5] opened)",
  "function fulfillCaseValue(uint256 gameId, uint8 caseIndex, uint256 valueCents)",
  "function publishGameSecret(uint256 gameId, bytes32 secret)",
]);

// ══════════════════════════════════════════════════════════
//                    COLLAPSE ENGINE
// ══════════════════════════════════════════════════════════

/**
 * Derive a case value from the VRF seed, case index, secret, and used bitmap.
 *
 * This is the SAME algorithm as _deriveValue() in DealOrNotConfidential.sol.
 * The secret is only available inside the CRE enclave.
 *
 * collapse(vrfSeed, caseIndex, secret, bitmap) → valueCents
 */
function collapseCase(
  vrfSeed: bigint,
  caseIndex: number,
  secret: string,
  usedBitmap: bigint
): bigint {
  // Count remaining unused values
  let remaining = 0;
  for (let i = 0; i < NUM_CASES; i++) {
    if ((usedBitmap & (1n << BigInt(i))) === 0n) remaining++;
  }
  if (remaining === 0) throw new Error("No values remaining");

  // Deterministic pick using secret as entropy
  // Must match Solidity: keccak256(abi.encodePacked(vrfSeed, caseIndex, secret, bitmap))
  const hash = keccak256(
    encodePacked(
      ["uint256", "uint8", "bytes32", "uint256"],
      [vrfSeed, caseIndex, secret as `0x${string}`, usedBitmap]
    )
  );
  const pick = BigInt(hash) % BigInt(remaining);

  // Walk unused values to find the picked one (same as Solidity)
  let count = 0n;
  for (let i = 0; i < NUM_CASES; i++) {
    if ((usedBitmap & (1n << BigInt(i))) === 0n) {
      if (count === pick) {
        return CASE_VALUES_CENTS[i];
      }
      count++;
    }
  }

  throw new Error("Unreachable: no value found");
}

// ══════════════════════════════════════════════════════════
//                    EVENT HANDLERS
// ══════════════════════════════════════════════════════════

/**
 * Handle CaseOpenRequested event.
 *
 * When the player calls openCase(), the contract emits this event.
 * We compute the value inside the CRE enclave and write it back.
 */
const onCaseOpenRequested = (runtime: Runtime<Config>, log: EVMLog): string => {
  const topics = log.topics;
  if (topics.length < 2) {
    throw new Error("CaseOpenRequested: missing topics");
  }

  // Decode event: CaseOpenRequested(uint256 indexed gameId, uint8 caseIndex)
  // topic[0] = event signature
  // topic[1] = gameId (indexed)
  // data = caseIndex (non-indexed) — packed as uint8 in bytes
  const gameId = BigInt(bytesToHex(topics[1]));
  const caseIndex = Number(BigInt(bytesToHex(log.data)) & 0xffn);

  runtime.log(`CaseOpenRequested: game=${gameId}, case=${caseIndex}`);

  // Set up EVM client
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Network not found: ${runtime.config.chainSelectorName}`);

  const evmClient = new EVMClient(network.chainSelector.selector);
  const contractAddr = runtime.config.contractAddress as Address;

  // 1. Read game state from chain
  const callData = encodeFunctionData({
    abi: confidentialAbi,
    functionName: "getGameState",
    args: [gameId],
  });

  const stateResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: contractAddr,
        data: callData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const state = decodeFunctionResult({
    abi: confidentialAbi,
    functionName: "getGameState",
    data: bytesToHex(stateResult.data),
  }) as any;

  const vrfSeed = state[10] as bigint; // vrfSeed is stored in the Game struct
  // usedValuesBitmap is not in getGameState return — we reconstruct from opened[] and caseValues[]
  // Actually, we need to read it separately or reconstruct from state
  // For simplicity, we'll reconstruct the bitmap from revealed values
  const caseValues = state[10] as bigint[];
  const opened = state[11] as boolean[];

  // Reconstruct usedValuesBitmap from revealed values
  let usedBitmap = 0n;
  for (let i = 0; i < NUM_CASES; i++) {
    if (opened[i]) {
      const revealedValue = caseValues[i];
      // Find which value index was used
      for (let j = 0; j < NUM_CASES; j++) {
        if (
          CASE_VALUES_CENTS[j] === revealedValue &&
          (usedBitmap & (1n << BigInt(j))) === 0n
        ) {
          usedBitmap |= 1n << BigInt(j);
          break;
        }
      }
    }
  }

  // 2. Get per-game secret from Vault DON (threshold-decrypted in enclave)
  // The secret was created when the game was created (via a separate initialization flow
  // or stored as a workflow-level secret keyed by game ID).
  const secretKey = `GAME_SECRET_${gameId}`;
  const secret = runtime.getSecret({ id: secretKey }).result();

  runtime.log(`Retrieved secret for game ${gameId}`);

  // 3. Compute value inside enclave
  const valueCents = collapseCase(
    vrfSeed,
    caseIndex,
    secret.value,
    usedBitmap
  );

  runtime.log(`Computed value: game=${gameId}, case=${caseIndex}, value=${valueCents} cents`);

  // 4. Write value to chain via fulfillCaseValue()
  const fulfillData = encodeFunctionData({
    abi: confidentialAbi,
    functionName: "fulfillCaseValue",
    args: [gameId, caseIndex, valueCents],
  });

  evmClient
    .sendTransaction(runtime, {
      to: contractAddr,
      data: fulfillData,
      gasLimit: 200000n,
    })
    .result();

  runtime.log(`Fulfilled case value: game=${gameId}, case=${caseIndex}, value=${valueCents}`);

  return `Case ${caseIndex} revealed: ${valueCents} cents`;
};

/**
 * Handle GameResolved event.
 *
 * When the game ends, we publish the per-game secret so anyone can
 * re-derive all values and verify the game was honest.
 */
const onGameResolved = (runtime: Runtime<Config>, log: EVMLog): string => {
  const topics = log.topics;
  if (topics.length < 2) {
    throw new Error("GameResolved: missing topics");
  }

  const gameId = BigInt(bytesToHex(topics[1]));

  runtime.log(`GameResolved: game=${gameId}, publishing secret`);

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Network not found: ${runtime.config.chainSelectorName}`);

  const evmClient = new EVMClient(network.chainSelector.selector);
  const contractAddr = runtime.config.contractAddress as Address;

  // Retrieve the secret one last time
  const secretKey = `GAME_SECRET_${gameId}`;
  const secret = runtime.getSecret({ id: secretKey }).result();

  // Publish secret to chain for auditability
  const publishData = encodeFunctionData({
    abi: confidentialAbi,
    functionName: "publishGameSecret",
    args: [gameId, secret.value as `0x${string}`],
  });

  evmClient
    .sendTransaction(runtime, {
      to: contractAddr,
      data: publishData,
      gasLimit: 100000n,
    })
    .result();

  runtime.log(`Published secret for game ${gameId}`);

  return `Game ${gameId} secret published for auditability`;
};

// ══════════════════════════════════════════════════════════
//                    WORKFLOW SETUP
// ══════════════════════════════════════════════════════════

const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Network not found: ${config.chainSelectorName}`);
  }

  const evmClient = new EVMClient(network.chainSelector.selector);

  return [
    // Listen for CaseOpenRequested events → compute and write values
    handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.contractAddress)],
        // Filter by CaseOpenRequested event signature
        // topics: [CASE_OPEN_REQUESTED_TOPIC],
      }),
      (runtime: Runtime<Config>, log: EVMLog) => {
        const eventSig = bytesToHex(log.topics[0]);
        if (eventSig === CASE_OPEN_REQUESTED_TOPIC) {
          return onCaseOpenRequested(runtime, log);
        } else if (eventSig === GAME_RESOLVED_TOPIC) {
          return onGameResolved(runtime, log);
        }
        return "Unhandled event";
      }
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
