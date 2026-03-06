import { BigInt, log } from "@graphprotocol/graph-ts";
import {
  MarketCreated,
  BetPlaced,
  MarketResolved,
  PayoutClaimed,
  PredictionMarket,
} from "../generated/PredictionMarket/PredictionMarket";
import { Market, Bet, User, GlobalStats, Agent } from "../generated/schema";

// Constants
const ZERO_BI = BigInt.fromI32(0);
const ONE_BI = BigInt.fromI32(1);
const BASIS_POINTS = BigInt.fromI32(10000);

// Helper to load or create GlobalStats
function loadOrCreateGlobalStats(): GlobalStats {
  let stats = GlobalStats.load("1");
  if (stats == null) {
    stats = new GlobalStats("1");
    stats.totalMarkets = 0;
    stats.totalBets = 0;
    stats.totalVolume = ZERO_BI;
    stats.totalFeesCollected = ZERO_BI;
    stats.activeMarkets = 0;
    stats.resolvedMarkets = 0;
    stats.save();
  }
  return stats;
}

// Helper to load or create User
function loadOrCreateUser(address: string): User {
  let user = User.load(address);
  if (user == null) {
    user = new User(address);
    user.totalBets = 0;
    user.totalStaked = ZERO_BI;
    user.totalWon = ZERO_BI;
    user.totalClaimed = ZERO_BI;
    user.activeBets = 0;
    user.wonBets = 0;
    user.lostBets = 0;
    user.save();
  }
  return user;
}

// Helper to calculate odds
function calculateOdds(pool: BigInt, totalPool: BigInt): BigInt {
  if (totalPool.equals(ZERO_BI)) {
    return BigInt.fromI32(5000); // 50% if no bets
  }
  return pool.times(BASIS_POINTS).div(totalPool);
}

export function handleMarketCreated(event: MarketCreated): void {
  let marketId = event.params.marketId.toString();
  let market = new Market(marketId);

  // Fetch market data from contract
  let contract = PredictionMarket.bind(event.address);
  let marketData = contract.try_getMarket(event.params.marketId);

  if (!marketData.reverted) {
    market.gameId = marketData.value.gameId;
    market.agentId = marketData.value.agentId;
    market.marketType = getMarketTypeString(marketData.value.marketType);
    market.targetValue = marketData.value.targetValue;
    market.status = getMarketStatusString(marketData.value.status);
    market.createdAt = marketData.value.createdAt;
    market.lockTime = marketData.value.lockTime;
    market.outcome = false;
    market.totalPool = ZERO_BI;
    market.yesPool = ZERO_BI;
    market.noPool = ZERO_BI;
    market.totalBets = 0;
    market.resolved = false;
    market.resolvedAt = null;
    market.yesOdds = BigInt.fromI32(5000); // 50%
    market.noOdds = BigInt.fromI32(5000); // 50%

    // Link to agent if exists
    let agentId = marketData.value.agentId.toString();
    let agent = Agent.load(agentId);
    if (agent != null) {
      market.agent = agentId;
      agent.totalMarkets = agent.totalMarkets + 1;
      agent.save();
    }

    market.save();

    // Update global stats
    let stats = loadOrCreateGlobalStats();
    stats.totalMarkets = stats.totalMarkets + 1;
    stats.activeMarkets = stats.activeMarkets + 1;
    stats.save();

    log.info("Market created: {}", [marketId]);
  }
}

