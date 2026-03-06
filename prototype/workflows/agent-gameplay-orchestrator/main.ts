/**
 * CRE Workflow: Agent Gameplay Orchestrator (Log Trigger)
 *
 * TRIGGER: Multiple EVM Logs from DealOrNotConfidential
 *
 * FLOW:
 *   1. Listen for game state change events (GameCreated, RoundStarted, AwaitingOffer, FinalRound)
 *   2. Check if player is a registered agent via AgentRegistry
 *   3. Fetch agent's API endpoint from AgentRegistry
 *   4. Call agent API with game state (HTTP POST)
 *   5. Parse agent decision (pick, open, deal, no-deal, keep, swap)
 *   6. Execute decision on-chain via report → KeystoneForwarder
 *   7. Update agent stats in AgentRegistry after game ends
 */

import {
  bytesToHex,
  cre,
  type EVMLog,
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
  agentRegistryAddress: string;
  chainSelectorName: string;
  gasLimit: string;
  httpTimeout: number; // milliseconds
};

// ── Constants ──

const NUM_CASES = 5;
enum Phase {
  Created = 0,
  Round = 1,
  AwaitingOffer = 4,
  FinalRound = 5,
  Complete = 6,
}

// ── ABI Fragments ──

const confidentialAbi = parseAbi([
  "function getGameState(uint256 gameId) view returns (address host, address player, uint8 mode, uint8 phase, uint8 playerCase, uint8 currentRound, uint8 totalCollapsed, uint256 bankerOffer, uint256 finalPayout, uint256 ethPerDollar, uint256[5] caseValues, bool[5] opened)",
  "function pickCase(uint256 gameId, uint8 caseIndex)",
  "function openCase(uint256 gameId, uint8 caseIndex)",
  "function acceptDeal(uint256 gameId)",
  "function rejectDeal(uint256 gameId)",
  "function keepCase(uint256 gameId)",
  "function swapCase(uint256 gameId)",
]);

const agentRegistryAbi = parseAbi([
  "function isAgentEligible(address player) view returns (bool)",
  "function getAgentEndpoint(address player) view returns (string)",
  "function getAgentId(address player) view returns (uint256)",
  "function updateAgentStats(uint256 agentId, uint256 gameId, uint256 earningsCents, bool won) external",
]);

// ── Agent API Types ──

type GameState = {
  playerCase: number;
  currentRound: number;
  bankerOffer: number;
  caseValues: number[];
  opened: boolean[];
  remainingValues: number[];
};

type DecisionRequest = {
  gameId: string;
  phase: string;
  gameState: GameState;
  expectedValue: number;
  bankerOffer?: number;
};

type DecisionResponse = {
  action: "pick" | "open" | "deal" | "no-deal" | "keep" | "swap";
  caseIndex?: number;
  reasoning?: string;
};

// ── Helper Functions ──

