"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { GlassCard, GlassButton } from "@/components/glass";

enum MarketType {
  WillWin = 0,
  EarningsOver = 1,
  WillAcceptOffer = 2,
  RoundPrediction = 3,
}

enum MarketStatus {
  Open = 0,
  Locked = 1,
  Resolved = 2,
  Cancelled = 3,
}

type UserBet = {
  betId: number;
  marketId: number;
  marketTitle: string;
  marketType: MarketType;
  marketStatus: MarketStatus;
  gameId: number;
  agentName: string;
  prediction: boolean;
  amount: number;
  timestamp: number;
  claimed: boolean;
  outcome?: boolean;
  payout?: number;
  canClaim: boolean;
};

const MARKET_TYPE_LABELS: Record<MarketType, string> = {
  [MarketType.WillWin]: "Will Win?",
  [MarketType.EarningsOver]: "Earnings Over",
  [MarketType.WillAcceptOffer]: "Will Accept Offer?",
  [MarketType.RoundPrediction]: "Round Prediction",
};

const STATUS_LABELS: Record<MarketStatus, string> = {
  [MarketStatus.Open]: "Open",
  [MarketStatus.Locked]: "Locked",
  [MarketStatus.Resolved]: "Resolved",
  [MarketStatus.Cancelled]: "Cancelled",
};

