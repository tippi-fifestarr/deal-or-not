// Auto-generated from CashCase.sol compiled ABI
// Contract: 0x2Db0a160BE59Aea46f33F900651FE819699beb52 (Base Sepolia)
export const CASH_CASE_ABI = [
  {
    type: "constructor",
    inputs: [
      {
        name: "vrfCoordinator",
        type: "address",
        internalType: "address",
      },
      {
        name: "subscriptionId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "keyHash",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "priceFeedAddress",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "receive",
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "BANKER_PERCENTAGES",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint8",
        internalType: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "CASES_PER_ROUND",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint8",
        internalType: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ENTRY_FEE_CENTS",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "HIGH_VALUES",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_CASE_BY_TIER",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MICRO_VALUES",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "NUM_CASES",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint8",
        internalType: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "NUM_ROUNDS",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint8",
        internalType: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "SLIPPAGE_BPS",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "STANDARD_VALUES",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "acceptDeal",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "acceptOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "activeBankerGames",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "admin",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "calculateBankerOffer",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "commitFinalDecision",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "_commitHash",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "commitRound",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "_commitHash",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createGame",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "createGame",
    inputs: [
      {
        name: "tier",
        type: "uint8",
        internalType: "enum CashCase.GameTier",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "enforceBankerCheck",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "forfeitGame",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "games",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "banker",
        type: "address",
        internalType: "address",
      },
      {
        name: "phase",
        type: "uint8",
        internalType: "enum CashCase.GamePhase",
      },
      {
        name: "tier",
        type: "uint8",
        internalType: "enum CashCase.GameTier",
      },
      {
        name: "playerCaseIndex",
        type: "uint8",
        internalType: "uint8",
      },
      {
        name: "currentRound",
        type: "uint8",
        internalType: "uint8",
      },
      {
        name: "totalOpened",
        type: "uint8",
        internalType: "uint8",
      },
      {
        name: "player",
        type: "address",
        internalType: "address",
      },
      {
        name: "vrfSeed",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "caseValues",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "openedBitmap",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "usedValuesBitmap",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "commitHash",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "commitBlock",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "vrfRequestId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "bankerOffer",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "finalPayout",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "bankerDeposit",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "entryDeposit",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBettingOutcome",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "dealTaken",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "playerCaseHigh",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "playerCaseValue",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "finalPayout",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCaseValue",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "caseIndex",
        type: "uint8",
        internalType: "uint8",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCommitState",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "commitBlock",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "commitHash",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getEthUsdPrice",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "int256",
        internalType: "int256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getGameState",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "banker",
        type: "address",
        internalType: "address",
      },
      {
        name: "player",
        type: "address",
        internalType: "address",
      },
      {
        name: "phase",
        type: "uint8",
        internalType: "enum CashCase.GamePhase",
      },
      {
        name: "playerCaseIndex",
        type: "uint8",
        internalType: "uint8",
      },
      {
        name: "currentRound",
        type: "uint8",
        internalType: "uint8",
      },
      {
        name: "totalOpened",
        type: "uint8",
        internalType: "uint8",
      },
      {
        name: "openedBitmap",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "bankerOffer",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "finalPayout",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "tier",
        type: "uint8",
        internalType: "enum CashCase.GameTier",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRemainingValues",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256[]",
        internalType: "uint256[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "joinGame",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "_commitHash",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "nextGameId",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "priceFeed",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract AggregatorV3Interface",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "rawFulfillRandomWords",
    inputs: [
      {
        name: "requestId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "randomWords",
        type: "uint256[]",
        internalType: "uint256[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rejectDeal",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revealCase",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "caseIndex",
        type: "uint8",
        internalType: "uint8",
      },
      {
        name: "salt",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revealFinalDecision",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "swap",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "salt",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revealRound",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "caseIndices",
        type: "uint8[]",
        internalType: "uint8[]",
      },
      {
        name: "salt",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "s_callbackGasLimit",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint32",
        internalType: "uint32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "s_keyHash",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "s_requestConfirmations",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "s_subscriptionId",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "s_vrfCoordinator",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IVRFCoordinatorV2Plus",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setCoordinator",
    inputs: [
      {
        name: "_vrfCoordinator",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setEnforceBankerCheck",
    inputs: [
      {
        name: "_enforce",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setKeyHash",
    inputs: [
      {
        name: "_keyHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setSubscriptionId",
    inputs: [
      {
        name: "_subscriptionId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      {
        name: "to",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "usdToWei",
    inputs: [
      {
        name: "usdCents",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "vrfRequestToGame",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "BankerOfferMade",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "usdCentsOffer",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "CaseOpened",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "caseIndex",
        type: "uint8",
        indexed: false,
        internalType: "uint8",
      },
      {
        name: "usdCentsValue",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "CaseRevealed",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "caseIndex",
        type: "uint8",
        indexed: false,
        internalType: "uint8",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "CoordinatorSet",
    inputs: [
      {
        name: "vrfCoordinator",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DealAccepted",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "usdCentsPayout",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "weiPayout",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DealRejected",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "FinalCommitted",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "GameCreated",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "banker",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "tier",
        type: "uint8",
        indexed: false,
        internalType: "enum CashCase.GameTier",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "GameEnded",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "usdCentsPayout",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "weiPayout",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "swapped",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "GameForfeited",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "banker",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "GameJoined",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "player",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OwnershipTransferRequested",
    inputs: [
      {
        name: "from",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "to",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "from",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "to",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RoundCommitted",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "round",
        type: "uint8",
        indexed: false,
        internalType: "uint8",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SeedRevealed",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "CannotForfeit",
    inputs: [],
  },
  {
    type: "error",
    name: "CannotOpenOwnCase",
    inputs: [],
  },
  {
    type: "error",
    name: "CaseAlreadyOpened",
    inputs: [
      {
        name: "index",
        type: "uint8",
        internalType: "uint8",
      },
    ],
  },
  {
    type: "error",
    name: "GameNotOpen",
    inputs: [],
  },
  {
    type: "error",
    name: "InsufficientDeposit",
    inputs: [
      {
        name: "required",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "sent",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidCaseIndex",
    inputs: [
      {
        name: "index",
        type: "uint8",
        internalType: "uint8",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidReveal",
    inputs: [],
  },
  {
    type: "error",
    name: "MustBeBanker",
    inputs: [],
  },
  {
    type: "error",
    name: "NotBanker",
    inputs: [
      {
        name: "caller",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "NotPlayer",
    inputs: [
      {
        name: "caller",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "OnlyCoordinatorCanFulfill",
    inputs: [
      {
        name: "have",
        type: "address",
        internalType: "address",
      },
      {
        name: "want",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "OnlyOwnerOrCoordinator",
    inputs: [
      {
        name: "have",
        type: "address",
        internalType: "address",
      },
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
      {
        name: "coordinator",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "RevealWindowActive",
    inputs: [],
  },
  {
    type: "error",
    name: "RevealWindowExpired",
    inputs: [],
  },
  {
    type: "error",
    name: "StalePriceFeed",
    inputs: [],
  },
  {
    type: "error",
    name: "TooEarlyToReveal",
    inputs: [],
  },
  {
    type: "error",
    name: "TransferFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "WrongNumberOfCases",
    inputs: [
      {
        name: "expected",
        type: "uint8",
        internalType: "uint8",
      },
      {
        name: "got",
        type: "uint8",
        internalType: "uint8",
      },
    ],
  },
  {
    type: "error",
    name: "WrongPhase",
    inputs: [
      {
        name: "expected",
        type: "uint8",
        internalType: "enum CashCase.GamePhase",
      },
      {
        name: "actual",
        type: "uint8",
        internalType: "enum CashCase.GamePhase",
      },
    ],
  },
  {
    type: "error",
    name: "ZeroAddress",
    inputs: [],
  },
] as const;

// ─── Contract Address ───────────────────────────────────────────────────────
export const CASH_CASE_ADDRESS = "0x2Db0a160BE59Aea46f33F900651FE819699beb52" as const;

// ─── Game Phases ────────────────────────────────────────────────────────────
export enum CashCasePhase {
  WaitingForPlayer = 0,
  WaitingForVRF = 1,
  RevealCase = 2,
  CommitRound = 3,
  WaitingForReveal = 4,
  BankerOffer = 5,
  CommitFinal = 6,
  WaitingForFinalReveal = 7,
  GameOver = 8,
}

export enum GameTier {
  MICRO = 0,
  STANDARD = 1,
  HIGH = 2,
}

// ─── Constants ──────────────────────────────────────────────────────────────
export const NUM_CASES = 12;
export const NUM_ROUNDS = 5;
export const CASES_PER_ROUND = [4, 3, 2, 1, 1];
export const BANKER_PERCENTAGES = [15, 30, 45, 65, 85];

export const TIER_VALUES: Record<number, number[]> = {
  [GameTier.MICRO]: [1, 2, 5, 10, 25, 50, 75, 100, 150, 200, 350, 500],
  [GameTier.STANDARD]: [1, 5, 10, 25, 50, 100, 200, 300, 400, 500, 750, 1000],
  [GameTier.HIGH]: [10, 50, 100, 250, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000],
};

export const MAX_CASE_BY_TIER = [500, 1000, 5000]; // USD cents

export const PHASE_LABELS: Record<number, string> = {
  [CashCasePhase.WaitingForPlayer]: "Waiting for Player",
  [CashCasePhase.WaitingForVRF]: "Waiting for VRF",
  [CashCasePhase.RevealCase]: "Reveal Your Case",
  [CashCasePhase.CommitRound]: "Choose Cases to Open",
  [CashCasePhase.WaitingForReveal]: "Brödinger's Collapse...",
  [CashCasePhase.BankerOffer]: "Banker's Offer",
  [CashCasePhase.CommitFinal]: "Final Decision",
  [CashCasePhase.WaitingForFinalReveal]: "Revealing Fate...",
  [CashCasePhase.GameOver]: "Game Over",
};

export const TIER_LABELS: Record<number, string> = {
  [GameTier.MICRO]: "Micro ($0.01–$5)",
  [GameTier.STANDARD]: "Standard ($0.01–$10)",
  [GameTier.HIGH]: "High ($0.10–$50)",
};

// ─── Video clips for commit-reveal wait ─────────────────────────────────────
export const WAIT_VIDEOS = [
  "/videos/clip-1.mp4",
  "/videos/clip-2.mp4",
  "/videos/clip-3.mp4",
  "/videos/clip-4.mp4",
  "/videos/clip-5.mp4",
  "/videos/clip-6.mp4",
];