function expectedValue(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function phaseToString(phase: number): string {
  switch (phase) {
    case Phase.Created:
      return "Created";
    case Phase.Round:
      return "Round";
    case Phase.AwaitingOffer:
      return "BankerOffer";
    case Phase.FinalRound:
      return "FinalRound";
    case Phase.Complete:
      return "Complete";
    default:
      return "Unknown";
  }
}

// ── Agent API Call ──

function callAgentAPI(
  runtime: Runtime<Config>,
  endpoint: string,
  request: DecisionRequest
): DecisionResponse {
  try {
    runtime.log(`Calling agent API: ${endpoint}`);

    const httpResponse = runtime
      .http({
        url: endpoint,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        timeout: runtime.config.httpTimeout,
      })
      .result();

    if (httpResponse.statusCode !== 200) {
      throw new Error(`Agent API returned ${httpResponse.statusCode}: ${String.fromCharCode(...httpResponse.body)}`);
    }

    const responseBody = String.fromCharCode(...httpResponse.body);
    const decision: DecisionResponse = JSON.parse(responseBody);

    // Validate decision
    const validActions = ["pick", "open", "deal", "no-deal", "keep", "swap"];
    if (!validActions.includes(decision.action)) {
      throw new Error(`Invalid action: ${decision.action}`);
    }

    runtime.log(`Agent decision: ${decision.action}${decision.caseIndex !== undefined ? ` case ${decision.caseIndex}` : ""}`);
    if (decision.reasoning) {
      runtime.log(`Reasoning: ${decision.reasoning}`);
    }

    return decision;
  } catch (err) {
    runtime.log(`Agent API call failed: ${String(err)}`);
    throw err;
  }
}

// ── Game State Handler ──

function handleGameStateChange(
  runtime: Runtime<Config>,
  log: EVMLog,
  eventName: string
): string {
  const topics = log.topics;
  if (topics.length < 2) {
    throw new Error(`${eventName}: missing topics`);
  }

  // Decode gameId from indexed parameter
  const gameId = BigInt(bytesToHex(topics[1]));
  runtime.log(`${eventName}: game=${gameId}`);

  // Set up EVM client
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Network not found: ${runtime.config.chainSelectorName}`);

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const contractAddr = runtime.config.contractAddress as Address;
  const registryAddr = runtime.config.agentRegistryAddress as Address;

  // 1. Read game state
  const readCallData = encodeFunctionData({
    abi: confidentialAbi,
    functionName: "getGameState",
    args: [gameId],
  });

  const stateResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: contractAddr,
        data: readCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const state = decodeFunctionResult({
    abi: confidentialAbi,
    functionName: "getGameState",
    data: bytesToHex(stateResult.data),
  });

  // Destructure game state
  const player = state[1] as Address;
  const phase = Number(state[3]);
  const playerCase = Number(state[4]);
  const currentRound = Number(state[5]);
  const bankerOffer = Number(state[7]);
  const caseValues = (state[10] as readonly bigint[]).map(Number);
  const opened = state[11] as readonly boolean[];

  // 2. Check if player is agent
  const isAgentCallData = encodeFunctionData({
    abi: agentRegistryAbi,
    functionName: "isAgentEligible",
    args: [player],
  });

  const isAgentResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: registryAddr,
        data: isAgentCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const isAgent = decodeFunctionResult({
    abi: agentRegistryAbi,
    functionName: "isAgentEligible",
    data: bytesToHex(isAgentResult.data),
  });

  if (!isAgent) {
    runtime.log(`Game ${gameId}: player ${player} is not an agent, skipping`);
    return `Game ${gameId}: not an agent game`;
  }

  // 3. Get agent endpoint
  const getEndpointCallData = encodeFunctionData({
    abi: agentRegistryAbi,
    functionName: "getAgentEndpoint",
    args: [player],
  });

  const endpointResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: registryAddr,
        data: getEndpointCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const endpoint = decodeFunctionResult({
    abi: agentRegistryAbi,
    functionName: "getAgentEndpoint",
    data: bytesToHex(endpointResult.data),
  }) as string;

  if (!endpoint || endpoint === "") {
    throw new Error(`Game ${gameId}: agent ${player} has no endpoint registered`);
  }

  // 4. Compute remaining values for expected value calculation
  const remainingValues: number[] = [];
  for (let i = 0; i < NUM_CASES; i++) {
    if (!opened[i] && i !== playerCase) {
      remainingValues.push(caseValues[i]);
    }
  }
  if (playerCase >= 0 && playerCase < NUM_CASES && !opened[playerCase]) {
    remainingValues.push(caseValues[playerCase]);
  }

  const ev = expectedValue(remainingValues);

  // 5. Build decision request
  const decisionRequest: DecisionRequest = {
    gameId: gameId.toString(),
    phase: phaseToString(phase),
    gameState: {
      playerCase,
      currentRound,
      bankerOffer,
      caseValues,
      opened: Array.from(opened),
      remainingValues,
    },
    expectedValue: ev,
    bankerOffer: phase === Phase.AwaitingOffer ? bankerOffer : undefined,
  };

  // 6. Call agent API
  const decision = callAgentAPI(runtime, endpoint, decisionRequest);

  // 7. Execute decision on-chain
  let writeCallData: `0x${string}`;

  switch (decision.action) {
    case "pick":
      if (decision.caseIndex === undefined || decision.caseIndex < 0 || decision.caseIndex >= NUM_CASES) {
        throw new Error(`Invalid caseIndex for pick: ${decision.caseIndex}`);
      }
      writeCallData = encodeFunctionData({
        abi: confidentialAbi,
        functionName: "pickCase",
        args: [gameId, decision.caseIndex],
      });
      break;

    case "open":
      if (decision.caseIndex === undefined || decision.caseIndex < 0 || decision.caseIndex >= NUM_CASES) {
        throw new Error(`Invalid caseIndex for open: ${decision.caseIndex}`);
      }
      writeCallData = encodeFunctionData({
        abi: confidentialAbi,
        functionName: "openCase",
        args: [gameId, decision.caseIndex],
      });
      break;

    case "deal":
      writeCallData = encodeFunctionData({
        abi: confidentialAbi,
        functionName: "acceptDeal",
        args: [gameId],
      });
      break;

    case "no-deal":
      writeCallData = encodeFunctionData({
        abi: confidentialAbi,
        functionName: "rejectDeal",
        args: [gameId],
      });
      break;

    case "keep":
      writeCallData = encodeFunctionData({
        abi: confidentialAbi,
        functionName: "keepCase",
        args: [gameId],
      });
      break;

    case "swap":
      writeCallData = encodeFunctionData({
        abi: confidentialAbi,
        functionName: "swapCase",
        args: [gameId],
      });
      break;

    default:
      throw new Error(`Unknown action: ${decision.action}`);
  }

  // 8. Write to contract via report
  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(writeCallData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.contractAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result();

  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `Agent action ${decision.action} failed: ${writeResult.errorMessage || writeResult.txStatus}`
    );
  }

  const txHash = writeResult.txHash || new Uint8Array(32);
  runtime.log(`Agent action executed: game=${gameId}, action=${decision.action}, tx=${bytesToHex(txHash)}`);

  return `Game ${gameId}: agent ${decision.action} executed`;
}

// ── Event Handlers ──

const onGameCreated = (runtime: Runtime<Config>, log: EVMLog): string => {
  return handleGameStateChange(runtime, log, "GameCreated");
};

const onRoundStarted = (runtime: Runtime<Config>, log: EVMLog): string => {
  return handleGameStateChange(runtime, log, "RoundStarted");
};

const onBankerOfferMade = (runtime: Runtime<Config>, log: EVMLog): string => {
  return handleGameStateChange(runtime, log, "BankerOfferMade");
};

// ── Game Complete Handler (Update Stats) ──

const onGameComplete = (runtime: Runtime<Config>, log: EVMLog): string => {
  const topics = log.topics;
  if (topics.length < 2) {
    throw new Error("GameComplete: missing topics");
  }

  const gameId = BigInt(bytesToHex(topics[1]));
  runtime.log(`GameComplete: game=${gameId}`);

  // Set up EVM client
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Network not found: ${runtime.config.chainSelectorName}`);

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const contractAddr = runtime.config.contractAddress as Address;
  const registryAddr = runtime.config.agentRegistryAddress as Address;

  // Read final game state
  const readCallData = encodeFunctionData({
    abi: confidentialAbi,
    functionName: "getGameState",
    args: [gameId],
  });

  const stateResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: contractAddr,
        data: readCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const state = decodeFunctionResult({
    abi: confidentialAbi,
    functionName: "getGameState",
    data: bytesToHex(stateResult.data),
  });

  const player = state[1] as Address;
  const finalPayout = Number(state[8]); // cents

  // Check if player is agent
  const getAgentIdCallData = encodeFunctionData({
    abi: agentRegistryAbi,
    functionName: "getAgentId",
    args: [player],
  });

  const agentIdResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: registryAddr,
        data: getAgentIdCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const agentId = decodeFunctionResult({
    abi: agentRegistryAbi,
    functionName: "getAgentId",
    data: bytesToHex(agentIdResult.data),
  });

  if (agentId === 0n) {
    runtime.log(`Game ${gameId}: player ${player} is not an agent, skipping stats update`);
    return `Game ${gameId}: not an agent game`;
  }

  // Update agent stats
  const won = finalPayout >= 50; // Win if >= $0.50
  const updateStatsCallData = encodeFunctionData({
    abi: agentRegistryAbi,
    functionName: "updateAgentStats",
    args: [agentId, gameId, BigInt(finalPayout), won],
  });

  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(updateStatsCallData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.agentRegistryAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result();

  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    runtime.log(`Stats update failed: ${writeResult.errorMessage || writeResult.txStatus}`);
  } else {
    const txHash = writeResult.txHash || new Uint8Array(32);
    runtime.log(
      `Agent stats updated: agentId=${agentId}, earnings=${finalPayout}c, won=${won}, tx=${bytesToHex(txHash)}`
    );
  }

  return `Game ${gameId}: agent stats updated`;
};

