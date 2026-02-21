// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    GameState,
    GameOutcome,
    Game,
    GameConfig,
    LotteryEntry,
    BriefcaseData,
    NUM_CASES,
    NUM_ROUNDS,
    casesPerRound,
    prizeDistributionBps,
    InvalidGameState,
    NotHost,
    NotContestant,
    NotAuthorized,
    LotteryNotOpen,
    RevealWindowClosed,
    RevealWindowNotClosed,
    AlreadyRevealed,
    InvalidReveal,
    InsufficientEntryFee,
    InvalidCaseIndex,
    CaseAlreadyOpened,
    CaseIsSelected,
    WrongNumberOfCases,
    InvalidProof,
    NoOfferPending,
    TimeoutNotReached,
    GameAlreadyOver,
    ZeroAddress,
    InvalidConfig,
    TransferFailed,
    AlreadyInitialized,
    HostCannotEnterLottery,
    GameCreated,
    LotteryOpened,
    LotteryEntered,
    SecretRevealed,
    ContestantSelected,
    CaseSelected,
    CaseOpened,
    BankerOfferMade,
    DealAccepted,
    DealRejected,
    FinalCaseRevealed,
    GameResolved,
    TimeoutResolved,
    RefundClaimed
} from "./GameTypes.sol";
import {BankerAlgorithm} from "./BankerAlgorithm.sol";
import {ZKGameVerifier} from "./ZKGameVerifier.sol";
import {BriefcaseNFT} from "./BriefcaseNFT.sol";

interface IDealOrNoDealFactory {
    function jackpotBps() external view returns (uint16);
    function jackpotPool() external view returns (uint256);
    function contributeToJackpot(uint256 gameId) external payable;
    function awardJackpot(uint256 gameId, address winner) external;
}

