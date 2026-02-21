/**
 * ABI for DealOrNoDeal game clone contracts.
 * These are EIP-1167 minimal proxies not deployed via SE2's deploy system,
 * so we define the ABI here for use with raw wagmi hooks.
 */
export const DEAL_OR_NO_DEAL_ABI = [
  // --- View Functions ---
  {
    type: "function",
    name: "gameId",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "game",
    inputs: [],
    outputs: [
      { name: "host", type: "address", internalType: "address" },
      { name: "contestant", type: "address", internalType: "address" },
      { name: "state", type: "uint8", internalType: "enum GameState" },
      { name: "outcome", type: "uint8", internalType: "enum GameOutcome" },
      { name: "merkleRoot", type: "bytes32", internalType: "bytes32" },
      { name: "prizePool", type: "uint256", internalType: "uint256" },
      { name: "currentRound", type: "uint256", internalType: "uint256" },
      { name: "selectedCase", type: "uint256", internalType: "uint256" },
      { name: "bankerOffer", type: "uint256", internalType: "uint256" },
      { name: "lastActionTime", type: "uint256", internalType: "uint256" },
      { name: "lotteryEndTime", type: "uint256", internalType: "uint256" },
      { name: "revealEndTime", type: "uint256", internalType: "uint256" },
      { name: "totalEntries", type: "uint256", internalType: "uint256" },
      { name: "hostFee", type: "uint256", internalType: "uint256" },
      { name: "protocolFee", type: "uint256", internalType: "uint256" },
      {
        name: "config",
        type: "tuple",
        internalType: "struct GameConfig",
        components: [
          { name: "entryFee", type: "uint256", internalType: "uint256" },
          { name: "lotteryDuration", type: "uint256", internalType: "uint256" },
          { name: "revealDuration", type: "uint256", internalType: "uint256" },
          { name: "turnTimeout", type: "uint256", internalType: "uint256" },
          { name: "hostFeeBps", type: "uint16", internalType: "uint16" },
          { name: "protocolFeeBps", type: "uint16", internalType: "uint16" },
          { name: "refundBps", type: "uint16", internalType: "uint16" },
          { name: "minPlayers", type: "uint8", internalType: "uint8" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getGameState",
    inputs: [],
    outputs: [
      {
        name: "gameData",
        type: "tuple",
        internalType: "struct Game",
        components: [
          { name: "host", type: "address", internalType: "address" },
          { name: "contestant", type: "address", internalType: "address" },
          { name: "state", type: "uint8", internalType: "enum GameState" },
          { name: "outcome", type: "uint8", internalType: "enum GameOutcome" },
          { name: "merkleRoot", type: "bytes32", internalType: "bytes32" },
          { name: "prizePool", type: "uint256", internalType: "uint256" },
          { name: "currentRound", type: "uint256", internalType: "uint256" },
          { name: "selectedCase", type: "uint256", internalType: "uint256" },
          { name: "bankerOffer", type: "uint256", internalType: "uint256" },
          { name: "lastActionTime", type: "uint256", internalType: "uint256" },
          { name: "lotteryEndTime", type: "uint256", internalType: "uint256" },
          { name: "revealEndTime", type: "uint256", internalType: "uint256" },
          { name: "totalEntries", type: "uint256", internalType: "uint256" },
          { name: "hostFee", type: "uint256", internalType: "uint256" },
          { name: "protocolFee", type: "uint256", internalType: "uint256" },
          {
            name: "config",
            type: "tuple",
            internalType: "struct GameConfig",
            components: [
              { name: "entryFee", type: "uint256", internalType: "uint256" },
              { name: "lotteryDuration", type: "uint256", internalType: "uint256" },
              { name: "revealDuration", type: "uint256", internalType: "uint256" },
              { name: "turnTimeout", type: "uint256", internalType: "uint256" },
              { name: "hostFeeBps", type: "uint16", internalType: "uint16" },
              { name: "protocolFeeBps", type: "uint16", internalType: "uint16" },
              { name: "refundBps", type: "uint16", internalType: "uint16" },
              { name: "minPlayers", type: "uint8", internalType: "uint8" },
            ],
          },
        ],
      },
      { name: "remainingCount", type: "uint256", internalType: "uint256" },
      { name: "currentEV", type: "uint256", internalType: "uint256" },
      { name: "casesLeftThisRound", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRemainingValues",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "previewBankerOffer",
    inputs: [],
    outputs: [
      { name: "offer", type: "uint256", internalType: "uint256" },
      { name: "ev", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getLotteryEntryCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBriefcase",
    inputs: [{ name: "caseIndex", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct BriefcaseData",
        components: [
          { name: "value", type: "uint256", internalType: "uint256" },
          { name: "opened", type: "bool", internalType: "bool" },
          { name: "revealed", type: "bool", internalType: "bool" },
          { name: "holder", type: "address", internalType: "address" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lotteryEntries",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "player", type: "address", internalType: "address" },
      { name: "commitHash", type: "bytes32", internalType: "bytes32" },
      { name: "revealedSecret", type: "bytes32", internalType: "bytes32" },
      { name: "revealed", type: "bool", internalType: "bool" },
      { name: "refunded", type: "bool", internalType: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "playerEntryIndex",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "casesOpenedThisRound",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "briefcases",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "value", type: "uint256", internalType: "uint256" },
      { name: "opened", type: "bool", internalType: "bool" },
      { name: "revealed", type: "bool", internalType: "bool" },
      { name: "holder", type: "address", internalType: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "zkVerifier",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nft",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "factory",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "maxCaseValue",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "protocolFeeRecipient",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  // --- Write Functions ---
  {
    type: "function",
    name: "openLottery",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "enterLottery",
    inputs: [{ name: "commitHash", type: "bytes32", internalType: "bytes32" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "closeLotteryEntries",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revealSecret",
    inputs: [{ name: "secret", type: "bytes32", internalType: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "drawWinner",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "selectCase",
    inputs: [{ name: "caseIndex", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "openCase",
    inputs: [
      { name: "caseIndex", type: "uint256", internalType: "uint256" },
      { name: "value", type: "uint256", internalType: "uint256" },
      { name: "pA", type: "uint256[2]", internalType: "uint256[2]" },
      { name: "pB", type: "uint256[2][2]", internalType: "uint256[2][2]" },
      { name: "pC", type: "uint256[2]", internalType: "uint256[2]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "acceptDeal",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rejectDeal",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revealFinalCase",
    inputs: [
      { name: "value", type: "uint256", internalType: "uint256" },
      { name: "pA", type: "uint256[2]", internalType: "uint256[2]" },
      { name: "pB", type: "uint256[2][2]", internalType: "uint256[2][2]" },
      { name: "pC", type: "uint256[2]", internalType: "uint256[2]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "resolveTimeout",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimRefund",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // --- Events ---
  {
    type: "event",
    name: "GameCreated",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "host", type: "address", indexed: true, internalType: "address" },
      { name: "merkleRoot", type: "bytes32", indexed: false, internalType: "bytes32" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "LotteryOpened",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "entryFee", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "endTime", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "LotteryEntered",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "player", type: "address", indexed: true, internalType: "address" },
      { name: "entryIndex", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SecretRevealed",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "player", type: "address", indexed: true, internalType: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ContestantSelected",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "contestant", type: "address", indexed: true, internalType: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "CaseSelected",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "caseIndex", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "CaseOpened",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "caseIndex", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "value", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BankerOfferMade",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "round", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "offer", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DealAccepted",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "offer", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DealRejected",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "round", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "FinalCaseRevealed",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "caseIndex", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "value", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "GameResolved",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "outcome", type: "uint8", indexed: false, internalType: "enum GameOutcome" },
      { name: "payout", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TimeoutResolved",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "resolver", type: "address", indexed: false, internalType: "address" },
      { name: "evPayout", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RefundClaimed",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "player", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
] as const;

// Game state enum matching the Solidity contract
export enum GameState {
  Created = 0,
  LotteryOpen = 1,
  LotteryReveal = 2,
  LotteryComplete = 3,
  CaseSelection = 4,
  RoundPlay = 5,
  BankerOffer = 6,
  GameOver = 7,
}

export enum GameOutcome {
  None = 0,
  Deal = 1,
  NoDeal = 2,
  TimeoutResolved = 3,
}

export const GAME_STATE_LABELS: Record<number, string> = {
  [GameState.Created]: "Created",
  [GameState.LotteryOpen]: "Lottery Open",
  [GameState.LotteryReveal]: "Lottery Reveal",
  [GameState.LotteryComplete]: "Lottery Complete",
  [GameState.CaseSelection]: "Case Selection",
  [GameState.RoundPlay]: "Round Play",
  [GameState.BankerOffer]: "Banker Offer",
  [GameState.GameOver]: "Game Over",
};

export const GAME_OUTCOME_LABELS: Record<number, string> = {
  [GameOutcome.None]: "In Progress",
  [GameOutcome.Deal]: "DEAL!",
  [GameOutcome.NoDeal]: "NO DEAL!",
  [GameOutcome.TimeoutResolved]: "Timeout Resolved",
};

export const NUM_CASES = 26;
export const NUM_ROUNDS = 10;

/** Cases to open per round: 6, 5, 4, 3, 2, 1, 1, 1, 1, 1 */
export function casesPerRound(round: number): number {
  if (round === 0) return 6;
  if (round === 1) return 5;
  if (round === 2) return 4;
  if (round === 3) return 3;
  if (round === 4) return 2;
  return 1;
}

/** Show-accurate prize labels (display names for the 26 case tiers) */
export const PRIZE_LABELS = [
  "$0.01",
  "$1",
  "$5",
  "$10",
  "$25",
  "$50",
  "$75",
  "$100",
  "$200",
  "$300",
  "$400",
  "$500",
  "$750",
  "$1K",
  "$5K",
  "$10K",
  "$25K",
  "$50K",
  "$75K",
  "$100K",
  "$200K",
  "$300K",
  "$400K",
  "$500K",
  "$750K",
  "$1M",
];

/** Tier classification for color coding */
export type CaseTier = "Penny" | "Low" | "Mid" | "High" | "Jackpot";

export function getCaseTier(index: number): CaseTier {
  if (index <= 1) return "Penny";
  if (index <= 7) return "Low";
  if (index <= 12) return "Mid";
  if (index <= 19) return "High";
  return "Jackpot";
}

export const TIER_COLORS: Record<CaseTier, string> = {
  Penny: "text-gray-400",
  Low: "text-blue-400",
  Mid: "text-purple-400",
  High: "text-red-400",
  Jackpot: "text-yellow-400",
};

export const TIER_BG_COLORS: Record<CaseTier, string> = {
  Penny: "bg-gray-700",
  Low: "bg-blue-900",
  Mid: "bg-purple-900",
  High: "bg-red-900",
  Jackpot: "bg-yellow-900",
};

/** Minimal ABI for reading jackpot data from factory at a dynamic address */
export const FACTORY_JACKPOT_ABI = [
  {
    type: "function",
    name: "jackpotPool",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "jackpotBps",
    inputs: [],
    outputs: [{ name: "", type: "uint16", internalType: "uint16" }],
    stateMutability: "view",
  },
] as const;

/**
 * BPS distribution matching the contract's _distributePrizePool().
 * NOTE: After the Fisher-Yates shuffle, these BPS values no longer map 1:1 to
 * case indices. Use these for the prize board (showing which dollar labels are
 * still in play) — NOT for determining actual case assignments.
 * Actual case values come from onchain briefcases[i].value after drawWinner().
 */
export const PRIZE_DISTRIBUTION_BPS = [
  1, 1, 2, 3, 7, 14, 21, 28, 56, 83, 111, 139, 208, 278, 556, 695, 834, 973, 1112, 1251, 834, 695, 556, 417, 695, 330,
];
export const TOTAL_BPS = PRIZE_DISTRIBUTION_BPS.reduce((a, b) => a + b, 0);

/**
 * Calculate the deterministic BPS value for a given tier index.
 * Post-shuffle, this does NOT correspond to briefcase[index] — use onchain
 * briefcases[i].value for actual case values. This helper remains useful for
 * generating the sorted prize board labels.
 */
export function getCaseValue(prizePool: bigint, index: number): bigint {
  return (prizePool * BigInt(PRIZE_DISTRIBUTION_BPS[index])) / BigInt(TOTAL_BPS);
}