export function handleBetPlaced(event: BetPlaced): void {
  let betId = event.params.betId.toString();
  let marketId = event.params.marketId.toString();
  let bettor = event.params.bettor.toHexString();

  // Load market
  let market = Market.load(marketId);
  if (market == null) {
    log.error("Market not found: {}", [marketId]);
    return;
  }

  // Create bet
  let bet = new Bet(betId);
  bet.market = marketId;
  bet.bettor = bettor;
  bet.prediction = event.params.prediction;
  bet.amount = event.params.amount;
  bet.timestamp = event.block.timestamp;
  bet.claimed = false;
  bet.won = null;
  bet.payout = null;
  bet.save();

  // Update market pools
  market.totalPool = market.totalPool.plus(event.params.amount);
  if (event.params.prediction) {
    market.yesPool = market.yesPool.plus(event.params.amount);
  } else {
    market.noPool = market.noPool.plus(event.params.amount);
  }
  market.totalBets = market.totalBets + 1;

  // Recalculate odds
  market.yesOdds = calculateOdds(market.yesPool, market.totalPool);
  market.noOdds = calculateOdds(market.noPool, market.totalPool);
  market.save();

  // Update user stats
  let user = loadOrCreateUser(bettor);
  user.totalBets = user.totalBets + 1;
  user.totalStaked = user.totalStaked.plus(event.params.amount);
  user.activeBets = user.activeBets + 1;
  user.save();

  // Update global stats
  let stats = loadOrCreateGlobalStats();
  stats.totalBets = stats.totalBets + 1;
  stats.totalVolume = stats.totalVolume.plus(event.params.amount);
  stats.save();

  log.info("Bet placed: {} on market {} by {}", [betId, marketId, bettor]);
}

export function handleMarketResolved(event: MarketResolved): void {
  let marketId = event.params.marketId.toString();
  let market = Market.load(marketId);

  if (market == null) {
    log.error("Market not found: {}", [marketId]);
    return;
  }

  market.status = "Resolved";
  market.outcome = event.params.outcome;
  market.resolved = true;
  market.resolvedAt = event.block.timestamp;
  market.save();

  // Update bets with outcome
  let bets = market.bets.load();
  for (let i = 0; i < bets.length; i++) {
    let bet = bets[i];
    bet.won = bet.prediction == event.params.outcome;

    if (bet.won) {
      // Calculate payout (simplified - actual calculation should match contract)
      let winningPool = event.params.outcome ? market.yesPool : market.noPool;
      if (!winningPool.equals(ZERO_BI)) {
        let platformFee = market.totalPool.times(BigInt.fromI32(200)).div(BASIS_POINTS);
        let payoutPool = market.totalPool.minus(platformFee);
        bet.payout = bet.amount.times(payoutPool).div(winningPool);
      } else {
        bet.payout = ZERO_BI;
      }
    } else {
      bet.payout = ZERO_BI;
    }

    bet.save();

    // Update user stats
    let user = loadOrCreateUser(bet.bettor);
    user.activeBets = user.activeBets - 1;
    if (bet.won) {
      user.wonBets = user.wonBets + 1;
      user.totalWon = user.totalWon.plus(bet.payout!);
    } else {
      user.lostBets = user.lostBets + 1;
    }
    user.save();
  }

  // Update global stats
  let stats = loadOrCreateGlobalStats();
  stats.activeMarkets = stats.activeMarkets - 1;
  stats.resolvedMarkets = stats.resolvedMarkets + 1;
  stats.save();

  log.info("Market resolved: {} outcome={}", [marketId, event.params.outcome ? "YES" : "NO"]);
}

export function handlePayoutClaimed(event: PayoutClaimed): void {
  let marketId = event.params.marketId.toString();
  let bettor = event.params.winner.toHexString();

  // Find the bet (we need to iterate through bets for this market)
  let market = Market.load(marketId);
  if (market == null) {
    log.error("Market not found: {}", [marketId]);
    return;
  }

  let bets = market.bets.load();
  for (let i = 0; i < bets.length; i++) {
    let bet = bets[i];
    if (bet.bettor == bettor && !bet.claimed) {
      bet.claimed = true;
      bet.save();

      // Update user stats
      let user = loadOrCreateUser(bettor);
      user.totalClaimed = user.totalClaimed.plus(event.params.amount);
      user.save();

      log.info("Payout claimed: market={} bettor={} amount={}", [
        marketId,
        bettor,
        event.params.amount.toString(),
      ]);
      break;
    }
  }
}

// Helper functions to convert enum to string
function getMarketTypeString(type: i32): string {
  if (type == 0) return "WillWin";
  if (type == 1) return "EarningsOver";
  if (type == 2) return "WillAcceptOffer";
  if (type == 3) return "RoundPrediction";
  return "WillWin";
}

function getMarketStatusString(status: i32): string {
  if (status == 0) return "Open";
  if (status == 1) return "Locked";
  if (status == 2) return "Resolved";
  if (status == 3) return "Cancelled";
  return "Open";
}
