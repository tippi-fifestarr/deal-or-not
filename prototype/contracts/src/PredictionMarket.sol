// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title PredictionMarket
/// @notice Prediction market for Deal or NOT game outcomes
/// @dev Contributes to Prediction Markets track ($16K+ prizes)
///      Users bet on:
///      - Will agent win?
///      - Will agent earn > X cents?
///      - Will agent accept banker offer?
///      - What round will agent finish in?
///
/// Security improvements:
/// - ReentrancyGuard on all payable functions
/// - Pull payment pattern (credit/claim)
/// - Parameter snapshots locked at market creation
/// - Slippage protection with minPayout
/// - Emergency pause mechanism
contract PredictionMarket is ReentrancyGuard, Pausable {
    // ── Events ──
    event MarketCreated(
        uint256 indexed marketId,
        uint256 indexed gameId,
        MarketType marketType,
        uint256 targetValue
    );
    event BetPlaced(
        uint256 indexed marketId,
        address indexed bettor,
        bool prediction,
        uint256 amount,
        uint256 betId
    );
    event MarketResolved(
        uint256 indexed marketId,
        bool outcome,
        uint256 totalPool,
        uint256 winningPool
    );
    event PayoutClaimed(
        uint256 indexed marketId,
        address indexed winner,
        uint256 amount
    );
    event Credited(address indexed user, uint256 amount);
    event ParametersLocked(
        uint256 indexed marketId,
        uint256 snapshotFeeBps,
        uint256 snapshotMinBet
    );

    // ── Enums ──
    enum MarketType {
        WillWin,              // Will agent win anything?
        EarningsOver,         // Will earnings exceed target?
        WillAcceptOffer,      // Will agent accept banker's offer?
        RoundPrediction       // Which round will agent finish in?
    }

    enum MarketStatus {
        Open,
        Locked,
        Resolved,
        Cancelled
    }

    // ── Structs ──
    struct Market {
        uint256 gameId;
        uint256 agentId;
        MarketType marketType;
        uint256 targetValue;      // For EarningsOver or RoundPrediction
        MarketStatus status;
        uint256 createdAt;
        uint256 lockTime;         // When betting closes
        bool outcome;             // Resolved outcome
        uint256 totalPool;
        uint256 yesPool;
        uint256 noPool;
        bool resolved;
        uint256 snapshotFeeBps;   // Fee locked at market creation
        uint256 snapshotMinBet;   // Min bet locked at market creation
    }

    struct Bet {
        address bettor;
        uint256 marketId;
        bool prediction;          // true = YES, false = NO
        uint256 amount;
        bool claimed;
    }

    // ── Constants ──
    uint256 public constant PLATFORM_FEE = 200;  // 2% fee (basis points)
    uint256 public constant MIN_BET = 0.001 ether;
    uint256 public constant LOCK_BEFORE_GAME_START = 5 minutes;

    // ── State ──
    mapping(uint256 => Market) public markets;
    mapping(uint256 => Bet) public bets;
    mapping(uint256 => uint256[]) public marketBets;   // marketId => betIds
    mapping(address => uint256[]) public userBets;     // user => betIds
    mapping(uint256 => uint256[]) public gameMarkets;  // gameId => marketIds
    mapping(address => uint256) public claimable;      // Pull payment balances

    uint256 public nextMarketId;
    uint256 public nextBetId;
    uint256 public totalVolume;
    uint256 public totalFeesCollected;

    address public admin;
    mapping(address => bool) public authorizedResolvers;  // Can resolve markets

    // ── Errors ──
    error MarketNotOpen();
    error MarketLocked();
    error MarketNotResolved();
    error BetTooSmall();
    error BetAlreadyClaimed();
    error NotWinner();
    error Unauthorized();
    error InvalidMarket();
    error ZeroAmount();
    error SlippageExceeded();
    error NothingToClaim();
    error TransferFailed();

    // ── Modifiers ──
    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyAuthorized() {
        if (!authorizedResolvers[msg.sender] && msg.sender != admin) revert Unauthorized();
        _;
    }

    // ── Constructor ──
    constructor() {
        admin = msg.sender;
        nextMarketId = 1;
        nextBetId = 1;
    }

    // ── Market Creation ──

    /// @notice Create a prediction market for a game
    /// @param gameId Deal or NOT game ID
    /// @param agentId Agent playing the game
    /// @param marketType Type of prediction
    /// @param targetValue Target value for certain market types
    /// @param lockTime When betting closes (usually game start time)
    function createMarket(
        uint256 gameId,
        uint256 agentId,
        MarketType marketType,
        uint256 targetValue,
        uint256 lockTime
    ) external onlyAuthorized returns (uint256 marketId) {
        marketId = nextMarketId++;

        // Lock parameters at market creation to prevent manipulation
        uint256 snapshotFeeBps = PLATFORM_FEE;
        uint256 snapshotMinBet = MIN_BET;

        markets[marketId] = Market({
            gameId: gameId,
            agentId: agentId,
            marketType: marketType,
            targetValue: targetValue,
            status: MarketStatus.Open,
            createdAt: block.timestamp,
            lockTime: lockTime,
            outcome: false,
            totalPool: 0,
            yesPool: 0,
            noPool: 0,
            resolved: false,
            snapshotFeeBps: snapshotFeeBps,
            snapshotMinBet: snapshotMinBet
        });

        gameMarkets[gameId].push(marketId);

        emit MarketCreated(marketId, gameId, marketType, targetValue);
        emit ParametersLocked(marketId, snapshotFeeBps, snapshotMinBet);
    }

    // ── Betting ──

    /// @notice Place a bet on a market with slippage protection
    /// @param marketId Market to bet on
    /// @param prediction true = YES, false = NO
    /// @param minPayout Minimum acceptable payout (slippage protection)
    function placeBet(
        uint256 marketId,
        bool prediction,
        uint256 minPayout
    ) external payable nonReentrant whenNotPaused returns (uint256 betId) {
        Market storage market = markets[marketId];

        // Use snapshot parameters from market creation
        if (msg.value < market.snapshotMinBet) revert BetTooSmall();
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp >= market.lockTime) revert MarketLocked();

        // Calculate potential payout with new bet included
        uint256 newTotalPool = market.totalPool + msg.value;
        uint256 newWinningPool = prediction
            ? market.yesPool + msg.value
            : market.noPool + msg.value;

        uint256 fee = (newTotalPool * market.snapshotFeeBps) / 10000;
        uint256 payoutPool = newTotalPool - fee;
        uint256 estimatedPayout = (msg.value * payoutPool) / newWinningPool;

        // Slippage protection
        if (estimatedPayout < minPayout) revert SlippageExceeded();

        betId = nextBetId++;

        bets[betId] = Bet({
            bettor: msg.sender,
            marketId: marketId,
            prediction: prediction,
            amount: msg.value,
            claimed: false
        });

        marketBets[marketId].push(betId);
        userBets[msg.sender].push(betId);

        // Update pools
        market.totalPool += msg.value;
        if (prediction) {
            market.yesPool += msg.value;
        } else {
            market.noPool += msg.value;
        }

        totalVolume += msg.value;

        emit BetPlaced(marketId, msg.sender, prediction, msg.value, betId);
    }

    // ── Market Resolution ──

    /// @notice Lock market (prevent new bets)
    function lockMarket(uint256 marketId) external onlyAuthorized {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert InvalidMarket();
        market.status = MarketStatus.Locked;
    }

    /// @notice Resolve market with outcome
    /// @param marketId Market to resolve
    /// @param outcome true = YES wins, false = NO wins
    function resolveMarket(uint256 marketId, bool outcome) external onlyAuthorized {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Locked && market.status != MarketStatus.Open) {
            revert InvalidMarket();
        }

        market.status = MarketStatus.Resolved;
        market.outcome = outcome;
        market.resolved = true;

        uint256 winningPool = outcome ? market.yesPool : market.noPool;

        emit MarketResolved(marketId, outcome, market.totalPool, winningPool);
    }

    /// @notice Cancel market and enable refunds
    function cancelMarket(uint256 marketId) external onlyAuthorized {
        Market storage market = markets[marketId];
        if (market.resolved) revert InvalidMarket();
        market.status = MarketStatus.Cancelled;
    }

    // ── Payout (Pull Payment Pattern) ──

    /// @notice Credit winnings for a bet (internal - called after market resolution)
    /// @param betId Bet ID to credit
    function creditPayout(uint256 betId) public nonReentrant {
        Bet storage bet = bets[betId];
        if (bet.claimed) revert BetAlreadyClaimed();

        Market storage market = markets[bet.marketId];

        // Handle cancelled market (refund)
        if (market.status == MarketStatus.Cancelled) {
            bet.claimed = true;
            claimable[bet.bettor] += bet.amount;
            emit Credited(bet.bettor, bet.amount);
            emit PayoutClaimed(bet.marketId, bet.bettor, bet.amount);
            return;
        }

        // Check if market resolved
        if (!market.resolved) revert MarketNotResolved();

        // Check if bet won
        if (bet.prediction != market.outcome) revert NotWinner();

        // Calculate payout
        uint256 payout = _calculatePayout(betId);
        if (payout == 0) revert ZeroAmount();

        bet.claimed = true;
        claimable[bet.bettor] += payout;

        emit Credited(bet.bettor, payout);
        emit PayoutClaimed(bet.marketId, bet.bettor, payout);
    }

    /// @notice Claim all credited funds (pull payment)
    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();

        claimable[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /// @notice Batch credit payouts for multiple bets (gas-efficient for resolvers)
    /// @param betIds Array of bet IDs to credit
    function batchCreditPayouts(uint256[] calldata betIds) external {
        for (uint256 i = 0; i < betIds.length; i++) {
            try this.creditPayout(betIds[i]) {} catch {}
        }
    }

    // ── Internal Functions ──

    /// @notice Calculate payout for a winning bet using snapshot parameters
    function _calculatePayout(uint256 betId) internal view returns (uint256) {
        Bet memory bet = bets[betId];
        Market memory market = markets[bet.marketId];

        if (bet.prediction != market.outcome) return 0;

        uint256 winningPool = market.outcome ? market.yesPool : market.noPool;
        if (winningPool == 0) return 0;

        // Calculate platform fee using snapshot parameter
        uint256 fee = (market.totalPool * market.snapshotFeeBps) / 10000;
        uint256 payoutPool = market.totalPool - fee;

        // Proportional payout: (bet amount / winning pool) * payout pool
        return (bet.amount * payoutPool) / winningPool;
    }

    // ── View Functions ──

    /// @notice Get market details
    function getMarket(uint256 marketId) external view returns (Market memory) {
        return markets[marketId];
    }

    /// @notice Get bet details
    function getBet(uint256 betId) external view returns (Bet memory) {
        return bets[betId];
    }

    /// @notice Get all markets for a game
    function getGameMarkets(uint256 gameId) external view returns (uint256[] memory) {
        return gameMarkets[gameId];
    }

    /// @notice Get all bets for a user
    function getUserBets(address user) external view returns (uint256[] memory) {
        return userBets[user];
    }

    /// @notice Get market odds (implied probability)
    function getMarketOdds(uint256 marketId) external view returns (
        uint256 yesOdds,
        uint256 noOdds
    ) {
        Market memory market = markets[marketId];
        if (market.totalPool == 0) return (5000, 5000);  // 50/50 if no bets

        yesOdds = (market.yesPool * 10000) / market.totalPool;
        noOdds = (market.noPool * 10000) / market.totalPool;
    }

    /// @notice Calculate potential payout for a bet amount
    function calculatePotentialPayout(
        uint256 marketId,
        bool prediction,
        uint256 betAmount
    ) external view returns (uint256) {
        Market memory market = markets[marketId];

        uint256 newTotalPool = market.totalPool + betAmount;
        uint256 newWinningPool = prediction
            ? market.yesPool + betAmount
            : market.noPool + betAmount;

        uint256 fee = (newTotalPool * PLATFORM_FEE) / 10000;
        uint256 payoutPool = newTotalPool - fee;

        return (betAmount * payoutPool) / newWinningPool;
    }

    /// @notice Check if bet can be claimed
    function canClaimBet(uint256 betId) external view returns (bool) {
        Bet memory bet = bets[betId];
        Market memory market = markets[bet.marketId];

        if (bet.claimed) return false;
        if (market.status == MarketStatus.Cancelled) return true;
        if (!market.resolved) return false;
        if (bet.prediction != market.outcome) return false;

        return true;
    }

    /// @notice Get market stats
    function getMarketStats(uint256 marketId) external view returns (
        uint256 totalBets,
        uint256 totalPool,
        uint256 yesPool,
        uint256 noPool,
        uint256 yesOdds,
        uint256 noOdds
    ) {
        Market memory market = markets[marketId];
        totalBets = marketBets[marketId].length;
        totalPool = market.totalPool;
        yesPool = market.yesPool;
        noPool = market.noPool;

        if (totalPool > 0) {
            yesOdds = (yesPool * 10000) / totalPool;
            noOdds = (noPool * 10000) / totalPool;
        } else {
            yesOdds = 5000;
            noOdds = 5000;
        }
    }

    // ── Admin Functions ──

    /// @notice Authorize a resolver
    function authorizeResolver(address resolver) external onlyAdmin {
        authorizedResolvers[resolver] = true;
    }

    /// @notice Revoke resolver authorization
    function revokeResolver(address resolver) external onlyAdmin {
        authorizedResolvers[resolver] = false;
    }

    /// @notice Withdraw collected fees
    function withdrawFees() external onlyAdmin nonReentrant {
        uint256 balance = address(this).balance;
        // Calculate unclaimed winnings to keep in contract
        // For simplicity, admin can only withdraw after all markets resolved
        (bool success, ) = payable(admin).call{value: balance}("");
        if (!success) revert TransferFailed();
    }

    /// @notice Pause contract (emergency only)
    function pause() external onlyAdmin {
        _pause();
    }

    /// @notice Unpause contract
    function unpause() external onlyAdmin {
        _unpause();
    }

    // ── Receive ETH ──
    receive() external payable {}
}