export default function MyBetsPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const [filter, setFilter] = useState<"all" | "active" | "claimable">("all");
  const [claimingBetId, setClaimingBetId] = useState<number | null>(null);

  // TODO: Replace with actual contract reads from getUserBets and canClaimBet
  const mockBets: UserBet[] = [
    {
      betId: 1,
      marketId: 1,
      marketTitle: "Will Win?",
      marketType: MarketType.WillWin,
      marketStatus: MarketStatus.Open,
      gameId: 42,
      agentName: "GreedyBot",
      prediction: true,
      amount: 0.05,
      timestamp: Date.now() - 3600000,
      claimed: false,
      canClaim: false,
    },
    {
      betId: 2,
      marketId: 3,
      marketTitle: "Will Accept Offer?",
      marketType: MarketType.WillAcceptOffer,
      marketStatus: MarketStatus.Resolved,
      gameId: 41,
      agentName: "GreedyBot",
      prediction: false,
      amount: 0.1,
      timestamp: Date.now() - 7200000,
      claimed: false,
      outcome: false,
      payout: 0.176,
      canClaim: true,
    },
    {
      betId: 3,
      marketId: 2,
      marketTitle: "Earnings Over $0.50",
      marketType: MarketType.EarningsOver,
      marketStatus: MarketStatus.Locked,
      gameId: 43,
      agentName: "ConservativeAgent",
      prediction: true,
      amount: 0.15,
      timestamp: Date.now() - 1800000,
      claimed: false,
      canClaim: false,
    },
    {
      betId: 4,
      marketId: 5,
      marketTitle: "Will Win?",
      marketType: MarketType.WillWin,
      marketStatus: MarketStatus.Resolved,
      gameId: 40,
      agentName: "RiskyRick",
      prediction: true,
      amount: 0.08,
      timestamp: Date.now() - 14400000,
      claimed: true,
      outcome: true,
      payout: 0.134,
      canClaim: false,
    },
  ];

  const filteredBets = mockBets.filter((bet) => {
    if (filter === "active")
      return bet.marketStatus === MarketStatus.Open || bet.marketStatus === MarketStatus.Locked;
    if (filter === "claimable") return bet.canClaim;
    return true;
  });

  const handleClaimPayout = async (betId: number, payout: number) => {
    setClaimingBetId(betId);
    try {
      // TODO: Call claimPayout on PredictionMarket contract
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate tx
      alert(`Claimed ${payout.toFixed(4)} ETH!`);
    } catch (error) {
      console.error("Claim failed:", error);
      alert("Claim failed. See console for details.");
    } finally {
      setClaimingBetId(null);
    }
  };

  if (!isConnected) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <GlassCard className="p-12 text-center">
          <h1 className="text-3xl font-bold text-white mb-4">My Bets</h1>
          <p className="text-gray-400 mb-6">
            Connect your wallet to view your bets and claim payouts.
          </p>
          <p className="text-white/30 text-sm italic">
            No wallet, no bets. The prophecy remains unwritten.
          </p>
        </GlassCard>
      </div>
    );
  }

  const totalBets = mockBets.length;
  const activeBets = mockBets.filter(
    (b) => b.marketStatus === MarketStatus.Open || b.marketStatus === MarketStatus.Locked
  ).length;
  const claimableBets = mockBets.filter((b) => b.canClaim).length;
  const totalStaked = mockBets.reduce((sum, b) => sum + b.amount, 0);
  const totalWon = mockBets
    .filter((b) => b.claimed && b.payout)
    .reduce((sum, b) => sum + (b.payout || 0) - b.amount, 0);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="mb-4 text-gray-400 hover:text-white flex items-center gap-2"
        >
          ← Back to Markets
        </button>
        <h1 className="text-4xl font-bold text-white mb-2">My Bets</h1>
        <p className="text-gray-400">Track your predictions and claim your winnings.</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <GlassCard className="p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{totalBets}</div>
          <div className="text-xs text-gray-400 mt-1">Total Bets</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{activeBets}</div>
          <div className="text-xs text-gray-400 mt-1">Active</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{claimableBets}</div>
          <div className="text-xs text-gray-400 mt-1">Claimable</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <div className="text-2xl font-bold text-purple-400">{totalStaked.toFixed(3)}</div>
          <div className="text-xs text-gray-400 mt-1">Total Staked</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <div
            className={`text-2xl font-bold ${totalWon >= 0 ? "text-green-400" : "text-red-400"}`}
          >
            {totalWon >= 0 ? "+" : ""}
            {totalWon.toFixed(3)}
          </div>
          <div className="text-xs text-gray-400 mt-1">Profit/Loss</div>
        </GlassCard>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        <GlassButton
          onClick={() => setFilter("all")}
          variant={filter === "all" ? "strong" : "regular"}
        >
          All Bets
        </GlassButton>
        <GlassButton
          onClick={() => setFilter("active")}
          variant={filter === "active" ? "strong" : "regular"}
        >
          Active
        </GlassButton>
        <GlassButton
          onClick={() => setFilter("claimable")}
          variant={filter === "claimable" ? "strong" : "regular"}
        >
          Claimable ({claimableBets})
        </GlassButton>
      </div>

      {/* Bets List */}
      <div className="space-y-4">
        {filteredBets.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <p className="text-white/60 text-lg">
              {filter === "claimable"
                ? "No bets to claim. Keep grinding."
                : "No bets found. Time to make some predictions."}
            </p>
          </GlassCard>
        ) : (
          filteredBets.map((bet) => (
            <GlassCard key={bet.betId} className="p-6">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Left: Bet Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full ${
                        bet.marketStatus === MarketStatus.Open
                          ? "bg-green-500/20 text-green-400"
                          : bet.marketStatus === MarketStatus.Locked
                            ? "bg-yellow-500/20 text-yellow-400"
                            : bet.marketStatus === MarketStatus.Resolved
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {STATUS_LABELS[bet.marketStatus]}
                    </span>
                    <Link
                      href={`/markets/${bet.marketId}`}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Market #{bet.marketId}
                    </Link>
                    <span className="text-xs text-gray-500">•</span>
                    <span className="text-xs text-gray-400">Game #{bet.gameId}</span>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-2">
                    {bet.marketTitle} - {bet.agentName}
                  </h3>

                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Your Prediction: </span>
                      <span
                        className={`font-semibold ${
                          bet.prediction ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {bet.prediction ? "YES" : "NO"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Amount: </span>
                      <span className="text-white font-semibold">
                        {bet.amount.toFixed(3)} ETH
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(bet.timestamp).toLocaleString()}
                  </p>
                </div>

                {/* Right: Status / Actions */}
                <div className="flex flex-col justify-center items-end min-w-[180px]">
                  {bet.marketStatus === MarketStatus.Resolved && (
                    <>
                      {bet.outcome !== undefined && (
                        <div className="mb-3 text-center">
                          <p className="text-sm text-gray-400 mb-1">Outcome</p>
                          <p
                            className={`text-2xl font-bold ${
                              bet.outcome === bet.prediction
                                ? "text-green-400"
                                : "text-red-400"
                            }`}
                          >
                            {bet.outcome ? "YES" : "NO"}
                          </p>
                        </div>
                      )}

                      {bet.canClaim && bet.payout && (
                        <div className="text-center mb-3">
                          <p className="text-sm text-gray-400">Payout</p>
                          <p className="text-2xl font-bold text-green-400">
                            {bet.payout.toFixed(4)} ETH
                          </p>
                          <p className="text-xs text-green-400">
                            +{(bet.payout - bet.amount).toFixed(4)} ETH profit
                          </p>
                        </div>
                      )}

                      {bet.canClaim ? (
                        <GlassButton
                          variant="prominent"
                          onClick={() => handleClaimPayout(bet.betId, bet.payout || 0)}
                          disabled={claimingBetId === bet.betId}
                        >
                          {claimingBetId === bet.betId ? "Claiming..." : "Claim Payout"}
                        </GlassButton>
                      ) : bet.claimed ? (
                        <div className="px-4 py-2 bg-gray-500/20 text-gray-400 rounded-lg text-sm">
                          ✓ Claimed
                        </div>
                      ) : (
                        <div className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm">
                          Lost
                        </div>
                      )}
                    </>
                  )}

                  {(bet.marketStatus === MarketStatus.Open ||
                    bet.marketStatus === MarketStatus.Locked) && (
                    <Link href={`/markets/${bet.marketId}`}>
                      <GlassButton variant="strong" size="sm">
                        View Market
                      </GlassButton>
                    </Link>
                  )}
                </div>
              </div>
            </GlassCard>
          ))
        )}
      </div>
    </div>
  );
}