/// @title DealOrNoDeal
/// @notice Core game contract implementing the full Deal or No Deal state machine
///         with commit-reveal lottery, ZK case reveals, and banker algorithm.
///         Deployed as EIP-1167 clones via DealOrNoDealFactory.
contract DealOrNoDeal is ReentrancyGuard {
    using BankerAlgorithm for uint256[];

    // ============ State ============

    bool private _initialized;
    uint256 public gameId;
    Game public game;
    ZKGameVerifier public zkVerifier;
    BriefcaseNFT public nft;
    address public factory;
    address public protocolFeeRecipient;

    // Lottery
    LotteryEntry[] public lotteryEntries;
    mapping(address => uint256) public playerEntryIndex; // 1-indexed (0 = not entered)

    // Briefcases
    BriefcaseData[NUM_CASES] public briefcases;
    uint256 public casesOpenedThisRound;

    // Tracking
    uint256[] private _remainingValues;
    mapping(uint256 => bool) private _valueRemoved;

    // Jackpot
    uint256 public maxCaseValue;

    // Variance tracking
    uint256 public initialEV; // EV at game start (for context-aware offers)

    // ============ Modifiers ============

    modifier onlyHost() {
        if (msg.sender != game.host) revert NotHost();
        _;
    }

    modifier onlyContestant() {
        if (msg.sender != game.contestant) revert NotContestant();
        _;
    }

    modifier inState(GameState expected) {
        if (game.state != expected) revert InvalidGameState(expected, game.state);
        _;
    }

    // ============ Initialization ============

    /// @notice Initialize this clone instance (called by factory)
    function initialize(
        uint256 _gameId,
        address _host,
        bytes32 _merkleRoot,
        GameConfig calldata _config,
        address _zkVerifier,
        address _nft,
        address _protocolFeeRecipient
    ) external {
        if (_initialized) revert AlreadyInitialized();
        if (_host == address(0)) revert ZeroAddress();
        if (_config.entryFee == 0) revert InvalidConfig();
        if (_config.hostFeeBps + _config.protocolFeeBps > 2000) revert InvalidConfig();
        if (_config.refundBps > 8000) revert InvalidConfig();
        if (_config.minPlayers < 2) revert InvalidConfig();

        _initialized = true;
        gameId = _gameId;
        factory = msg.sender;
        zkVerifier = ZKGameVerifier(_zkVerifier);
        nft = BriefcaseNFT(_nft);
        protocolFeeRecipient = _protocolFeeRecipient;

        game.host = _host;
        game.merkleRoot = _merkleRoot;
        game.config = _config;
        game.state = GameState.Created;
        game.lastActionTime = block.timestamp;

        emit GameCreated(_gameId, _host, _merkleRoot);
    }

    // ============ Lottery Phase ============

    /// @notice Host opens the lottery for player entries
    function openLottery() external onlyHost inState(GameState.Created) {
        game.state = GameState.LotteryOpen;
        game.lotteryEndTime = block.timestamp + game.config.lotteryDuration;
        game.lastActionTime = block.timestamp;

        emit LotteryOpened(gameId, game.config.entryFee, game.lotteryEndTime);
    }

    /// @notice Enter the lottery with a commit hash
    /// @param commitHash keccak256(abi.encodePacked(secret, msg.sender))
    function enterLottery(bytes32 commitHash) external payable inState(GameState.LotteryOpen) {
        if (msg.sender == game.host) revert HostCannotEnterLottery();
        if (block.timestamp > game.lotteryEndTime) revert LotteryNotOpen();
        if (msg.value < game.config.entryFee) revert InsufficientEntryFee();
        if (playerEntryIndex[msg.sender] != 0) revert AlreadyRevealed(); // already entered

        lotteryEntries.push(
            LotteryEntry({
                player: msg.sender,
                commitHash: commitHash,
                revealedSecret: bytes32(0),
                revealed: false,
                refunded: false
            })
        );
        playerEntryIndex[msg.sender] = lotteryEntries.length; // 1-indexed
        game.totalEntries++;

        // Refund excess
        if (msg.value > game.config.entryFee) {
            _safeTransfer(msg.sender, msg.value - game.config.entryFee);
        }

        emit LotteryEntered(gameId, msg.sender, lotteryEntries.length - 1);
    }

    /// @notice Close entry window and start reveal phase (anyone can call after deadline)
    function closeLotteryEntries() external inState(GameState.LotteryOpen) {
        if (block.timestamp <= game.lotteryEndTime) revert LotteryNotOpen();
        if (game.totalEntries < game.config.minPlayers) {
            // Not enough players — refund everyone and cancel
            _cancelAndRefund();
            return;
        }
        game.state = GameState.LotteryReveal;
        game.revealEndTime = block.timestamp + game.config.revealDuration;
        game.lastActionTime = block.timestamp;
    }

    /// @notice Reveal your lottery secret
    /// @param secret The secret that was committed
    function revealSecret(bytes32 secret) external inState(GameState.LotteryReveal) {
        if (block.timestamp > game.revealEndTime) revert RevealWindowClosed();
        uint256 idx = playerEntryIndex[msg.sender];
        if (idx == 0) revert NotAuthorized();
        LotteryEntry storage entry = lotteryEntries[idx - 1];
        if (entry.revealed) revert AlreadyRevealed();

        bytes32 expectedHash = keccak256(abi.encodePacked(secret, msg.sender));
        if (expectedHash != entry.commitHash) revert InvalidReveal();

        entry.revealedSecret = secret;
        entry.revealed = true;

        emit SecretRevealed(gameId, msg.sender);
    }

    /// @notice Draw the winner after reveal window closes
    function drawWinner() external inState(GameState.LotteryReveal) {
        if (block.timestamp <= game.revealEndTime) revert RevealWindowNotClosed();

        // Collect revealed secrets and valid participants
        bytes32 combinedEntropy;
        uint256[] memory validIndices = new uint256[](lotteryEntries.length);
        uint256 validCount;

        for (uint256 i; i < lotteryEntries.length; ++i) {
            if (lotteryEntries[i].revealed) {
                combinedEntropy = keccak256(abi.encodePacked(combinedEntropy, lotteryEntries[i].revealedSecret));
                validIndices[validCount++] = i;
            }
        }

        if (validCount == 0) {
            _cancelAndRefund();
            return;
        }

        // Draw winner: keccak256(blockhash XOR combinedEntropy) % validCount
        bytes32 randomSeed = keccak256(abi.encodePacked(blockhash(block.number - 1) ^ combinedEntropy));
        uint256 winnerIdx = uint256(randomSeed) % validCount;
        address winner = lotteryEntries[validIndices[winnerIdx]].player;

        game.contestant = winner;
        game.state = GameState.LotteryComplete;
        game.lastActionTime = block.timestamp;

        // Calculate prize pool
        uint256 totalPool = game.config.entryFee * game.totalEntries;
        game.hostFee = (totalPool * game.config.hostFeeBps) / 10000;
        game.protocolFee = (totalPool * game.config.protocolFeeBps) / 10000;
        game.prizePool = totalPool - game.hostFee - game.protocolFee;

        // Distribute prize pool across 26 cases proportionally (shuffled)
        _distributePrizePool(randomSeed);

        // Mint NFTs
        nft.mintGameSet(gameId);

        emit ContestantSelected(gameId, winner);
    }

    // ============ Game Play ============

    /// @notice Contestant selects their briefcase
    /// @param caseIndex The case to keep (0-25)
    function selectCase(uint256 caseIndex) external onlyContestant inState(GameState.LotteryComplete) {
        if (caseIndex >= NUM_CASES) revert InvalidCaseIndex();

        game.selectedCase = caseIndex;
        game.state = GameState.RoundPlay;
        game.currentRound = 0;
        casesOpenedThisRound = 0;
        game.lastActionTime = block.timestamp;

        // Transfer selected case NFT to contestant
        nft.transferCase(gameId, uint8(caseIndex), game.contestant);

        emit CaseSelected(gameId, caseIndex);
    }

    /// @notice Open a briefcase with ZK proof (host provides value + proof)
    /// @param caseIndex The case to open
    /// @param value The value in the case (proven by ZK proof)
    /// @param pA Groth16 proof element A
    /// @param pB Groth16 proof element B
    /// @param pC Groth16 proof element C
    function openCase(
        uint256 caseIndex,
        uint256 value,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC
    ) external inState(GameState.RoundPlay) nonReentrant {
        if (msg.sender != game.contestant && msg.sender != game.host) revert NotAuthorized();
        if (caseIndex >= NUM_CASES) revert InvalidCaseIndex();
        if (caseIndex == game.selectedCase) revert CaseIsSelected();
        if (briefcases[caseIndex].opened) revert CaseAlreadyOpened();

        // Verify ZK proof
        bool valid = zkVerifier.verifyCaseReveal(pA, pB, pC, caseIndex, uint256(game.merkleRoot), value);
        if (!valid) revert InvalidProof();

        // Use the stored shuffled value (not the caller-provided value)
        uint256 storedValue = briefcases[caseIndex].value;

        // Mark case as opened
        briefcases[caseIndex].opened = true;
        briefcases[caseIndex].revealed = true;

        // Update remaining values
        _removeValue(storedValue);

        // Reveal NFT and transfer to opener (contestant)
        nft.revealCase(gameId, uint8(caseIndex), storedValue);
        nft.transferCase(gameId, uint8(caseIndex), game.contestant);

        casesOpenedThisRound++;
        game.lastActionTime = block.timestamp;

        emit CaseOpened(gameId, caseIndex, storedValue);

        // Check if round is complete
        if (casesOpenedThisRound >= casesPerRound(game.currentRound)) {
            _makeBankerOffer();
        }
    }

    /// @notice Accept the banker's offer (DEAL!)
    function acceptDeal() external onlyContestant inState(GameState.BankerOffer) nonReentrant {
        uint256 offer = game.bankerOffer;
        game.outcome = GameOutcome.Deal;
        game.state = GameState.GameOver;
        game.lastActionTime = block.timestamp;

        // Pay contestant
        _safeTransfer(game.contestant, offer);

        // Pay fees
        _payFees();

        // Remaining prize pool goes back (to host or stays in contract for refunds)
        uint256 remaining = game.prizePool - offer;
        if (remaining > 0) {
            _safeTransfer(game.host, remaining);
        }

        emit DealAccepted(gameId, offer);
        emit GameResolved(gameId, GameOutcome.Deal, offer);
    }

    /// @notice Reject the banker's offer (NO DEAL!)
    function rejectDeal() external onlyContestant inState(GameState.BankerOffer) {
        emit DealRejected(gameId, game.currentRound);

        game.currentRound++;
        casesOpenedThisRound = 0;
        game.lastActionTime = block.timestamp;

        // Check if this was the last round
        if (game.currentRound >= NUM_ROUNDS) {
            _revealFinalCase();
        } else {
            game.state = GameState.RoundPlay;
        }
    }

    /// @notice Reveal the contestant's selected case at game end (requires ZK proof)
    function revealFinalCase(
        uint256 value,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC
    ) external inState(GameState.RoundPlay) nonReentrant {
        // This should only be callable when all rounds are done
        if (game.currentRound < NUM_ROUNDS) revert InvalidGameState(GameState.RoundPlay, game.state);

        uint256 caseIndex = game.selectedCase;

        // Verify ZK proof for the final case
        bool valid = zkVerifier.verifyCaseReveal(pA, pB, pC, caseIndex, uint256(game.merkleRoot), value);
        if (!valid) revert InvalidProof();

        // Use the stored shuffled value (not the caller-provided value)
        uint256 storedValue = briefcases[caseIndex].value;

        briefcases[caseIndex].opened = true;
        briefcases[caseIndex].revealed = true;

        nft.revealCase(gameId, uint8(caseIndex), storedValue);

        game.outcome = GameOutcome.NoDeal;
        game.state = GameState.GameOver;
        game.lastActionTime = block.timestamp;

        // Contestant gets their case value
        _safeTransfer(game.contestant, storedValue);
        _payFees();

        // Remaining goes to host
        uint256 remaining = game.prizePool - storedValue;
        if (remaining > 0) {
            _safeTransfer(game.host, remaining);
        }

        // Jackpot check: contestant picked the highest-value case
        if (storedValue == maxCaseValue && maxCaseValue > 0) {
            IDealOrNoDealFactory f = IDealOrNoDealFactory(factory);
            uint256 jpPool = f.jackpotPool();
            if (jpPool > 0) {
                f.awardJackpot(gameId, game.contestant);
            }
        }

        emit FinalCaseRevealed(gameId, caseIndex, storedValue);
        emit GameResolved(gameId, GameOutcome.NoDeal, storedValue);
    }

    // ============ Timeout Resolution ============

    /// @notice Anyone can resolve a timed-out game. Contestant gets current EV.
    function resolveTimeout() external nonReentrant {
        if (game.state == GameState.GameOver) revert GameAlreadyOver();
        if (block.timestamp < game.lastActionTime + game.config.turnTimeout) revert TimeoutNotReached();

        uint256 evPayout;
        if (_remainingValues.length > 0) {
            evPayout = _remainingValues.expectedValue();
        }

        // If we're past contestant selection, pay EV
        if (game.contestant != address(0) && evPayout > 0) {
            game.outcome = GameOutcome.TimeoutResolved;
            game.state = GameState.GameOver;
            _safeTransfer(game.contestant, evPayout);
            _payFees();

            uint256 remaining = game.prizePool > evPayout ? game.prizePool - evPayout : 0;
            if (remaining > 0) {
                _safeTransfer(game.host, remaining);
            }

            emit TimeoutResolved(gameId, msg.sender, evPayout);
            emit GameResolved(gameId, GameOutcome.TimeoutResolved, evPayout);
        } else {
            // Pre-contestant — cancel and refund
            _cancelAndRefund();
        }
    }

    // ============ Refunds ============

    /// @notice Lottery losers claim their partial refund
    function claimRefund() external nonReentrant {
        if (game.state < GameState.LotteryComplete) revert InvalidGameState(GameState.LotteryComplete, game.state);
        uint256 idx = playerEntryIndex[msg.sender];
        if (idx == 0) revert NotAuthorized();
        LotteryEntry storage entry = lotteryEntries[idx - 1];
        if (entry.player == game.contestant) revert NotAuthorized(); // winner can't refund
        if (entry.refunded) revert AlreadyRevealed(); // reusing error for "already claimed"

        entry.refunded = true;
        uint256 refundAmount = (game.config.entryFee * game.config.refundBps) / 10000;
        if (refundAmount > 0) {
            _safeTransfer(msg.sender, refundAmount);
            emit RefundClaimed(gameId, msg.sender, refundAmount);
        }
    }

    // ============ View Functions ============

    /// @notice Get all remaining (unopened) case values
    function getRemainingValues() external view returns (uint256[] memory) {
        return _remainingValues;
    }

    /// @notice Get current banker offer calculation (doesn't change state)
    function previewBankerOffer() external view returns (uint256 offer, uint256 ev) {
        ev = _remainingValues.expectedValue();
        offer = BankerAlgorithm.calculateOfferWithVariance(
            _remainingValues,
            game.currentRound,
            initialEV,
            game.merkleRoot
        );
    }

    /// @notice Get the number of lottery entries
    function getLotteryEntryCount() external view returns (uint256) {
        return lotteryEntries.length;
    }

    /// @notice Get briefcase data for a specific case
    function getBriefcase(uint256 caseIndex) external view returns (BriefcaseData memory) {
        return briefcases[caseIndex];
    }

    /// @notice Get full game state for frontend/API
    function getGameState()
        external
        view
        returns (
            Game memory gameData,
            uint256 remainingCount,
            uint256 currentEV,
            uint256 casesLeftThisRound
        )
    {
        gameData = game;
        remainingCount = _remainingValues.length;
        currentEV = _remainingValues.length > 0 ? _remainingValues.expectedValue() : 0;
        uint256 needed = casesPerRound(game.currentRound);
        casesLeftThisRound = casesOpenedThisRound < needed ? needed - casesOpenedThisRound : 0;
    }

    // ============ Internal ============

    function _distributePrizePool(bytes32 shuffleSeed) internal {
        // Deduct jackpot contribution from prize pool
        IDealOrNoDealFactory f = IDealOrNoDealFactory(factory);
        uint16 jpBps = f.jackpotBps();
        if (jpBps > 0) {
            uint256 jackpotContribution = (game.prizePool * jpBps) / 10000;
            game.prizePool -= jackpotContribution;
            f.contributeToJackpot{value: jackpotContribution}(gameId);
        }

        uint256 totalBps;
        for (uint256 i; i < NUM_CASES; ++i) {
            totalBps += prizeDistributionBps(i);
        }

        // Compute values into a memory array
        uint256[NUM_CASES] memory values;
        for (uint256 i; i < NUM_CASES; ++i) {
            values[i] = (game.prizePool * prizeDistributionBps(i)) / totalBps;
        }

        // Fisher-Yates shuffle using lottery entropy
        for (uint256 i = NUM_CASES - 1; i > 0; --i) {
            shuffleSeed = keccak256(abi.encodePacked(shuffleSeed, i));
            uint256 j = uint256(shuffleSeed) % (i + 1);
            (values[i], values[j]) = (values[j], values[i]);
        }

        // Assign shuffled values to briefcases and remaining values
        uint256 maxVal;
        for (uint256 i; i < NUM_CASES; ++i) {
            briefcases[i].value = values[i];
            _remainingValues.push(values[i]);
            if (values[i] > maxVal) maxVal = values[i];
        }
        maxCaseValue = maxVal;

        // Store initial EV for variance calculations
        initialEV = BankerAlgorithm.expectedValue(_remainingValues);
    }

    function _removeValue(uint256 value) internal {
        for (uint256 i; i < _remainingValues.length; ++i) {
            if (_remainingValues[i] == value && !_valueRemoved[i]) {
                _remainingValues[i] = _remainingValues[_remainingValues.length - 1];
                _remainingValues.pop();
                return;
            }
        }
    }

    function _makeBankerOffer() internal {
        // Use variance-enabled banker algorithm
        uint256 offer = BankerAlgorithm.calculateOfferWithVariance(
            _remainingValues,
            game.currentRound,
            initialEV,
            game.merkleRoot // Use merkle root as randomness source
        );

        game.bankerOffer = offer;
        game.state = GameState.BankerOffer;

        emit BankerOfferMade(gameId, game.currentRound, offer);
    }

    function _revealFinalCase() internal {
        // Game is over but we need the ZK proof for the final case
        // Set state to RoundPlay temporarily — revealFinalCase() will finalize
        game.state = GameState.RoundPlay;
        game.lastActionTime = block.timestamp;
    }

    function _cancelAndRefund() internal {
        game.state = GameState.GameOver;
        game.outcome = GameOutcome.TimeoutResolved;

        // Refund all entries fully
        for (uint256 i; i < lotteryEntries.length; ++i) {
            if (!lotteryEntries[i].refunded) {
                lotteryEntries[i].refunded = true;
                _safeTransfer(lotteryEntries[i].player, game.config.entryFee);
            }
        }

        emit GameResolved(gameId, GameOutcome.TimeoutResolved, 0);
    }

    function _payFees() internal {
        if (game.hostFee > 0) {
            _safeTransfer(game.host, game.hostFee);
            game.hostFee = 0;
        }
        if (game.protocolFee > 0) {
            _safeTransfer(protocolFeeRecipient, game.protocolFee);
            game.protocolFee = 0;
        }
    }

    function _safeTransfer(address to, uint256 amount) internal {
        (bool success,) = to.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    receive() external payable {}
}
