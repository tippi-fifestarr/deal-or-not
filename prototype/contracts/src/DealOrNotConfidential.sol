// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {BankerAlgorithm} from "./BankerAlgorithm.sol";

/// @notice IReceiver — Keystone Forwarder delivers CRE reports via this interface.
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title Deal or NOT — CRE Confidential Compute (Phase 4)
/// @notice On-chain Deal or No Deal with Chainlink VRF + Price Feeds + CRE Confidential Compute.
///
///      SECURITY MODEL: VRF + CRE Secret + Attestation
///
///      VRF on-chain = FAIRNESS
///        The VRF seed is publicly verifiable. Anyone can confirm the random seed
///        was generated fairly by Chainlink VRF. This proves the game wasn't rigged.
///
///      CRE enclave secret = PRIVACY
///        A per-game secret is generated inside a CRE enclave and stored in the
///        Vault DON (threshold-encrypted via DKG). No single node can read it.
///        The player can't precompute case values because they're missing this secret.
///
///      Enclave attestation = INTEGRITY
///        The CRE enclave provides cryptographic proof that the correct computation
///        was performed: value = collapse(vrfSeed, caseIndex, secret, usedBitmap).
///
///      POST-GAME AUDITABILITY:
///        After the game ends, the CRE workflow publishes the secret. Anyone can
///        then replay every collapse and verify all values were computed correctly.
///
///      NO COMMIT-REVEAL:
///        Player calls openCase() — 1 TX. CRE handles the rest. No selective reveal
///        attack because the player never sees the value before it's on-chain.
///
///      "Does Howie know what's in the box? The DON does. But no single node does."
contract DealOrNotConfidential is VRFConsumerBaseV2Plus, IReceiver {
    using BankerAlgorithm for uint256[];

    // ── Constants ──
    uint8 public constant NUM_CASES = 5;
    uint8 public constant NUM_ROUNDS = 4;
    uint256[5] public CASE_VALUES_CENTS = [1, 5, 10, 50, 100]; // $0.01 → $1.00

    // ── Chainlink VRF Config ──
    AggregatorV3Interface public immutable priceFeed;
    uint256 public s_subscriptionId;
    bytes32 public s_keyHash;
    uint32 public s_callbackGasLimit = 200000;
    uint16 public s_requestConfirmations = 1;

    // ── CRE Config ──
    address public creForwarder;     // Keystone Forwarder — authorized CRE workflow address

    // ── Enums ──
    enum GameMode { SinglePlayer, MultiPlayer }
    enum Phase {
        WaitingForVRF,         // 0: VRF requested
        Created,               // 1: seed received, pick case
        Round,                 // 2: choose case to open
        WaitingForCRE,         // 3: openCase called, CRE computing value
        AwaitingOffer,         // 4: value revealed, waiting for banker
        BankerOffer,           // 5: offer on the table
        FinalRound,            // 6: one case left — open it or deal
        WaitingForFinalCRE,    // 7: final case requested from CRE
        GameOver               // 8: done
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
        uint256[5] caseValues;       // Revealed values (0 = not yet revealed)
        bool[5] opened;
        uint8 pendingCaseIndex;      // Which case CRE is computing
        bytes32 gameSecret;          // Published after game for auditability
        uint256 createdAt;           // block.timestamp when VRF seed received (game becomes playable)
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
    event CaseOpenRequested(uint256 indexed gameId, uint8 caseIndex);
    event CaseRevealed(uint256 indexed gameId, uint8 caseIndex, uint256 valueCents);
    event RoundComplete(uint256 indexed gameId, uint8 round);
    event BankerAdded(uint256 indexed gameId, address indexed banker, bool isContract);
    event BankerBanned(uint256 indexed gameId, address indexed banker);
    event BankerOfferMade(uint256 indexed gameId, uint8 round, uint256 offerCents);
    event DealAccepted(uint256 indexed gameId, uint256 payoutCents);
    event DealRejected(uint256 indexed gameId, uint8 round);
    event FinalCaseRequested(uint256 indexed gameId);
    event GameResolved(uint256 indexed gameId, uint256 payoutCents, bool swapped);
    event GameSecretPublished(uint256 indexed gameId, bytes32 secret);
    event GameExpired(uint256 indexed gameId);
    event FundsRescued(address indexed to, uint256 amount);

    // ── Errors ──
    error WrongPhase(Phase expected, Phase actual);
    error NotHost();
    error NotPlayer();
    error NotAllowedBanker();
    error NotCREForwarder();
    error InvalidCase(uint8 index);
    error CaseAlreadyOpened(uint8 index);
    error CannotOpenOwnCase();
    error InvalidValue();
    error GameNotOver();
    error SecretAlreadyPublished();
    error SecretVerificationFailed();
    error GameNotActive();
    error GameNotExpired();
    error NoFundsToRescue();
    error TransferFailed();

    // ── Constructor ──
    constructor(
        address _vrfCoordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash,
        address _priceFeed,
        address _creForwarder
    ) VRFConsumerBaseV2Plus(_vrfCoordinator) {
        s_subscriptionId = _subscriptionId;
        s_keyHash = _keyHash;
        priceFeed = AggregatorV3Interface(_priceFeed);
        creForwarder = _creForwarder;
    }

    // ════════════════════════════════════════════════════════
    //                    GAME CREATION
    // ════════════════════════════════════════════════════════

    /// @notice Create a single-player game. Requests VRF for seed.
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

        // Request VRF seed — this is the FAIRNESS layer
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

        // Host is automatically an allowed human banker
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

    /// @dev Called by VRF Coordinator. Stores seed — game is ready.
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        uint256 gameId = vrfRequestToGame[requestId];
        Game storage g = _games[gameId];
        g.vrfSeed = randomWords[0];
        g.createdAt = block.timestamp;
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

    /// @notice Pick your case (0-4). Case value is unknown until game ends.
    function pickCase(uint256 gameId, uint8 caseIndex) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.Created);
        if (caseIndex >= NUM_CASES) revert InvalidCase(caseIndex);

        g.playerCase = caseIndex;
        g.phase = Phase.Round;

        emit CasePicked(gameId, caseIndex);
    }

    /// @notice Open a case — 1 TX. No commit-reveal needed.
    ///         Emits CaseOpenRequested → CRE picks up → computes value → writes back.
    ///         Player CANNOT see the value before it's on-chain. No selective reveal.
    function openCase(uint256 gameId, uint8 caseIndex) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.Round);
        if (caseIndex >= NUM_CASES) revert InvalidCase(caseIndex);
        if (caseIndex == g.playerCase) revert CannotOpenOwnCase();
        if (g.opened[caseIndex]) revert CaseAlreadyOpened(caseIndex);

        g.pendingCaseIndex = caseIndex;
        g.phase = Phase.WaitingForCRE;

        emit CaseOpenRequested(gameId, caseIndex);
    }

    /// @notice CRE callback — writes the computed case value.
    ///         Only callable by the authorized CRE Keystone Forwarder.
    ///
    ///         The CRE enclave computed:
    ///           value = collapse(vrfSeed, caseIndex, CRE_SECRET, usedValuesBitmap)
    ///
    ///         The player never had access to CRE_SECRET, so they couldn't precompute.
    function fulfillCaseValue(uint256 gameId, uint8 caseIndex, uint256 valueCents) external {
        _requireCRE();
        _fulfillCaseValue(gameId, caseIndex, valueCents);
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

    /// @notice DEAL — accept the banker's offer. Game over.
    ///         CRE will reveal remaining cases and publish secret for auditability.
    function acceptDeal(uint256 gameId) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.BankerOffer);

        g.finalPayout = g.bankerOffer;
        g.phase = Phase.GameOver;

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

    /// @notice Final round: player keeps their case (NO DEAL all the way).
    ///         Requests CRE to reveal the last case + player's case.
    function keepCase(uint256 gameId) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.FinalRound);

        // Request reveal of the last remaining non-player case
        uint8 lastCase = _findLastCase(g);
        g.pendingCaseIndex = lastCase;
        g.phase = Phase.WaitingForFinalCRE;

        emit FinalCaseRequested(gameId);
        emit CaseOpenRequested(gameId, lastCase);
    }

    /// @notice Final round: player swaps their case for the remaining one.
    function swapCase(uint256 gameId) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.FinalRound);

        uint8 lastCase = _findLastCase(g);

        // Swap: player's case becomes the last remaining case
        uint8 oldPlayerCase = g.playerCase;
        g.playerCase = lastCase;

        // Request reveal of old player case (now the "remaining" case)
        g.pendingCaseIndex = oldPlayerCase;
        g.phase = Phase.WaitingForFinalCRE;

        emit FinalCaseRequested(gameId);
        emit CaseOpenRequested(gameId, oldPlayerCase);
    }

    /// @notice CRE publishes the per-game secret after game ends.
    ///         Anyone can now re-derive all values: collapse(vrfSeed, caseIndex, secret, bitmap).
    function publishGameSecret(uint256 gameId, bytes32 secret) external {
        _requireCRE();
        _publishGameSecret(gameId, secret);
    }

    /// @notice CRE game timer — expire a game that's been active > 10 minutes.
    ///         Jackpot is NOT automatically cleared here — SponsorJackpot handles that.
    function expireGame(uint256 gameId) external {
        _requireCRE();
        _expireGame(gameId);
    }

    // ════════════════════════════════════════════════════════
    //              IReceiver (KEYSTONE FORWARDER)
    // ════════════════════════════════════════════════════════

    /// @notice Called by KeystoneForwarder to deliver CRE workflow reports.
    ///         The report payload contains ABI-encoded function call data (selector + args).
    ///         Dispatches to the appropriate internal handler.
    function onReport(bytes calldata /* metadata */, bytes calldata report) external override {
        if (msg.sender != creForwarder) revert NotCREForwarder();

        bytes4 selector = bytes4(report[:4]);

        if (selector == this.fulfillCaseValue.selector) {
            (uint256 gameId, uint8 caseIndex, uint256 valueCents) =
                abi.decode(report[4:], (uint256, uint8, uint256));
            _fulfillCaseValue(gameId, caseIndex, valueCents);
        } else if (selector == this.publishGameSecret.selector) {
            (uint256 gameId, bytes32 secret) =
                abi.decode(report[4:], (uint256, bytes32));
            _publishGameSecret(gameId, secret);
        } else if (selector == this.expireGame.selector) {
            (uint256 gameId) = abi.decode(report[4:], (uint256));
            _expireGame(gameId);
        } else {
            revert("Unknown report selector");
        }
    }

    /// @notice ERC165 — declares support for IReceiver so KeystoneForwarder can verify.
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId  // IReceiver
            || interfaceId == 0x01ffc9a7;                  // IERC165
    }

    // ════════════════════════════════════════════════════════
    //                  VIEW FUNCTIONS
    // ════════════════════════════════════════════════════════

    /// @notice On-chain banker offer calculation.
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

    /// @notice Values still in the pool (not yet revealed).
    function getRemainingValuePool(uint256 gameId) external view returns (uint256[] memory) {
        return _getRemainingValuePool(_games[gameId]);
    }

    /// @notice Full game state (matches DealOrNot.sol signature for frontend compatibility).
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

    /// @notice Get the published game secret (separate to avoid stack-too-deep).
    function getGameSecret(uint256 gameId) external view returns (bytes32) {
        return _games[gameId].gameSecret;
    }

    /// @notice Get VRF request ID for a game (for VRF fulfillment in tests).
    function getVRFRequestId(uint256 gameId) external view returns (uint256) {
        return _games[gameId].vrfRequestId;
    }

    /// @notice Get game creation timestamp (for CRE timer workflow).
    function getGameCreatedAt(uint256 gameId) external view returns (uint256) {
        return _games[gameId].createdAt;
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

    /// @notice Verify a game's values against the published secret.
    ///         Re-derives all collapsed values using: hash(vrfSeed, caseIndex, secret, collapseOrder).
    ///         Returns true if all revealed values match.
    function verifyGame(uint256 gameId) external view returns (bool) {
        Game storage g = _games[gameId];
        if (g.gameSecret == bytes32(0)) return false; // Secret not published yet

        // Replay collapses with the published secret
        uint256 replayBitmap = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (g.caseValues[i] == 0) continue; // Not revealed

            // Re-derive value using published secret
            uint256 derivedValue = _deriveValue(g.vrfSeed, i, g.gameSecret, replayBitmap);
            if (derivedValue != g.caseValues[i]) return false;

            // Mark value as used in replay bitmap
            for (uint8 j = 0; j < NUM_CASES; j++) {
                if (CASE_VALUES_CENTS[j] == derivedValue && (replayBitmap & (1 << j)) == 0) {
                    replayBitmap |= (1 << j);
                    break;
                }
            }
        }
        return true;
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

    /// @notice Owner can update the CRE forwarder address.
    function setCREForwarder(address _creForwarder) external onlyOwner {
        creForwarder = _creForwarder;
    }

    receive() external payable {}

    // ════════════════════════════════════════════════════════
    //            CRE CONFIDENTIAL COLLAPSE ENGINE
    // ════════════════════════════════════════════════════════
    //
    // The collapse algorithm is the SAME as Phase 2's _collapseCase(),
    // but with one crucial difference: the entropy source.
    //
    // Phase 2:  hash(vrfSeed, caseIndex, totalCollapsed, blockhash(commitBlock))
    //           ↑ ALL PUBLIC after commit block is mined → precomputable
    //
    // Phase 4:  hash(vrfSeed, caseIndex, CRE_SECRET, usedValuesBitmap)
    //           ↑ CRE_SECRET is PRIVATE (Vault DON) → NOT precomputable
    //
    // The CRE enclave runs this same derivation off-chain, then writes
    // the result via fulfillCaseValue(). The secret is published post-game
    // so anyone can verify.

    /// @dev Derive a case value from the secret. Used for verification.
    ///      This is the same algorithm the CRE enclave runs.
    function _deriveValue(
        uint256 vrfSeed,
        uint8 caseIndex,
        bytes32 secret,
        uint256 bitmap
    ) internal view returns (uint256) {
        // Count remaining unused values
        uint8 remaining = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((bitmap & (1 << i)) == 0) remaining++;
        }
        if (remaining == 0) return 0;

        // Deterministic pick using secret as entropy
        uint256 pick = uint256(keccak256(abi.encodePacked(
            vrfSeed, caseIndex, secret, bitmap
        ))) % remaining;

        // Walk unused values to find the picked one
        uint8 count = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((bitmap & (1 << i)) == 0) {
                if (count == pick) {
                    return CASE_VALUES_CENTS[i];
                }
                count++;
            }
        }
        return 0; // unreachable
    }

    // ════════════════════════════════════════════════════════
    //                  INTERNAL HELPERS
    // ════════════════════════════════════════════════════════

    function _fulfillCaseValue(uint256 gameId, uint8 caseIndex, uint256 valueCents) internal {
        Game storage g = _games[gameId];

        // Verify this is the pending case
        if (g.phase != Phase.WaitingForCRE && g.phase != Phase.WaitingForFinalCRE) {
            revert WrongPhase(Phase.WaitingForCRE, g.phase);
        }
        if (caseIndex != g.pendingCaseIndex) revert InvalidCase(caseIndex);

        // Validate the value is in our value set and not already used
        if (!_isValidUnusedValue(g, valueCents)) revert InvalidValue();

        // Assign value
        g.caseValues[caseIndex] = valueCents;
        g.opened[caseIndex] = true;
        _markValueUsed(g, valueCents);
        g.totalCollapsed++;

        emit CaseRevealed(gameId, caseIndex, valueCents);

        // Handle final reveal vs normal round
        if (g.phase == Phase.WaitingForFinalCRE) {
            _completeFinalReveal(g, gameId);
            return;
        }

        // Check remaining unopened non-player cases
        uint8 remaining = _countRemaining(g);
        if (remaining == 1) {
            g.phase = Phase.FinalRound;
        } else {
            g.phase = Phase.AwaitingOffer;
        }
        emit RoundComplete(gameId, g.currentRound);
    }

    function _publishGameSecret(uint256 gameId, bytes32 secret) internal {
        Game storage g = _games[gameId];
        if (g.phase != Phase.GameOver) revert GameNotOver();
        if (g.gameSecret != bytes32(0)) revert SecretAlreadyPublished();

        g.gameSecret = secret;
        emit GameSecretPublished(gameId, secret);
    }

    function _expireGame(uint256 gameId) internal {
        Game storage g = _games[gameId];
        if (g.phase == Phase.GameOver) revert GameNotActive();
        if (g.createdAt == 0 || block.timestamp <= g.createdAt + 600) revert GameNotExpired();

        g.finalPayout = 0;
        g.phase = Phase.GameOver;
        emit GameExpired(gameId);
    }

    function _completeFinalReveal(Game storage g, uint256 gameId) internal {
        // The last non-player case was just revealed. Now reveal player's case.
        // The player's case value is the only value remaining in the pool.
        uint256 playerValue = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((g.usedValuesBitmap & (1 << i)) == 0) {
                playerValue = CASE_VALUES_CENTS[i];
                g.usedValuesBitmap |= (1 << i);
                break;
            }
        }

        g.caseValues[g.playerCase] = playerValue;
        g.totalCollapsed++;
        g.finalPayout = playerValue;
        g.phase = Phase.GameOver;

        emit CaseRevealed(gameId, g.playerCase, playerValue);
        emit GameResolved(gameId, g.finalPayout, false);
    }

    function _isValidUnusedValue(Game storage g, uint256 valueCents) internal view returns (bool) {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (CASE_VALUES_CENTS[i] == valueCents && (g.usedValuesBitmap & (1 << i)) == 0) {
                return true;
            }
        }
        return false;
    }

    function _markValueUsed(Game storage g, uint256 valueCents) internal {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (CASE_VALUES_CENTS[i] == valueCents && (g.usedValuesBitmap & (1 << i)) == 0) {
                g.usedValuesBitmap |= (1 << i);
                return;
            }
        }
    }

    function _countRemaining(Game storage g) internal view returns (uint8) {
        uint8 count = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (!g.opened[i] && i != g.playerCase) count++;
        }
        return count;
    }

    function _findLastCase(Game storage g) internal view returns (uint8) {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (!g.opened[i] && i != g.playerCase) return i;
        }
        revert("no remaining case");
    }

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
        uint256[] memory pool = new uint256[](NUM_CASES);
        for (uint8 i = 0; i < NUM_CASES; i++) {
            pool[i] = CASE_VALUES_CENTS[i];
        }
        return pool;
    }

    function _requirePlayer(Game storage g) internal view {
        if (msg.sender != g.player) revert NotPlayer();
    }

    function _requirePhase(Game storage g, Phase expected) internal view {
        if (g.phase != expected) revert WrongPhase(expected, g.phase);
    }

    function _requireCRE() internal view {
        if (msg.sender != creForwarder) revert NotCREForwarder();
    }
}
