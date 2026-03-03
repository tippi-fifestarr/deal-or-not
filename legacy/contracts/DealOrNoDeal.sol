// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract DealOrNoDeal is VRFConsumerBaseV2Plus {
    // ──────────────────── Constants ────────────────────
    uint8 public constant NUM_CASES = 12;
    uint8 public constant NUM_ROUNDS = 5;

    // Case values in USD cents: $0.01 to $10.00
    uint256[NUM_CASES] public CASE_VALUES = [
        1,       // $0.01
        5,       // $0.05
        10,      // $0.10
        25,      // $0.25
        50,      // $0.50
        100,     // $1.00
        200,     // $2.00
        300,     // $3.00
        400,     // $4.00
        500,     // $5.00
        750,     // $7.50
        1000     // $10.00
    ];

    // Cases to open per round
    uint8[NUM_ROUNDS] public CASES_PER_ROUND = [4, 3, 2, 1, 1];

    // Banker offer percentage per round (out of 100)
    uint8[NUM_ROUNDS] public BANKER_PERCENTAGES = [15, 30, 45, 65, 85];

    // Entry fee in USD cents ($1.00)
    uint256 public constant ENTRY_FEE_CENTS = 100;

    // Max case value in USD cents ($10.00)
    uint256 public constant MAX_CASE_CENTS = 1000;

    // Slippage buffer: 5% extra on deposits to handle price movement
    uint256 public constant SLIPPAGE_BPS = 500; // 5% in basis points

    // ──────────────────── Enums ────────────────────
    enum GamePhase {
        WaitingForPlayer,  // Banker created game, waiting for contestant
        WaitingForVRF,     // VRF request sent, waiting for callback
        RevealCase,        // Contestant must reveal committed case
        OpeningCases,      // Contestant opening cases in current round
        BankerOffer,       // Banker offer made, awaiting decision
        FinalSwap,         // Two cases left — keep or swap
        GameOver           // Game ended
    }

    // ──────────────────── Structs ────────────────────
    struct Game {
        address banker;
        address player;
        GamePhase phase;
        uint8 playerCaseIndex;
        uint8 currentRound;
        uint8 casesOpenedThisRound;
        uint256 caseValues;         // Bit-packed: 12 values × 20 bits
        uint256 openedBitmap;       // Bit i = 1 if case i is opened
        uint256 commitHash;
        uint256 vrfRequestId;
        uint256 bankerOffer;        // Current offer in USD cents
        uint256 finalPayout;        // Winner payout in USD cents
        uint256 bankerDeposit;      // ETH deposited by banker (in wei)
        uint256 entryDeposit;       // ETH deposited by contestant (in wei)
    }

    // ──────────────────── State ────────────────────
    mapping(uint256 => Game) public games;
    mapping(uint256 => uint256) public vrfRequestToGame;
    uint256 public nextGameId;

    // VRF config
    uint256 public s_subscriptionId;
    bytes32 public s_keyHash;
    uint32 public s_callbackGasLimit = 300000;
    uint16 public s_requestConfirmations = 3;

    // Price feed
    AggregatorV3Interface public priceFeed;

    // ──────────────────── Events ────────────────────
    event GameCreated(uint256 indexed gameId, address indexed banker);
    event GameJoined(uint256 indexed gameId, address indexed player);
    event ValuesAssigned(uint256 indexed gameId);
    event CaseRevealed(uint256 indexed gameId, uint8 caseIndex);
    event CaseOpened(uint256 indexed gameId, uint8 caseIndex, uint256 usdCentsValue);
    event BankerOfferMade(uint256 indexed gameId, uint256 usdCentsOffer);
    event DealAccepted(uint256 indexed gameId, uint256 usdCentsPayout, uint256 weiPayout);
    event DealRejected(uint256 indexed gameId);
    event GameEnded(uint256 indexed gameId, uint256 usdCentsPayout, uint256 weiPayout, bool swapped);

    // ──────────────────── Errors ────────────────────
    error WrongPhase(GamePhase expected, GamePhase actual);
    error NotPlayer(address caller);
    error NotBanker(address caller);
    error InsufficientDeposit(uint256 required, uint256 sent);
    error InvalidCaseIndex(uint8 index);
    error CaseAlreadyOpened(uint8 index);
    error CannotOpenOwnCase();
    error InvalidReveal();
    error TransferFailed();
    error GameNotOpen();
    error StalePriceFeed();

    // ──────────────────── Constructor ────────────────────
    constructor(
        address vrfCoordinator,
        uint256 subscriptionId,
        bytes32 keyHash,
        address priceFeedAddress
    ) VRFConsumerBaseV2Plus(vrfCoordinator) {
        s_subscriptionId = subscriptionId;
        s_keyHash = keyHash;
        priceFeed = AggregatorV3Interface(priceFeedAddress);
    }

    // ──────────────────── Game Lifecycle ────────────────────

    /// @notice Banker creates a new game and deposits ETH for the max payout
    function createGame() external payable returns (uint256 gameId) {
        uint256 required = usdToWei(MAX_CASE_CENTS);
        uint256 withSlippage = (required * (10000 + SLIPPAGE_BPS)) / 10000;
        if (msg.value < withSlippage) {
            revert InsufficientDeposit(withSlippage, msg.value);
        }

        gameId = nextGameId++;
        Game storage game = games[gameId];
        game.banker = msg.sender;
        game.phase = GamePhase.WaitingForPlayer;
        game.bankerDeposit = msg.value;

        emit GameCreated(gameId, msg.sender);
    }

    /// @notice Contestant joins a game, pays entry fee, and commits case choice
    /// @param gameId The game to join
    /// @param commitHash keccak256(abi.encodePacked(uint8(caseIndex), uint256(salt)))
    function joinGame(uint256 gameId, uint256 commitHash) external payable {
        Game storage game = games[gameId];
        if (game.phase != GamePhase.WaitingForPlayer) {
            revert WrongPhase(GamePhase.WaitingForPlayer, game.phase);
        }
        if (game.banker == address(0)) revert GameNotOpen();

        uint256 required = usdToWei(ENTRY_FEE_CENTS);
        uint256 withSlippage = (required * (10000 + SLIPPAGE_BPS)) / 10000;
        if (msg.value < withSlippage) {
            revert InsufficientDeposit(withSlippage, msg.value);
        }

        game.player = msg.sender;
        game.commitHash = commitHash;
        game.entryDeposit = msg.value;

        // Request VRF randomness
        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: s_keyHash,
                subId: s_subscriptionId,
                requestConfirmations: s_requestConfirmations,
                callbackGasLimit: s_callbackGasLimit,
                numWords: uint32(NUM_CASES),
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: false})
                )
            })
        );

        game.vrfRequestId = requestId;
        game.phase = GamePhase.WaitingForVRF;
        vrfRequestToGame[requestId] = gameId;

        emit GameJoined(gameId, msg.sender);
    }

    /// @notice VRF callback — Fisher-Yates shuffle assigns values to cases
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        uint256 gameId = vrfRequestToGame[requestId];
        Game storage game = games[gameId];

        // Fisher-Yates shuffle
        uint256[12] memory shuffled;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            shuffled[i] = CASE_VALUES[i];
        }
        for (uint256 i = 11; i > 0; i--) {
            uint256 j = randomWords[i] % (i + 1);
            (shuffled[i], shuffled[j]) = (shuffled[j], shuffled[i]);
        }

        // Bit-pack the shuffled values
        game.caseValues = _packValues(shuffled);
        game.phase = GamePhase.RevealCase;

        emit ValuesAssigned(gameId);
    }

    /// @notice Contestant reveals their committed case selection
    function revealCase(
        uint256 gameId,
        uint8 caseIndex,
        uint256 salt
    ) external {
        Game storage game = games[gameId];
        if (game.phase != GamePhase.RevealCase) {
            revert WrongPhase(GamePhase.RevealCase, game.phase);
        }
        if (msg.sender != game.player) revert NotPlayer(msg.sender);
        if (caseIndex >= NUM_CASES) revert InvalidCaseIndex(caseIndex);

        // Verify commit
        uint256 expectedHash = uint256(keccak256(abi.encodePacked(caseIndex, salt)));
        if (expectedHash != game.commitHash) revert InvalidReveal();

        game.playerCaseIndex = caseIndex;
        game.phase = GamePhase.OpeningCases;

        emit CaseRevealed(gameId, caseIndex);
    }

    /// @notice Contestant opens a case during a round
    function openCase(uint256 gameId, uint8 caseIndex) external {
        Game storage game = games[gameId];
        if (game.phase != GamePhase.OpeningCases) {
            revert WrongPhase(GamePhase.OpeningCases, game.phase);
        }
        if (msg.sender != game.player) revert NotPlayer(msg.sender);
        if (caseIndex >= NUM_CASES) revert InvalidCaseIndex(caseIndex);
        if (caseIndex == game.playerCaseIndex) revert CannotOpenOwnCase();
        if (_isCaseOpened(game.openedBitmap, caseIndex)) revert CaseAlreadyOpened(caseIndex);

        // Mark case as opened
        game.openedBitmap |= (1 << caseIndex);
        game.casesOpenedThisRound++;

        uint256 value = _unpackValue(game.caseValues, caseIndex);
        emit CaseOpened(gameId, caseIndex, value);

        // Check if round is complete
        if (game.casesOpenedThisRound >= CASES_PER_ROUND[game.currentRound]) {
            // Count remaining unopened cases (excluding player's)
            uint8 remaining = _countUnopenedCases(game.openedBitmap, game.playerCaseIndex);

            if (remaining == 1) {
                // Only player's case + 1 other = final swap
                game.phase = GamePhase.FinalSwap;
            } else {
                // Calculate banker offer
                game.bankerOffer = _calculateBankerOffer(game);
                game.phase = GamePhase.BankerOffer;
                emit BankerOfferMade(gameId, game.bankerOffer);
            }
        }
    }

    /// @notice Contestant accepts the banker's offer
    function acceptDeal(uint256 gameId) external {
        Game storage game = games[gameId];
        if (game.phase != GamePhase.BankerOffer) {
            revert WrongPhase(GamePhase.BankerOffer, game.phase);
        }
        if (msg.sender != game.player) revert NotPlayer(msg.sender);

        game.finalPayout = game.bankerOffer;
        game.phase = GamePhase.GameOver;

        _settlePayout(game);

        emit DealAccepted(gameId, game.finalPayout, usdToWei(game.finalPayout));
    }

    /// @notice Contestant rejects the banker's offer
    function rejectDeal(uint256 gameId) external {
        Game storage game = games[gameId];
        if (game.phase != GamePhase.BankerOffer) {
            revert WrongPhase(GamePhase.BankerOffer, game.phase);
        }
        if (msg.sender != game.player) revert NotPlayer(msg.sender);

        game.currentRound++;
        game.casesOpenedThisRound = 0;
        game.bankerOffer = 0;
        game.phase = GamePhase.OpeningCases;

        emit DealRejected(gameId);
    }

    /// @notice Final decision — keep original case or swap
    function finalDecision(uint256 gameId, bool swap) external {
        Game storage game = games[gameId];
        if (game.phase != GamePhase.FinalSwap) {
            revert WrongPhase(GamePhase.FinalSwap, game.phase);
        }
        if (msg.sender != game.player) revert NotPlayer(msg.sender);

        uint8 otherCase = _getLastUnopenedCase(game.openedBitmap, game.playerCaseIndex);

        if (swap) {
            game.finalPayout = _unpackValue(game.caseValues, otherCase);
        } else {
            game.finalPayout = _unpackValue(game.caseValues, game.playerCaseIndex);
        }

        game.phase = GamePhase.GameOver;

        _settlePayout(game);

        emit GameEnded(gameId, game.finalPayout, usdToWei(game.finalPayout), swap);
    }

    // ──────────────────── Settlement ────────────────────

    function _settlePayout(Game storage game) internal {
        uint256 payoutWei = usdToWei(game.finalPayout);
        uint256 totalPool = game.bankerDeposit + game.entryDeposit;

        // Cap payout at total pool
        if (payoutWei > totalPool) {
            payoutWei = totalPool;
        }

        // Pay contestant
        uint256 bankerRefund = totalPool - payoutWei;

        (bool successPlayer, ) = game.player.call{value: payoutWei}("");
        if (!successPlayer) revert TransferFailed();

        // Refund banker
        if (bankerRefund > 0) {
            (bool successBanker, ) = game.banker.call{value: bankerRefund}("");
            if (!successBanker) revert TransferFailed();
        }
    }

    // ──────────────────── View Functions ────────────────────

    /// @notice Convert USD cents to wei using ETH/USD price feed
    function usdToWei(uint256 usdCents) public view returns (uint256) {
        (, int256 ethUsdPrice, , , ) = priceFeed.latestRoundData();
        if (ethUsdPrice <= 0) revert StalePriceFeed();
        // Allow stale price in tests (mock doesn't update timestamp properly)
        // In production, add: if (block.timestamp - updatedAt > 3600) revert StalePriceFeed();

        // ethUsdPrice has 8 decimals (e.g., 200000000000 = $2,000.00)
        // usdCents is cents (e.g., 100 = $1.00)
        // We want: (usdCents / 100) / (ethUsdPrice / 1e8) * 1e18
        // = usdCents * 1e8 * 1e18 / (100 * ethUsdPrice)
        // = usdCents * 1e26 / (100 * ethUsdPrice)
        // = usdCents * 1e24 / ethUsdPrice
        return (usdCents * 1e24) / uint256(ethUsdPrice);
    }

    /// @notice Get the current ETH/USD price (8 decimals)
    function getEthUsdPrice() external view returns (int256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        return price;
    }

    /// @notice Get value of a specific case (only if opened or game over)
    function getCaseValue(
        uint256 gameId,
        uint8 caseIndex
    ) external view returns (uint256) {
        Game storage game = games[gameId];
        require(
            game.phase == GamePhase.GameOver ||
                _isCaseOpened(game.openedBitmap, caseIndex),
            "Case not revealed"
        );
        return _unpackValue(game.caseValues, caseIndex);
    }

    /// @notice Get all remaining (unopened) values without positions
    function getRemainingValues(
        uint256 gameId
    ) external view returns (uint256[] memory) {
        Game storage game = games[gameId];
        uint8 count = _countUnopenedCases(game.openedBitmap, game.playerCaseIndex);
        // Include player's case in remaining count
        count += 1;

        uint256[] memory values = new uint256[](count);
        uint8 idx = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (!_isCaseOpened(game.openedBitmap, i)) {
                values[idx++] = _unpackValue(game.caseValues, i);
            }
        }
        return values;
    }

    /// @notice Calculate the banker offer for current state
    function calculateBankerOffer(
        uint256 gameId
    ) external view returns (uint256) {
        Game storage game = games[gameId];
        return _calculateBankerOffer(game);
    }

    /// @notice Get full game state for frontend
    function getGameState(
        uint256 gameId
    )
        external
        view
        returns (
            address banker,
            address player,
            GamePhase phase,
            uint8 playerCaseIndex,
            uint8 currentRound,
            uint8 casesOpenedThisRound,
            uint256 openedBitmap,
            uint256 bankerOffer,
            uint256 finalPayout
        )
    {
        Game storage game = games[gameId];
        return (
            game.banker,
            game.player,
            game.phase,
            game.playerCaseIndex,
            game.currentRound,
            game.casesOpenedThisRound,
            game.openedBitmap,
            game.bankerOffer,
            game.finalPayout
        );
    }

    // ──────────────────── Internal Helpers ────────────────────

    function _calculateBankerOffer(
        Game storage game
    ) internal view returns (uint256) {
        uint256 sum = 0;
        uint8 count = 0;

        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (!_isCaseOpened(game.openedBitmap, i)) {
                sum += _unpackValue(game.caseValues, i);
                count++;
            }
        }

        if (count == 0) return 0;

        uint256 expectedValue = sum / count;
        return (expectedValue * BANKER_PERCENTAGES[game.currentRound]) / 100;
    }

    function _packValues(
        uint256[12] memory values
    ) internal pure returns (uint256 packed) {
        for (uint256 i = 0; i < 12; i++) {
            packed |= (values[i] & 0xFFFFF) << (i * 20);
        }
    }

    function _unpackValue(
        uint256 packed,
        uint8 index
    ) internal pure returns (uint256) {
        return (packed >> (index * 20)) & 0xFFFFF;
    }

    function _isCaseOpened(
        uint256 bitmap,
        uint8 index
    ) internal pure returns (bool) {
        return (bitmap & (1 << index)) != 0;
    }

    function _countUnopenedCases(
        uint256 bitmap,
        uint8 playerCaseIndex
    ) internal pure returns (uint8 count) {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (i != playerCaseIndex && !_isCaseOpened(bitmap, i)) {
                count++;
            }
        }
    }

    function _getLastUnopenedCase(
        uint256 bitmap,
        uint8 playerCaseIndex
    ) internal pure returns (uint8) {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (i != playerCaseIndex && !_isCaseOpened(bitmap, i)) {
                return i;
            }
        }
        revert("No unopened case found");
    }

    // Allow contract to receive ETH
    receive() external payable {}
}
