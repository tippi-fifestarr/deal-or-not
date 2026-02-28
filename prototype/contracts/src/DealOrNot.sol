// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {BankerAlgorithm} from "./BankerAlgorithm.sol";

/// @title Deal or NOT — Quantum Case Prototype (5 Cases)
/// @notice On-chain Deal or No Deal with Chainlink VRF + Price Feeds.
/// @dev Cases have no values until opened — Brodinger's Case powered by VRF.
///      "Does Howie know what's in the box? Not anymore."
contract DealOrNot is VRFConsumerBaseV2Plus {
    using BankerAlgorithm for uint256[];

    // ── Constants ──
    uint8 public constant NUM_CASES = 5;
    uint8 public constant NUM_ROUNDS = 4;
    uint256[5] public CASE_VALUES_CENTS = [1, 5, 10, 50, 100]; // $0.01 → $1.00

    // ── Chainlink Config ──
    AggregatorV3Interface public immutable priceFeed;
    uint256 public s_subscriptionId;
    bytes32 public s_keyHash;
    uint32 public s_callbackGasLimit = 200000;
    uint16 public s_requestConfirmations = 1;

    // ── Enums ──
    enum GameMode { SinglePlayer, MultiPlayer }
    enum Phase {
        WaitingForVRF,   // 0: VRF requested, waiting for quantum seed
        Created,         // 1: seed received, pick your case
        Round,           // 2: open a case this round
        AwaitingOffer,   // 3: case opened, waiting for banker
        BankerOffer,     // 4: offer on the table — DEAL or NO DEAL?
        FinalSwap,       // 5: last case vs yours — swap or keep?
        GameOver         // 6: done
    }

    // ── Structs ──
    struct Banker {
        bool isAllowed;
        bool isContract;  // CRE bot, agent, future AI
        bool isHuman;     // verified human (future attestation)
        bool isBanned;
    }

    struct Game {
        address host;
        address player;
        GameMode mode;
        Phase phase;
        uint8 playerCase;
        uint8 currentRound;
        uint8 totalCollapsed;        // how many values assigned from pool
        uint256 bankerOffer;         // current offer in USD cents
        uint256 finalPayout;         // final payout in USD cents
        uint256 ethPerDollar;        // ETH per $1 at game creation (18 dec)
        uint256 vrfRequestId;
        uint256 vrfSeed;             // quantum seed from VRF
        uint256 usedValuesBitmap;    // which value indices (0-4) have been assigned
        uint256[5] caseValues;       // collapsed values (0 = still in superposition)
        bool[5] opened;              // which cases have been opened/revealed
    }

    // ── State ──
    mapping(uint256 => Game) internal _games;
    mapping(uint256 => mapping(address => Banker)) public gameBankers;
    mapping(uint256 => uint256) public vrfRequestToGame;
    uint256 public nextGameId;

    // ── Events ──
    event GameCreated(uint256 indexed gameId, address indexed host, GameMode mode);
    event VRFSeedReceived(uint256 indexed gameId);
    event CasePicked(uint256 indexed gameId, uint8 caseIndex);
    event CaseCollapsed(uint256 indexed gameId, uint8 caseIndex, uint256 valueCents);
    event RoundComplete(uint256 indexed gameId, uint8 round);
    event BankerAdded(uint256 indexed gameId, address indexed banker, bool isContract);
    event BankerBanned(uint256 indexed gameId, address indexed banker);
    event BankerOfferMade(uint256 indexed gameId, uint8 round, uint256 offerCents);
    event DealAccepted(uint256 indexed gameId, uint256 payoutCents);
    event DealRejected(uint256 indexed gameId, uint8 round);
    event GameResolved(uint256 indexed gameId, uint256 payoutCents, bool swapped);
    event FundsRescued(address indexed to, uint256 amount);

    // ── Errors ──
    error WrongPhase(Phase expected, Phase actual);
    error NotHost();
    error NotPlayer();
    error NotAllowedBanker();
    error InvalidCase(uint8 index);
    error CaseAlreadyOpened(uint8 index);
    error CannotOpenOwnCase();
    error NoFundsToRescue();
    error TransferFailed();

    // ── Constructor ──
    constructor(
        address _vrfCoordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash,
        address _priceFeed
    ) VRFConsumerBaseV2Plus(_vrfCoordinator) {
        s_subscriptionId = _subscriptionId;
        s_keyHash = _keyHash;
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    // ════════════════════════════════════════════════════════
    //                    GAME CREATION
    // ════════════════════════════════════════════════════════

    /// @notice Create a single-player game. Requests VRF for quantum seed.
    function createGame() external returns (uint256 gameId) {
        gameId = nextGameId++;
        Game storage g = _games[gameId];
        g.host = msg.sender;
        g.player = msg.sender; // single player: host == player
        g.mode = GameMode.SinglePlayer;
        g.phase = Phase.WaitingForVRF;

        // Snapshot ETH/USD price
        (, int256 price,,,) = priceFeed.latestRoundData();
        g.ethPerDollar = 1e26 / uint256(price);

        // Request VRF seed
        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: s_keyHash,
                subId: s_subscriptionId,
                requestConfirmations: s_requestConfirmations,
                callbackGasLimit: s_callbackGasLimit,
                numWords: 1,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: false})
                )
            })
        );

        g.vrfRequestId = requestId;
        vrfRequestToGame[requestId] = gameId;

        // Host is automatically an allowed human banker for their own game
        gameBankers[gameId][msg.sender] = Banker({
            isAllowed: true,
            isContract: false,
            isHuman: true,
            isBanned: false
        });

        emit GameCreated(gameId, msg.sender, GameMode.SinglePlayer);
    }

    // ════════════════════════════════════════════════════════
    //                    VRF CALLBACK
    // ════════════════════════════════════════════════════════

    /// @dev Called by VRF Coordinator. Stores quantum seed, game is ready.
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        uint256 gameId = vrfRequestToGame[requestId];
        Game storage g = _games[gameId];
        g.vrfSeed = randomWords[0];
        g.phase = Phase.Created;
        emit VRFSeedReceived(gameId);
    }

    // ════════════════════════════════════════════════════════
    //                 BANKER MANAGEMENT
    // ════════════════════════════════════════════════════════

    /// @notice Host adds a banker to their game.
    function addBanker(uint256 gameId, address banker, bool isContract, bool isHuman) external {
        if (msg.sender != _games[gameId].host) revert NotHost();
        gameBankers[gameId][banker] = Banker({
            isAllowed: true,
            isContract: isContract,
            isHuman: isHuman,
            isBanned: false
        });
        emit BankerAdded(gameId, banker, isContract);
    }

    /// @notice Host bans a banker from their game.
    function banBanker(uint256 gameId, address banker) external {
        if (msg.sender != _games[gameId].host) revert NotHost();
        gameBankers[gameId][banker].isBanned = true;
        emit BankerBanned(gameId, banker);
    }

    // ════════════════════════════════════════════════════════
    //                    GAME PLAY
    // ════════════════════════════════════════════════════════

    /// @notice Pick your case (0-4). Case value is unknown — quantum superposition.
    function pickCase(uint256 gameId, uint8 caseIndex) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.Created);
        if (caseIndex >= NUM_CASES) revert InvalidCase(caseIndex);

        g.playerCase = caseIndex;
        g.phase = Phase.Round;

        emit CasePicked(gameId, caseIndex);
    }

    /// @notice Open a case. Triggers quantum collapse — value assigned from remaining pool via VRF seed.
    function openCase(uint256 gameId, uint8 caseIndex) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.Round);
        if (caseIndex >= NUM_CASES) revert InvalidCase(caseIndex);
        if (caseIndex == g.playerCase) revert CannotOpenOwnCase();
        if (g.opened[caseIndex]) revert CaseAlreadyOpened(caseIndex);

        // Quantum collapse
        uint256 value = _collapseCase(g, caseIndex);
        g.caseValues[caseIndex] = value;
        g.opened[caseIndex] = true;

        emit CaseCollapsed(gameId, caseIndex, value);

        // Check remaining unopened non-player cases
        uint8 remaining = _countRemaining(g);
        if (remaining == 1) {
            g.phase = Phase.FinalSwap;
        } else {
            g.phase = Phase.AwaitingOffer;
        }
        emit RoundComplete(gameId, g.currentRound);
    }

    /// @notice Banker sets offer. Must be an allowed, non-banned banker for this game.
    function setBankerOffer(uint256 gameId, uint256 offerCents) external {
        Game storage g = _games[gameId];
        _requirePhase(g, Phase.AwaitingOffer);
        Banker storage b = gameBankers[gameId][msg.sender];
        if (!b.isAllowed || b.isBanned) revert NotAllowedBanker();

        g.bankerOffer = offerCents;
        g.phase = Phase.BankerOffer;

        emit BankerOfferMade(gameId, g.currentRound, offerCents);
    }

    /// @notice DEAL — accept the banker's offer. Game over.
    function acceptDeal(uint256 gameId) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.BankerOffer);

        g.finalPayout = g.bankerOffer;
        g.phase = Phase.GameOver;

        // Collapse all remaining cases for the big reveal
        _collapseAllRemaining(g);

        emit DealAccepted(gameId, g.bankerOffer);
        emit GameResolved(gameId, g.finalPayout, false);
    }

    /// @notice NO DEAL — reject and move to next round.
    function rejectDeal(uint256 gameId) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.BankerOffer);

        emit DealRejected(gameId, g.currentRound);

        g.currentRound++;
        g.bankerOffer = 0;
        g.phase = Phase.Round;
    }

    /// @notice Final decision: swap your case with the last remaining, or keep.
    function finalDecision(uint256 gameId, bool swap) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.FinalSwap);

        // Collapse the last remaining case
        uint8 lastCase = _findLastCase(g);
        uint256 lastValue = _collapseCase(g, lastCase);
        g.caseValues[lastCase] = lastValue;

        // Collapse player's own case
        uint256 playerValue = _collapseCase(g, g.playerCase);
        g.caseValues[g.playerCase] = playerValue;

        g.finalPayout = swap ? lastValue : playerValue;
        g.phase = Phase.GameOver;

        emit GameResolved(gameId, g.finalPayout, swap);
    }

    // ════════════════════════════════════════════════════════
    //                  VIEW FUNCTIONS
    // ════════════════════════════════════════════════════════

    /// @notice On-chain banker offer calculation (simple EV * discount).
    function calculateBankerOffer(uint256 gameId) external view returns (uint256) {
        Game storage g = _games[gameId];
        uint256[] memory pool = _getRemainingValuePool(g);
        return pool.calculateOffer(g.currentRound);
    }

    /// @notice On-chain banker offer with variance + psychology.
    function calculateBankerOfferFull(uint256 gameId) external view returns (uint256) {
        Game storage g = _games[gameId];
        uint256[] memory pool = _getRemainingValuePool(g);
        uint256[] memory fullPool = _getFullValuePool();
        uint256 initialEV = fullPool.expectedValue();
        return pool.calculateOfferWithVariance(
            g.currentRound, initialEV, bytes32(g.vrfSeed)
        );
    }

    /// @notice Values still in the quantum pool (not yet collapsed).
    function getRemainingValuePool(uint256 gameId) external view returns (uint256[] memory) {
        return _getRemainingValuePool(_games[gameId]);
    }

    /// @notice Full game state.
    function getGameState(uint256 gameId) external view returns (
        address host,
        address player,
        uint8 mode,
        uint8 phase,
        uint8 playerCase,
        uint8 currentRound,
        uint8 totalCollapsed,
        uint256 bankerOffer,
        uint256 finalPayout,
        uint256 ethPerDollar,
        uint256[5] memory caseValues,
        bool[5] memory opened
    ) {
        Game storage g = _games[gameId];
        return (
            g.host,
            g.player,
            uint8(g.mode),
            uint8(g.phase),
            g.playerCase,
            g.currentRound,
            g.totalCollapsed,
            g.bankerOffer,
            g.finalPayout,
            g.ethPerDollar,
            g.caseValues,
            g.opened
        );
    }

    /// @notice Get banker info for a game.
    function getBanker(uint256 gameId, address banker) external view returns (
        bool isAllowed, bool isContract, bool isHuman, bool isBanned
    ) {
        Banker storage b = gameBankers[gameId][banker];
        return (b.isAllowed, b.isContract, b.isHuman, b.isBanned);
    }

    /// @notice Convert USD cents to ETH wei using game's snapshot price.
    function centsToWei(uint256 gameId, uint256 cents) external view returns (uint256) {
        return (cents * _games[gameId].ethPerDollar) / 100;
    }

    // ════════════════════════════════════════════════════════
    //                  RESCUE / ADMIN
    // ════════════════════════════════════════════════════════

    /// @notice Owner can rescue any ETH stuck in contract.
    function rescueETH(address to) external onlyOwner {
        uint256 bal = address(this).balance;
        if (bal == 0) revert NoFundsToRescue();
        (bool ok,) = to.call{value: bal}("");
        if (!ok) revert TransferFailed();
        emit FundsRescued(to, bal);
    }

    /// @notice Owner can update VRF config.
    function setVRFConfig(
        uint256 subscriptionId,
        bytes32 keyHash,
        uint32 callbackGasLimit,
        uint16 requestConfirmations
    ) external onlyOwner {
        s_subscriptionId = subscriptionId;
        s_keyHash = keyHash;
        s_callbackGasLimit = callbackGasLimit;
        s_requestConfirmations = requestConfirmations;
    }

    receive() external payable {}

    // ════════════════════════════════════════════════════════
    //                QUANTUM COLLAPSE ENGINE
    // ════════════════════════════════════════════════════════

    /// @dev Collapse a case: assign a random value from the remaining pool.
    ///      Uses VRF seed + case index + collapse count for deterministic randomness.
    ///      Values don't exist until this function runs — Brodinger's Case.
    function _collapseCase(Game storage g, uint8 caseIndex) internal returns (uint256) {
        // Count remaining unused values in the pool
        uint8 remaining = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((g.usedValuesBitmap & (1 << i)) == 0) remaining++;
        }

        // Deterministic random pick from VRF seed
        uint256 pick = uint256(keccak256(abi.encodePacked(
            g.vrfSeed, caseIndex, g.totalCollapsed
        ))) % remaining;

        // Walk unused values to find the picked one
        uint8 count = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((g.usedValuesBitmap & (1 << i)) == 0) {
                if (count == pick) {
                    g.usedValuesBitmap |= (1 << i);
                    g.totalCollapsed++;
                    return CASE_VALUES_CENTS[i];
                }
                count++;
            }
        }
        revert("no values remaining");
    }

    /// @dev Collapse all remaining cases (for post-deal reveal).
    function _collapseAllRemaining(Game storage g) internal {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (!g.opened[i] && i != g.playerCase && g.caseValues[i] == 0) {
                g.caseValues[i] = _collapseCase(g, i);
            }
        }
        // Also collapse player's case
        if (g.caseValues[g.playerCase] == 0) {
            g.caseValues[g.playerCase] = _collapseCase(g, g.playerCase);
        }
    }

    /// @dev Get values still in the quantum pool (uncollapsed).
    function _getRemainingValuePool(Game storage g) internal view returns (uint256[] memory) {
        uint8 count = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((g.usedValuesBitmap & (1 << i)) == 0) count++;
        }
        uint256[] memory vals = new uint256[](count);
        uint8 idx = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((g.usedValuesBitmap & (1 << i)) == 0) {
                vals[idx++] = CASE_VALUES_CENTS[i];
            }
        }
        return vals;
    }

    /// @dev Full value pool (for initial EV calculation).
    function _getFullValuePool() internal view returns (uint256[] memory) {
        uint256[] memory vals = new uint256[](NUM_CASES);
        for (uint8 i = 0; i < NUM_CASES; i++) {
            vals[i] = CASE_VALUES_CENTS[i];
        }
        return vals;
    }

    /// @dev Count remaining unopened non-player cases.
    function _countRemaining(Game storage g) internal view returns (uint8 count) {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (i != g.playerCase && !g.opened[i]) count++;
        }
    }

    /// @dev Find the last unopened non-player case.
    function _findLastCase(Game storage g) internal view returns (uint8) {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (i != g.playerCase && !g.opened[i]) return i;
        }
        revert("no case found");
    }

    function _requirePlayer(Game storage g) internal view {
        if (msg.sender != g.player) revert NotPlayer();
    }

    function _requirePhase(Game storage g, Phase expected) internal view {
        if (g.phase != expected) revert WrongPhase(expected, g.phase);
    }
}
