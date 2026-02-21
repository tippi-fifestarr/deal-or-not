// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ============ Enums ============

enum GameState {
    Created,
    LotteryOpen,
    LotteryReveal,
    LotteryComplete,
    CaseSelection,
    RoundPlay,
    BankerOffer,
    GameOver
}

enum CaseTier {
    Penny,      // $0.01
    Low,        // $1 - $50
    Mid,        // $75 - $750
    High,       // $5K - $100K
    Jackpot     // $200K - $1M
}

enum GameOutcome {
    None,
    Deal,
    NoDeal,
    TimeoutResolved
}

// ============ Enums ============

enum RandomnessMethod {
    CommitReveal,    // Traditional commit-reveal lottery
    ChainlinkVRF,    // Chainlink VRF for production
    BlockRandomness  // Simple blockhash (for testing only)
}

// ============ Structs ============

struct GameConfig {
    uint256 entryFee;
    uint256 lotteryDuration;
    uint256 revealDuration;
    uint256 turnTimeout;
    uint16 hostFeeBps;        // default 500 (5%)
    uint16 protocolFeeBps;    // default 500 (5%)
    uint16 refundBps;         // 0-8000 (0-80% refund to losers)
    uint8 minPlayers;
    RandomnessMethod randomnessMethod;
}

struct Game {
    address host;
    address contestant;
    GameState state;
    GameOutcome outcome;
    bytes32 merkleRoot;
    uint256 prizePool;
    uint256 currentRound;
    uint256 selectedCase;
    uint256 bankerOffer;
    uint256 lastActionTime;
    uint256 lotteryEndTime;
    uint256 revealEndTime;
    uint256 totalEntries;
    uint256 hostFee;
    uint256 protocolFee;
    GameConfig config;
}

struct LotteryEntry {
    address player;
    bytes32 commitHash;
    bytes32 revealedSecret;
    bool revealed;
    bool refunded;
}

struct BriefcaseData {
    uint256 value;
    bool opened;
    bool revealed;
    address holder;
}

struct ProofData {
    uint256[2] pA;
    uint256[2][2] pB;
    uint256[2] pC;
    uint256[] pubSignals;
}

// ============ Constants ============

uint8 constant NUM_CASES = 26;
uint8 constant MERKLE_DEPTH = 5; // 2^5 = 32 leaves (26 used + 6 padding)
uint8 constant NUM_ROUNDS = 10;

/// @dev Cases to open per round: 6, 5, 4, 3, 2, 1, 1, 1, 1, 1
function casesPerRound(uint256 round) pure returns (uint256) {
    if (round == 0) return 6;
    if (round == 1) return 5;
    if (round == 2) return 4;
    if (round == 3) return 3;
    if (round == 4) return 2;
    return 1; // rounds 5-9
}

/// @dev Show-accurate prize distribution (basis points of prize pool, sums to 10000)
/// Values scaled proportionally to: $0.01, $1, $5, $10, $25, $50, $75, $100,
/// $200, $300, $400, $500, $750, $1K, $5K, $10K, $25K, $50K, $75K, $100K,
/// $200K, $300K, $400K, $500K, $750K, $1M
function prizeDistributionBps(uint256 index) pure returns (uint256) {
    // These sum to 10000 bps (100%)
    // Approximation of the show's distribution scaled to basis points
    if (index == 0) return 1;     // $0.01 equivalent
    if (index == 1) return 1;     // $1
    if (index == 2) return 2;     // $5
    if (index == 3) return 3;     // $10
    if (index == 4) return 7;     // $25
    if (index == 5) return 14;    // $50
    if (index == 6) return 21;    // $75
    if (index == 7) return 28;    // $100
    if (index == 8) return 56;    // $200
    if (index == 9) return 83;    // $300
    if (index == 10) return 111;  // $400
    if (index == 11) return 139;  // $500
    if (index == 12) return 208;  // $750
    if (index == 13) return 278;  // $1K
    if (index == 14) return 556;  // $5K (jump)
    if (index == 15) return 695;  // $10K
    if (index == 16) return 834;  // $25K
    if (index == 17) return 973;  // $50K
    if (index == 18) return 1112; // $75K
    if (index == 19) return 1251; // $100K
    if (index == 20) return 834;  // $200K
    if (index == 21) return 695;  // $300K
    if (index == 22) return 556;  // $400K
    if (index == 23) return 417;  // $500K
    if (index == 24) return 695;  // $750K
    if (index == 25) return 330;  // $1M
    return 0;
}

