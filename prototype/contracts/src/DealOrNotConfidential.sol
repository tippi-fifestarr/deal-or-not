// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {BankerAlgorithm} from "./BankerAlgorithm.sol";

/// @title Deal or NOT — Confidential Quantum Case (Phase 3)
/// @notice On-chain Deal or No Deal with Chainlink VRF + Price Feeds + Functions (Confidential Compute).
/// @dev Case values are threshold-encrypted in DON secrets, revealed via Chainlink Functions.
///
///      PHASE 3 UPGRADE: CONFIDENTIAL CASE VALUES
///      - Case values DON'T exist on-chain until revealed
///      - Values stored as DON-hosted encrypted secrets
///      - Chainlink Functions performs threshold decryption
///      - No single node can decrypt alone (DON consensus)
///
///      "Does Howie know what's in the box? The DON does. But no single node does."
contract DealOrNotConfidential is VRFConsumerBaseV2Plus, FunctionsClient {
    using BankerAlgorithm for uint256[];
    using FunctionsRequest for FunctionsRequest.Request;

    // ── Constants ──
    uint8 public constant NUM_CASES = 5;
    uint8 public constant NUM_ROUNDS = 4;
    uint256 public constant REVEAL_WINDOW = 256;
    uint256[5] public CASE_VALUES_CENTS = [1, 5, 10, 50, 100]; // Reference values

    // ── Chainlink VRF Config ──
    AggregatorV3Interface public immutable priceFeed;
    uint256 public s_subscriptionId;
    bytes32 public s_keyHash;
    uint32 public s_callbackGasLimit = 200000;
    uint16 public s_requestConfirmations = 1;

    // ── Chainlink Functions Config ──
    uint64 public s_functionsSubscriptionId;
    uint32 public s_functionsGasLimit = 300000;
    bytes32 public s_donId;
    string public s_functionsSource; // JavaScript source code

    // ── CRE Phase 2: Auto-Reveal ──
    address public keystoneForwarder;
    bool public autoRevealEnabled;

    // ── Enums ──
    enum GameMode { SinglePlayer, MultiPlayer }
    enum Phase {
        WaitingForVRF,         // 0: VRF requested
        Created,               // 1: seed received, pick case
        Round,                 // 2: commit case to open
        WaitingForReveal,      // 3: committed, waiting
        RequestingValue,       // 4: Functions request sent
        AwaitingOffer,         // 5: value revealed, awaiting banker
        BankerOffer,           // 6: offer made
        CommitFinal,           // 7: final decision
        WaitingForFinalReveal, // 8: final committed
        RequestingFinalValue,  // 9: Functions request for final
        GameOver               // 10: done
    }

    // ── Structs ──
    struct Banker {
        bool isAllowed;
        bool isContract;
        bool isHuman;
        bool isBanned;
    }

    struct Game {
        address host;
        address player;
        GameMode mode;
        Phase phase;
        uint8 playerCase;
        uint8 currentRound;
        uint8 totalCollapsed;
        uint256 bankerOffer;
        uint256 finalPayout;
        uint256 ethPerDollar;
        uint256 vrfRequestId;
        uint256 vrfSeed;
        uint256 usedValuesBitmap;
        uint256 commitHash;
        uint256 commitBlock;
        uint256[5] caseValues;       // Revealed values (0 = not revealed)
        bool[5] opened;
        bytes32 functionsRequestId;  // PHASE 3: Functions request for reveal
        uint8 pendingCaseIndex;      // PHASE 3: Which case is being revealed
    }

    // ── State ──
    mapping(uint256 => Game) internal _games;
    mapping(uint256 => mapping(address => Banker)) public gameBankers;
    mapping(uint256 => uint256) public vrfRequestToGame;
    mapping(bytes32 => uint256) public functionsRequestToGame; // PHASE 3
    uint256 public nextGameId;

    // ── Events ──
    event GameCreated(uint256 indexed gameId, address indexed host, GameMode mode);
    event VRFSeedReceived(uint256 indexed gameId);
    event CasePicked(uint256 indexed gameId, uint8 caseIndex);
    event CaseCommitted(uint256 indexed gameId, uint8 round);
    event CaseRevealRequested(uint256 indexed gameId, uint8 caseIndex, bytes32 requestId); // PHASE 3
    event CaseCollapsed(uint256 indexed gameId, uint8 caseIndex, uint256 valueCents);
    event RoundComplete(uint256 indexed gameId, uint8 round);
    event BankerAdded(uint256 indexed gameId, address indexed banker, bool isContract);
    event BankerBanned(uint256 indexed gameId, address indexed banker);
    event BankerOfferMade(uint256 indexed gameId, uint8 round, uint256 offerCents);
    event DealAccepted(uint256 indexed gameId, uint256 payoutCents);
    event DealRejected(uint256 indexed gameId, uint8 round);
    event FinalCommitted(uint256 indexed gameId);
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
    error TooEarlyToReveal();
    error RevealWindowExpired();
    error InvalidReveal();
    error NoFundsToRescue();
    error TransferFailed();
    error NotAuthorizedRevealer();
    error FunctionsRequestFailed(bytes error);

    // ── Constructor ──
    constructor(
        address _vrfCoordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash,
        address _priceFeed,
        address _functionsRouter,
        uint64 _functionsSubscriptionId,
        bytes32 _donId
    )
        VRFConsumerBaseV2Plus(_vrfCoordinator)
        FunctionsClient(_functionsRouter)
    {
        s_subscriptionId = _subscriptionId;
        s_keyHash = _keyHash;
        priceFeed = AggregatorV3Interface(_priceFeed);
        s_functionsSubscriptionId = _functionsSubscriptionId;
        s_donId = _donId;
    }

    // ════════════════════════════════════════════════════════
    //                    GAME CREATION
    // ════════════════════════════════════════════════════════

    /// @notice Create a single-player game. Requests VRF for quantum seed.
    ///         PHASE 3: Case values are stored off-chain as DON secrets.
    function createGame() external returns (uint256 gameId) {
        gameId = nextGameId++;
        Game storage g = _games[gameId];
        g.host = msg.sender;
        g.player = msg.sender;
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

        // Host is allowed banker
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

    /// @dev Called by VRF Coordinator.
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

    /// @notice Host bans a banker.
    function banBanker(uint256 gameId, address banker) external {
        if (msg.sender != _games[gameId].host) revert NotHost();
        gameBankers[gameId][banker].isBanned = true;
        emit BankerBanned(gameId, banker);
    }

    // ════════════════════════════════════════════════════════
    //                    GAME PLAY
    // ════════════════════════════════════════════════════════

    /// @notice Pick your case (0-4).
    function pickCase(uint256 gameId, uint8 caseIndex) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.Created);
        if (caseIndex >= NUM_CASES) revert InvalidCase(caseIndex);

        g.playerCase = caseIndex;
        g.phase = Phase.Round;

        emit CasePicked(gameId, caseIndex);
    }

    /// @notice COMMIT: Hash(caseIndex, salt).
    function commitCase(uint256 gameId, uint256 _commitHash) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.Round);

        g.commitHash = _commitHash;
        g.commitBlock = block.number;
        g.phase = Phase.WaitingForReveal;

        emit CaseCommitted(gameId, g.currentRound);
    }

    /// @notice REVEAL: Request Chainlink Functions to decrypt case value.
    ///         PHASE 3: Instead of collapsing on-chain, we request DON decryption.
    function revealCase(uint256 gameId, uint8 caseIndex, uint256 salt) external returns (bytes32 requestId) {
        Game storage g = _games[gameId];
        _requirePlayerOrForwarder(g);
        _requirePhase(g, Phase.WaitingForReveal);
        if (block.number <= g.commitBlock) revert TooEarlyToReveal();
        if (block.number - g.commitBlock > REVEAL_WINDOW) revert RevealWindowExpired();

        // Verify commitment
        uint256 expectedHash = uint256(keccak256(abi.encodePacked(caseIndex, salt)));
        if (expectedHash != g.commitHash) revert InvalidReveal();

        // Validate case
        if (caseIndex >= NUM_CASES) revert InvalidCase(caseIndex);
        if (caseIndex == g.playerCase) revert CannotOpenOwnCase();
        if (g.opened[caseIndex]) revert CaseAlreadyOpened(caseIndex);

        // PHASE 3: Request case value from Chainlink Functions
        requestId = _requestCaseValue(gameId, caseIndex);
        g.functionsRequestId = requestId;
        g.pendingCaseIndex = caseIndex;
        g.phase = Phase.RequestingValue;

        emit CaseRevealRequested(gameId, caseIndex, requestId);
    }

    /// @dev Request case value from Chainlink Functions DON.
    function _requestCaseValue(uint256 gameId, uint8 caseIndex) internal returns (bytes32) {
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(s_functionsSource);

        // Arguments: gameId, caseIndex
        string[] memory args = new string[](2);
        args[0] = _uint2str(gameId);
        args[1] = _uint2str(caseIndex);
        req.setArgs(args);

        bytes32 requestId = _sendRequest(
            req.encodeCBOR(),
            s_functionsSubscriptionId,
            s_functionsGasLimit,
            s_donId
        );

        functionsRequestToGame[requestId] = gameId;
        return requestId;
    }

    /// @dev Chainlink Functions callback with decrypted case value.
    function fulfillRequest(bytes32 requestId, bytes memory response, bytes memory err) internal override {
        uint256 gameId = functionsRequestToGame[requestId];
        Game storage g = _games[gameId];

        if (err.length > 0) {
            // Functions request failed, revert to reveal phase
            g.phase = Phase.WaitingForReveal;
            revert FunctionsRequestFailed(err);
        }

        // Decode case value from response
        uint256 valueCents = abi.decode(response, (uint256));
        uint8 caseIndex = g.pendingCaseIndex;

        // Assign value
        g.caseValues[caseIndex] = valueCents;
        g.opened[caseIndex] = true;
        g.totalCollapsed++;

        // Mark value as used in bitmap
        _markValueUsed(g, valueCents);

        emit CaseCollapsed(gameId, caseIndex, valueCents);

        // Check remaining unopened non-player cases
        uint8 remaining = _countRemaining(g);
        if (remaining == 1) {
            g.phase = Phase.CommitFinal;
        } else {
            g.phase = Phase.AwaitingOffer;
        }
        emit RoundComplete(gameId, g.currentRound);
    }

    /// @dev Mark a value as used in the bitmap (for EV calculation).
    function _markValueUsed(Game storage g, uint256 value) internal {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (CASE_VALUES_CENTS[i] == value && (g.usedValuesBitmap & (1 << i)) == 0) {
                g.usedValuesBitmap |= (1 << i);
                return;
            }
        }
    }

    /// @notice Banker sets offer.
    function setBankerOffer(uint256 gameId, uint256 offerCents) external {
        Game storage g = _games[gameId];
        _requirePhase(g, Phase.AwaitingOffer);
        Banker storage b = gameBankers[gameId][msg.sender];
        if (!b.isAllowed || b.isBanned) revert NotAllowedBanker();

        g.bankerOffer = offerCents;
        g.phase = Phase.BankerOffer;

        emit BankerOfferMade(gameId, g.currentRound, offerCents);
    }

    /// @notice DEAL — accept the banker's offer.
    function acceptDeal(uint256 gameId) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.BankerOffer);

        g.finalPayout = g.bankerOffer;
        g.phase = Phase.GameOver;

        // Note: In Phase 3, we don't collapse remaining cases on-chain
        // They remain encrypted in the DON. Could add optional reveal workflow.

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

    /// @notice COMMIT final decision: swap or keep.
    function commitFinalDecision(uint256 gameId, uint256 _commitHash) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.CommitFinal);

        g.commitHash = _commitHash;
        g.commitBlock = block.number;
        g.phase = Phase.WaitingForFinalReveal;

        emit FinalCommitted(gameId);
    }

    /// @notice REVEAL final decision: Request Functions to reveal both cases.
    ///         PHASE 3: Reveals player's case and last remaining case via DON.
    function revealFinalDecision(uint256 gameId, bool swap, uint256 salt) external returns (bytes32 requestId) {
        Game storage g = _games[gameId];
        _requirePlayerOrForwarder(g);
        _requirePhase(g, Phase.WaitingForFinalReveal);
        if (block.number <= g.commitBlock) revert TooEarlyToReveal();
        if (block.number - g.commitBlock > REVEAL_WINDOW) revert RevealWindowExpired();

        // Verify commitment
        uint256 expectedHash = uint256(keccak256(abi.encodePacked(swap, salt)));
        if (expectedHash != g.commitHash) revert InvalidReveal();

        // Store swap decision in commitHash temporarily (reuse field)
        g.commitHash = swap ? 1 : 0;

        // Request player's case value
        requestId = _requestCaseValue(gameId, g.playerCase);
        g.functionsRequestId = requestId;
        g.pendingCaseIndex = g.playerCase;
        g.phase = Phase.RequestingFinalValue;

        emit CaseRevealRequested(gameId, g.playerCase, requestId);
    }

    /// @dev Complete final reveal after Functions returns player's case.
    ///      Note: This is simplified. A full implementation would request
    ///      the last case value separately if needed.
    function _completeFinalReveal(uint256 gameId) internal {
        Game storage g = _games[gameId];
        bool swap = g.commitHash == 1;

        // Find last case
        uint8 lastCase = _findLastCase(g);

        // For simplicity, we'll assume last case value is also revealed
        // In production, you'd make a second Functions request
        // For now, assign based on remaining pool deterministically
        if (g.caseValues[lastCase] == 0) {
            uint256 lastValue = _getLastRemainingValue(g);
            g.caseValues[lastCase] = lastValue;
        }

        uint256 playerValue = g.caseValues[g.playerCase];
        uint256 lastValue = g.caseValues[lastCase];

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

    /// @notice Values still in the quantum pool.
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
        uint256 commitBlock,
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
            g.commitBlock,
            g.caseValues,
            g.opened
        );
    }

    /// @notice Get banker info.
    function getBanker(uint256 gameId, address banker) external view returns (
        bool isAllowed, bool isContract, bool isHuman, bool isBanned
    ) {
        Banker storage b = gameBankers[gameId][banker];
        return (b.isAllowed, b.isContract, b.isHuman, b.isBanned);
    }

    /// @notice Convert USD cents to ETH wei.
    function centsToWei(uint256 gameId, uint256 cents) external view returns (uint256) {
        return (cents * _games[gameId].ethPerDollar) / 100;
    }

    // ════════════════════════════════════════════════════════
    //                  ADMIN / CONFIG
    // ════════════════════════════════════════════════════════

    /// @notice Set Chainlink Functions source code.
    function setFunctionsSource(string memory source) external onlyOwner {
        s_functionsSource = source;
    }

    /// @notice Set Functions config.
    function setFunctionsConfig(
        uint64 subscriptionId,
        uint32 gasLimit,
        bytes32 donId
    ) external onlyOwner {
        s_functionsSubscriptionId = subscriptionId;
        s_functionsGasLimit = gasLimit;
        s_donId = donId;
    }

    /// @notice Set Keystone Forwarder address (CRE DON).
    function setKeystoneForwarder(address _forwarder) external onlyOwner {
        keystoneForwarder = _forwarder;
    }

    /// @notice Enable/disable auto-reveal via Keystone.
    function setAutoRevealEnabled(bool _enabled) external onlyOwner {
        autoRevealEnabled = _enabled;
    }

    /// @notice Set VRF config.
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

    /// @notice Rescue ETH.
    function rescueETH(address to) external onlyOwner {
        uint256 bal = address(this).balance;
        if (bal == 0) revert NoFundsToRescue();
        (bool ok,) = to.call{value: bal}("");
        if (!ok) revert TransferFailed();
        emit FundsRescued(to, bal);
    }

    receive() external payable {}

    // ════════════════════════════════════════════════════════
    //                  INTERNAL HELPERS
    // ════════════════════════════════════════════════════════

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

    function _getFullValuePool() internal view returns (uint256[] memory) {
        uint256[] memory vals = new uint256[](NUM_CASES);
        for (uint8 i = 0; i < NUM_CASES; i++) {
            vals[i] = CASE_VALUES_CENTS[i];
        }
        return vals;
    }

    function _getLastRemainingValue(Game storage g) internal view returns (uint256) {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((g.usedValuesBitmap & (1 << i)) == 0) {
                return CASE_VALUES_CENTS[i];
            }
        }
        return 0;
    }

    function _countRemaining(Game storage g) internal view returns (uint8 count) {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (i != g.playerCase && !g.opened[i]) count++;
        }
    }

    function _findLastCase(Game storage g) internal view returns (uint8) {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (i != g.playerCase && !g.opened[i]) return i;
        }
        revert("no case found");
    }

    function _requirePlayer(Game storage g) internal view {
        if (msg.sender != g.player) revert NotPlayer();
    }

    function _requirePlayerOrForwarder(Game storage g) internal view {
        bool isPlayer = msg.sender == g.player;
        bool isForwarder = autoRevealEnabled && msg.sender == keystoneForwarder;
        if (!isPlayer && !isForwarder) revert NotAuthorizedRevealer();
    }

    function _requirePhase(Game storage g, Phase expected) internal view {
        if (g.phase != expected) revert WrongPhase(expected, g.phase);
    }

    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) return "0";
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }
}
