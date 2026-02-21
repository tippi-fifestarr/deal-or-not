// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @title Cash Case — Brodinger's Case Edition
/// @notice Provably fair on-chain briefcase game with quantum case values.
/// @dev Brodinger's Case: values don't exist until observed. Each opening round uses
///      commit-reveal with blockhash entropy to prevent precomputation attacks by bots.
///      "Word on the street is someone knows what's in the case" — not with Brodinger's Case.
contract CashCase is VRFConsumerBaseV2Plus {
    // ──────────────────── Constants ────────────────────
    uint8 public constant NUM_CASES = 12;
    uint8 public constant NUM_ROUNDS = 5;
    uint8[NUM_ROUNDS] public CASES_PER_ROUND = [4, 3, 2, 1, 1];
    uint8[NUM_ROUNDS] public BANKER_PERCENTAGES = [15, 30, 45, 65, 85];
    uint256 public constant ENTRY_FEE_CENTS = 100;
    uint256 public constant SLIPPAGE_BPS = 500;

    // ──────────────────── Game Tiers ────────────────────
    enum GameTier { MICRO, STANDARD, HIGH }

    uint256[NUM_CASES] public MICRO_VALUES = [1, 2, 5, 10, 25, 50, 75, 100, 150, 200, 350, 500];
    uint256[NUM_CASES] public STANDARD_VALUES = [1, 5, 10, 25, 50, 100, 200, 300, 400, 500, 750, 1000];
    uint256[NUM_CASES] public HIGH_VALUES = [10, 50, 100, 250, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000];

    uint256[3] public MAX_CASE_BY_TIER = [500, 1000, 5000];

    // ──────────────────── Enums ────────────────────
    enum GamePhase {
        WaitingForPlayer,      // 0
        WaitingForVRF,         // 1
        RevealCase,            // 2
        CommitRound,           // 3
        WaitingForReveal,      // 4
        BankerOffer,           // 5
        CommitFinal,           // 6
        WaitingForFinalReveal, // 7
        GameOver               // 8
    }

    // ──────────────────── Structs ────────────────────
    struct Game {
        address banker;
        GamePhase phase;
        GameTier tier;
        uint8 playerCaseIndex;
        uint8 currentRound;
        uint8 totalOpened;
        address player;
        uint256 vrfSeed;
        uint256 caseValues;
        uint256 openedBitmap;
        uint256 usedValuesBitmap;
        uint256 commitHash;
        uint256 commitBlock;
        uint256 vrfRequestId;
        uint256 bankerOffer;
        uint256 finalPayout;
        uint256 bankerDeposit;
        uint256 entryDeposit;
    }

    // ──────────────────── State ────────────────────
    mapping(uint256 => Game) public games;
    mapping(uint256 => uint256) public vrfRequestToGame;
    uint256 public nextGameId;

    mapping(address => uint256) public activeBankerGames;
    bool public enforceBankerCheck;
    address public admin;

    uint256 public s_subscriptionId;
    bytes32 public s_keyHash;
    uint32 public s_callbackGasLimit = 100000;
    uint16 public s_requestConfirmations = 3;

    AggregatorV3Interface public priceFeed;

    // ──────────────────── Events ────────────────────
    event GameCreated(uint256 indexed gameId, address indexed banker, GameTier tier);
    event GameJoined(uint256 indexed gameId, address indexed player);
    event SeedRevealed(uint256 indexed gameId);
    event CaseRevealed(uint256 indexed gameId, uint8 caseIndex);
    event RoundCommitted(uint256 indexed gameId, uint8 round);
    event CaseOpened(uint256 indexed gameId, uint8 caseIndex, uint256 usdCentsValue);
    event BankerOfferMade(uint256 indexed gameId, uint256 usdCentsOffer);
    event DealAccepted(uint256 indexed gameId, uint256 usdCentsPayout, uint256 weiPayout);
    event DealRejected(uint256 indexed gameId);
    event FinalCommitted(uint256 indexed gameId);
    event GameEnded(uint256 indexed gameId, uint256 usdCentsPayout, uint256 weiPayout, bool swapped);
    event GameForfeited(uint256 indexed gameId, address indexed banker);

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
    error MustBeBanker();
    error TooEarlyToReveal();
    error WrongNumberOfCases(uint8 expected, uint8 got);
    error RevealWindowExpired();
    error CannotForfeit();
    error RevealWindowActive();

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
        admin = msg.sender;
    }

    // ──────────────────── Game Lifecycle ────────────────────

    function createGame() external payable returns (uint256) {
        return _createGame(GameTier.STANDARD);
    }

    function createGame(GameTier tier) external payable returns (uint256) {
        return _createGame(tier);
    }

    function _createGame(GameTier tier) internal returns (uint256 gameId) {
        uint256 maxCents = MAX_CASE_BY_TIER[uint8(tier)];
        uint256 required = usdToWei(maxCents);
        uint256 withSlippage = (required * (10000 + SLIPPAGE_BPS)) / 10000;
        if (msg.value < withSlippage) {
            revert InsufficientDeposit(withSlippage, msg.value);
        }

        gameId = nextGameId++;
        Game storage game = games[gameId];
        game.banker = msg.sender;
        game.tier = tier;
        game.phase = GamePhase.WaitingForPlayer;
        game.bankerDeposit = msg.value;

        activeBankerGames[msg.sender]++;

        emit GameCreated(gameId, msg.sender, tier);
    }

    function joinGame(uint256 gameId, uint256 _commitHash) external payable {
        Game storage game = games[gameId];
        if (game.phase != GamePhase.WaitingForPlayer) {
            revert WrongPhase(GamePhase.WaitingForPlayer, game.phase);
        }
        if (game.banker == address(0)) revert GameNotOpen();

        if (enforceBankerCheck && msg.sender != game.banker && activeBankerGames[msg.sender] == 0) {
            revert MustBeBanker();
        }

        uint256 required = usdToWei(ENTRY_FEE_CENTS);
        uint256 withSlippage = (required * (10000 + SLIPPAGE_BPS)) / 10000;
        if (msg.value < withSlippage) {
            revert InsufficientDeposit(withSlippage, msg.value);
        }

        game.player = msg.sender;
        game.commitHash = _commitHash;
        game.entryDeposit = msg.value;

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

        game.vrfRequestId = requestId;
        game.phase = GamePhase.WaitingForVRF;
        vrfRequestToGame[requestId] = gameId;

        emit GameJoined(gameId, msg.sender);
    }

    /// @notice VRF callback — stores seed only, no shuffle
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        uint256 gameId = vrfRequestToGame[requestId];
        Game storage game = games[gameId];
        game.vrfSeed = randomWords[0];
        game.phase = GamePhase.RevealCase;
        emit SeedRevealed(gameId);
    }

    /// @notice Reveal initial case choice (committed before VRF)
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

        uint256 expectedHash = uint256(keccak256(abi.encodePacked(caseIndex, salt)));
        if (expectedHash != game.commitHash) revert InvalidReveal();

        game.playerCaseIndex = caseIndex;
        game.phase = GamePhase.CommitRound;

        emit CaseRevealed(gameId, caseIndex);
    }

    /// @notice Commit to which cases to open this round
    function commitRound(uint256 gameId, uint256 _commitHash) external {
        Game storage game = games[gameId];
        if (game.phase != GamePhase.CommitRound) {
            revert WrongPhase(GamePhase.CommitRound, game.phase);
        }
        if (msg.sender != game.player) revert NotPlayer(msg.sender);

        game.commitHash = _commitHash;
        game.commitBlock = block.number;
        game.phase = GamePhase.WaitingForReveal;

        emit RoundCommitted(gameId, game.currentRound);
    }

    /// @notice Reveal cases — Brodinger's collapse happens here
    function revealRound(
        uint256 gameId,
        uint8[] calldata caseIndices,
        uint256 salt
    ) external {
        Game storage game = games[gameId];
        if (game.phase != GamePhase.WaitingForReveal) {
            revert WrongPhase(GamePhase.WaitingForReveal, game.phase);
        }
        if (msg.sender != game.player) revert NotPlayer(msg.sender);
        if (block.number <= game.commitBlock) revert TooEarlyToReveal();
        if (block.number - game.commitBlock > 256) revert RevealWindowExpired();

        uint8 requiredCount = CASES_PER_ROUND[game.currentRound];
        if (uint8(caseIndices.length) != requiredCount) {
            revert WrongNumberOfCases(requiredCount, uint8(caseIndices.length));
        }

        uint256 expectedHash = uint256(keccak256(abi.encode(caseIndices, salt)));
        if (expectedHash != game.commitHash) revert InvalidReveal();

        bytes32 roundEntropy = blockhash(game.commitBlock);

        for (uint256 i = 0; i < caseIndices.length; i++) {
            uint8 idx = caseIndices[i];
            if (idx >= NUM_CASES) revert InvalidCaseIndex(idx);
            if (idx == game.playerCaseIndex) revert CannotOpenOwnCase();
            if (_isCaseOpened(game.openedBitmap, idx)) revert CaseAlreadyOpened(idx);

            uint256 value = _collapseCase(game, idx, roundEntropy);
            game.caseValues |= (value & 0xFFFFF) << (uint256(idx) * 20);
            game.openedBitmap |= (1 << idx);

            emit CaseOpened(gameId, idx, value);
        }

        uint8 remaining = _countUnopenedCases(game.openedBitmap, game.playerCaseIndex);
        if (remaining <= 1) {
            game.phase = GamePhase.CommitFinal;
        } else {
            game.bankerOffer = _calculateBankerOffer(game);
            game.phase = GamePhase.BankerOffer;
            emit BankerOfferMade(gameId, game.bankerOffer);
        }
    }

    function acceptDeal(uint256 gameId) external {
        Game storage game = games[gameId];
        if (game.phase != GamePhase.BankerOffer) {
            revert WrongPhase(GamePhase.BankerOffer, game.phase);
        }
        if (msg.sender != game.player) revert NotPlayer(msg.sender);

        game.finalPayout = game.bankerOffer;
        game.phase = GamePhase.GameOver;

        _collapsePlayerCase(game);
        _settlePayout(game);

        emit DealAccepted(gameId, game.finalPayout, usdToWei(game.finalPayout));
    }

    function rejectDeal(uint256 gameId) external {
        Game storage game = games[gameId];
        if (game.phase != GamePhase.BankerOffer) {
            revert WrongPhase(GamePhase.BankerOffer, game.phase);
        }
        if (msg.sender != game.player) revert NotPlayer(msg.sender);

        game.currentRound++;
        game.bankerOffer = 0;
        game.phase = GamePhase.CommitRound;

        emit DealRejected(gameId);
    }

    function commitFinalDecision(uint256 gameId, uint256 _commitHash) external {
        Game storage game = games[gameId];
        if (game.phase != GamePhase.CommitFinal) {
            revert WrongPhase(GamePhase.CommitFinal, game.phase);
        }
        if (msg.sender != game.player) revert NotPlayer(msg.sender);

        game.commitHash = _commitHash;
        game.commitBlock = block.number;
        game.phase = GamePhase.WaitingForFinalReveal;

        emit FinalCommitted(gameId);
    }

    function revealFinalDecision(uint256 gameId, bool swap, uint256 salt) external {
        Game storage game = games[gameId];
        if (game.phase != GamePhase.WaitingForFinalReveal) {
            revert WrongPhase(GamePhase.WaitingForFinalReveal, game.phase);
        }
        if (msg.sender != game.player) revert NotPlayer(msg.sender);
        if (block.number <= game.commitBlock) revert TooEarlyToReveal();
        if (block.number - game.commitBlock > 256) revert RevealWindowExpired();

        uint256 expectedHash = uint256(keccak256(abi.encode(swap, salt)));
        if (expectedHash != game.commitHash) revert InvalidReveal();

        bytes32 finalEntropy = blockhash(game.commitBlock);

        uint8 otherCase = _getLastUnopenedCase(game.openedBitmap, game.playerCaseIndex);
        uint256 otherValue = _collapseCase(game, otherCase, finalEntropy);
        game.caseValues |= (otherValue & 0xFFFFF) << (uint256(otherCase) * 20);
        game.openedBitmap |= (1 << otherCase);

        uint256 playerValue = _collapseCase(game, game.playerCaseIndex, finalEntropy);
        game.caseValues |= (playerValue & 0xFFFFF) << (uint256(game.playerCaseIndex) * 20);

        game.finalPayout = swap ? otherValue : playerValue;
        game.phase = GamePhase.GameOver;

        _settlePayout(game);

        emit GameEnded(gameId, game.finalPayout, usdToWei(game.finalPayout), swap);
    }

    function forfeitGame(uint256 gameId) external {
        Game storage game = games[gameId];
        if (msg.sender != game.banker) revert NotBanker(msg.sender);

        if (game.phase != GamePhase.WaitingForReveal &&
            game.phase != GamePhase.WaitingForFinalReveal) {
            revert CannotForfeit();
        }

        if (block.number - game.commitBlock <= 256) revert RevealWindowActive();

        game.phase = GamePhase.GameOver;
        game.finalPayout = 0;

        uint256 total = game.bankerDeposit + game.entryDeposit;
        if (activeBankerGames[game.banker] > 0) {
            activeBankerGames[game.banker]--;
        }

        (bool success, ) = game.banker.call{value: total}("");
        if (!success) revert TransferFailed();

        emit GameForfeited(gameId, game.banker);
    }

    // ──────────────────── Settlement ────────────────────

    function _settlePayout(Game storage game) internal {
        uint256 payoutWei = usdToWei(game.finalPayout);
        uint256 totalPool = game.bankerDeposit + game.entryDeposit;

        if (payoutWei > totalPool) {
            payoutWei = totalPool;
        }

        uint256 bankerRefund = totalPool - payoutWei;

        (bool successPlayer, ) = game.player.call{value: payoutWei}("");
        if (!successPlayer) revert TransferFailed();

        if (bankerRefund > 0) {
            (bool successBanker, ) = game.banker.call{value: bankerRefund}("");
            if (!successBanker) revert TransferFailed();
        }

        if (activeBankerGames[game.banker] > 0) {
            activeBankerGames[game.banker]--;
        }
    }

    // ──────────────────── Brodinger's Collapse ────────────────────

    function _collapseCase(
        Game storage game,
        uint8 caseIndex,
        bytes32 entropy
    ) internal returns (uint256) {
        uint256[12] memory tierValues = _getCaseValues(game.tier);
        uint256 usedBitmap = game.usedValuesBitmap;

        uint8 remaining = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((usedBitmap & (1 << i)) == 0) remaining++;
        }

        uint256 pick = uint256(keccak256(abi.encodePacked(
            game.vrfSeed, caseIndex, game.totalOpened, entropy
        ))) % remaining;

        uint8 count = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((usedBitmap & (1 << i)) == 0) {
                if (count == pick) {
                    game.usedValuesBitmap |= (1 << i);
                    game.totalOpened++;
                    return tierValues[i];
                }
                count++;
            }
        }

        revert("No values remaining");
    }

    function _collapsePlayerCase(Game storage game) internal {
        bytes32 entropy = blockhash(block.number - 1);
        uint256 value = _collapseCase(game, game.playerCaseIndex, entropy);
        game.caseValues |= (value & 0xFFFFF) << (uint256(game.playerCaseIndex) * 20);
    }

    function _getCaseValues(GameTier tier) internal view returns (uint256[12] memory) {
        if (tier == GameTier.MICRO) return MICRO_VALUES;
        if (tier == GameTier.HIGH) return HIGH_VALUES;
        return STANDARD_VALUES;
    }

    // ──────────────────── View Functions ────────────────────

    function usdToWei(uint256 usdCents) public view returns (uint256) {
        (, int256 ethUsdPrice, , , ) = priceFeed.latestRoundData();
        if (ethUsdPrice <= 0) revert StalePriceFeed();
        return (usdCents * 1e24) / uint256(ethUsdPrice);
    }

    function getEthUsdPrice() external view returns (int256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        return price;
    }

    function getCaseValue(uint256 gameId, uint8 caseIndex) external view returns (uint256) {
        Game storage game = games[gameId];
        require(
            _isCaseOpened(game.openedBitmap, caseIndex) ||
            (game.phase == GamePhase.GameOver && caseIndex == game.playerCaseIndex),
            "Case not revealed"
        );
        return _unpackValue(game.caseValues, caseIndex);
    }

    function getRemainingValues(uint256 gameId) external view returns (uint256[] memory) {
        Game storage game = games[gameId];
        uint256[12] memory tierValues = _getCaseValues(game.tier);

        uint8 count = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((game.usedValuesBitmap & (1 << i)) == 0) count++;
        }

        uint256[] memory values = new uint256[](count);
        uint8 idx = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((game.usedValuesBitmap & (1 << i)) == 0) {
                values[idx++] = tierValues[i];
            }
        }
        return values;
    }

    function calculateBankerOffer(uint256 gameId) external view returns (uint256) {
        return _calculateBankerOffer(games[gameId]);
    }

    function getGameState(uint256 gameId)
        external view
        returns (
            address banker, address player, GamePhase phase,
            uint8 playerCaseIndex, uint8 currentRound, uint8 totalOpened,
            uint256 openedBitmap, uint256 bankerOffer, uint256 finalPayout,
            GameTier tier
        )
    {
        Game storage game = games[gameId];
        return (
            game.banker, game.player, game.phase,
            game.playerCaseIndex, game.currentRound, game.totalOpened,
            game.openedBitmap, game.bankerOffer, game.finalPayout,
            game.tier
        );
    }

    function getCommitState(uint256 gameId) external view returns (uint256 commitBlock, uint256 commitHash) {
        return (games[gameId].commitBlock, games[gameId].commitHash);
    }

    function getBettingOutcome(uint256 gameId)
        external view
        returns (bool dealTaken, bool playerCaseHigh, uint256 playerCaseValue, uint256 finalPayout)
    {
        Game storage game = games[gameId];
        require(game.phase == GamePhase.GameOver, "Game not over");

        uint256 pcv = _unpackValue(game.caseValues, game.playerCaseIndex);
        uint256[12] memory tierValues = _getCaseValues(game.tier);

        uint8 belowOrEqual = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (tierValues[i] <= pcv) belowOrEqual++;
        }

        return (
            game.bankerOffer > 0 && game.finalPayout == game.bankerOffer,
            belowOrEqual > NUM_CASES / 2,
            pcv,
            game.finalPayout
        );
    }

    // ──────────────────── Admin ────────────────────

    function setEnforceBankerCheck(bool _enforce) external {
        require(msg.sender == admin, "Not admin");
        enforceBankerCheck = _enforce;
    }

    // ──────────────────── Internal Helpers ────────────────────

    function _calculateBankerOffer(Game storage game) internal view returns (uint256) {
        uint256[12] memory tierValues = _getCaseValues(game.tier);
        uint256 sum = 0;
        uint8 count = 0;

        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((game.usedValuesBitmap & (1 << i)) == 0) {
                sum += tierValues[i];
                count++;
            }
        }

        if (count == 0) return 0;
        uint256 expectedValue = sum / count;
        return (expectedValue * BANKER_PERCENTAGES[game.currentRound]) / 100;
    }

    function _unpackValue(uint256 packed, uint8 index) internal pure returns (uint256) {
        return (packed >> (uint256(index) * 20)) & 0xFFFFF;
    }

    function _isCaseOpened(uint256 bitmap, uint8 index) internal pure returns (bool) {
        return (bitmap & (1 << index)) != 0;
    }

    function _countUnopenedCases(uint256 bitmap, uint8 playerCaseIndex) internal pure returns (uint8 count) {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (i != playerCaseIndex && !_isCaseOpened(bitmap, i)) {
                count++;
            }
        }
    }

    function _getLastUnopenedCase(uint256 bitmap, uint8 playerCaseIndex) internal pure returns (uint8) {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (i != playerCaseIndex && !_isCaseOpened(bitmap, i)) {
                return i;
            }
        }
        revert("No unopened case found");
    }

    receive() external payable {}
}