/// @dev Banker discount per round (basis points). Low-balls early, fair value at end.
function bankerDiscountBps(uint256 round) pure returns (uint256) {
    if (round == 0) return 3000;
    if (round == 1) return 4000;
    if (round == 2) return 5000;
    if (round == 3) return 6000;
    if (round == 4) return 7000;
    if (round == 5) return 8000;
    if (round == 6) return 8500;
    if (round == 7) return 9000;
    if (round == 8) return 9500;
    if (round == 9) return 10000;
    return 10000;
}

/// @dev Map case index to tier for NFT metadata
function caseTier(uint256 index) pure returns (CaseTier) {
    if (index <= 1) return CaseTier.Penny;
    if (index <= 7) return CaseTier.Low;
    if (index <= 12) return CaseTier.Mid;
    if (index <= 19) return CaseTier.High;
    return CaseTier.Jackpot;
}

// ============ Errors ============

error InvalidGameState(GameState expected, GameState actual);
error NotHost();
error NotContestant();
error NotAuthorized();
error GameNotFound();
error LotteryNotOpen();
error LotteryFull();
error RevealWindowClosed();
error RevealWindowNotClosed();
error AlreadyRevealed();
error InvalidCommit();
error InvalidReveal();
error InsufficientEntryFee();
error InvalidCaseIndex();
error CaseAlreadyOpened();
error CaseIsSelected();
error WrongNumberOfCases();
error InvalidProof();
error NoOfferPending();
error OfferExpired();
error TimeoutNotReached();
error GameAlreadyOver();
error ZeroAddress();
error InvalidConfig();
error TransferFailed();
error AlreadyInitialized();
error InvalidPrizeDistribution();
error NotRegisteredGame();
error JackpotEmpty();
error InvalidJackpotBps();
error HostCannotEnterLottery();

// ============ Events ============

event GameCreated(uint256 indexed gameId, address indexed host, bytes32 merkleRoot);
event LotteryOpened(uint256 indexed gameId, uint256 entryFee, uint256 endTime);
event LotteryEntered(uint256 indexed gameId, address indexed player, uint256 entryIndex);
event SecretRevealed(uint256 indexed gameId, address indexed player);
event ContestantSelected(uint256 indexed gameId, address indexed contestant);
event CaseSelected(uint256 indexed gameId, uint256 caseIndex);
event CaseOpened(uint256 indexed gameId, uint256 caseIndex, uint256 value);
event BankerOfferMade(uint256 indexed gameId, uint256 round, uint256 offer);
event DealAccepted(uint256 indexed gameId, uint256 offer);
event DealRejected(uint256 indexed gameId, uint256 round);
event FinalCaseRevealed(uint256 indexed gameId, uint256 caseIndex, uint256 value);
event GameResolved(uint256 indexed gameId, GameOutcome outcome, uint256 payout);
event TimeoutResolved(uint256 indexed gameId, address resolver, uint256 evPayout);
event RefundClaimed(uint256 indexed gameId, address indexed player, uint256 amount);
event JackpotContribution(uint256 indexed gameId, uint256 amount, uint256 newJackpotTotal);
event JackpotWon(uint256 indexed gameId, address indexed winner, uint256 amount);
event JackpotSeeded(address indexed donor, uint256 amount, uint256 newJackpotTotal);