// ── Workflow Init ──

const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Network not found: ${config.chainSelectorName}`);
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

  // Listen to multiple events for different game phases
  return [
    cre.handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.contractAddress)],
        // Filter for: GameCreated, RoundStarted, BankerOfferMade, FinalRoundStarted, GameComplete
      }),
      (runtime: Runtime<Config>, log: EVMLog): string => {
        // Route to appropriate handler based on event signature
        const eventSig = bytesToHex(log.topics[0]);

        // Event signatures (keccak256 hashes)
        // GameCreated(uint256 indexed gameId, address indexed host, uint8 mode)
        const GAME_CREATED = "0xdd0abcdffc76581d11646898ee4d7f269ca1e0c0b622d072d343100dad83ecb1";
        // RoundComplete(uint256 indexed gameId, uint8 round)
        const ROUND_COMPLETE = "0xc9cd1e1a7382c02c47d1955e4ac06db27ff51188b5a155faaafa0088150086a6";
        // BankerOfferMade(uint256 indexed gameId, uint8 round, uint256 offerCents)
        const BANKER_OFFER_MADE = "0x945170688f4454cb5dd07e4ca30195f361e82be527de0004d7a84656ee9180bb";
        // GameResolved(uint256 indexed gameId, uint256 payoutCents, bool swapped)
        const GAME_RESOLVED = "0xadb369860c8102b22940864c2436877b43ecdaeb85a424297b1aa496f98c52da";

        switch (eventSig) {
          case GAME_CREATED:
            return onGameCreated(runtime, log);
          case ROUND_COMPLETE:
            return onRoundStarted(runtime, log);  // RoundComplete triggers next round actions
          case BANKER_OFFER_MADE:
            return onBankerOfferMade(runtime, log);
          case GAME_RESOLVED:
            return onGameComplete(runtime, log);  // GameResolved triggers stats update
          default:
            runtime.log(`Unknown event signature: ${eventSig}`);
            return "Unknown event";
        }
      }
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
