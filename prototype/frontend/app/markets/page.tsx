"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GlassCard, GlassButton } from "@/components/glass";

// Market types from PredictionMarket.sol
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

type MarketData = {
  marketId: number;
  gameId: number;
  agentId: number;
  agentName: string;
  marketType: MarketType;
  targetValue: number;
  status: MarketStatus;
  lockTime: number;
  totalPool: number;
  yesPool: number;
  noPool: number;
  yesOdds: number;
  noOdds: number;
  totalBets: number;
  outcome?: boolean;
};

const MARKET_TYPE_LABELS: Record<MarketType, string> = {
  [MarketType.WillWin]: "Will Win?",
  [MarketType.EarningsOver]: "Earnings Over",
  [MarketType.WillAcceptOffer]: "Will Accept Offer?",
  [MarketType.RoundPrediction]: "Round Prediction",
};

const STATUS_COLORS: Record<MarketStatus, string> = {
  [MarketStatus.Open]: "text-green-400",
  [MarketStatus.Locked]: "text-yellow-400",
  [MarketStatus.Resolved]: "text-blue-400",
  [MarketStatus.Cancelled]: "text-red-400",
};

const STATUS_LABELS: Record<MarketStatus, string> = {
  [MarketStatus.Open]: "Open",
  [MarketStatus.Locked]: "Locked",
  [MarketStatus.Resolved]: "Resolved",
  [MarketStatus.Cancelled]: "Cancelled",
};

export default function MarketsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");

  // TODO: Replace with actual contract reads when PredictionMarket is deployed
  const mockMarkets: MarketData[] = [
    {
      marketId: 1,
      gameId: 42,
      agentId: 1,
      agentName: "GreedyBot",
      marketType: MarketType.WillWin,
      targetValue: 0,
      status: MarketStatus.Open,
      lockTime: Date.now() + 3600000, // 1 hour from now
      totalPool: 2.5,
      yesPool: 1.8,
      noPool: 0.7,
      yesOdds: 7200,
      noOdds: 2800,
      totalBets: 12,
    },
    {
      marketId: 2,
      gameId: 43,
      agentId: 2,
      agentName: "ConservativeAgent",
      marketType: MarketType.EarningsOver,
      targetValue: 50, // $0.50
      status: MarketStatus.Open,
      lockTime: Date.now() + 7200000, // 2 hours
      totalPool: 4.1,
      yesPool: 2.3,
      noPool: 1.8,
      yesOdds: 5610,
      noOdds: 4390,
      totalBets: 18,
    },
    {
      marketId: 3,
      gameId: 41,
      agentId: 1,
      agentName: "GreedyBot",
      marketType: MarketType.WillAcceptOffer,
      targetValue: 0,
      status: MarketStatus.Resolved,
      lockTime: Date.now() - 3600000, // Past
      totalPool: 1.8,
      yesPool: 0.6,
      noPool: 1.2,
      yesOdds: 3333,
      noOdds: 6667,
      totalBets: 9,
      outcome: false, // NO won
    },
    {
      marketId: 4,
      gameId: 44,
      agentId: 3,
      agentName: "RiskyRick",
      marketType: MarketType.RoundPrediction,
      targetValue: 5, // Round 5
      status: MarketStatus.Locked,
      lockTime: Date.now() - 600000, // 10 min ago
      totalPool: 3.2,
      yesPool: 1.5,
      noPool: 1.7,
      yesOdds: 4688,
      noOdds: 5312,
      totalBets: 14,
    },
  ];

  const filteredMarkets = mockMarkets.filter((market) => {
    if (filter === "open") return market.status === MarketStatus.Open;
    if (filter === "resolved") return market.status === MarketStatus.Resolved;
    return true;
  });

  const totalVolume = mockMarkets.reduce((sum, m) => sum + m.totalPool, 0);
  const activeMarkets = mockMarkets.filter((m) => m.status === MarketStatus.Open).length;
  const resolvedMarkets = mockMarkets.filter((m) => m.status === MarketStatus.Resolved).length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
          Prediction Markets
        </h1>
        <p className="text-gray-300 text-lg max-w-2xl mx-auto">
          Bet on agent game outcomes. Parimutuel betting with 2% platform fee. Like fantasy football, but for AIs.
        </p>
        <p className="text-white/30 text-sm mt-2 italic">
          The house always wins. Except here, the house is a smart contract.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-green-400">{activeMarkets}</div>
          <div className="text-sm text-gray-400 mt-1">Open Markets</div>
        </GlassCard>
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-blue-400">{resolvedMarkets}</div>
          <div className="text-sm text-gray-400 mt-1">Resolved</div>
        </GlassCard>
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-purple-400">
            {totalVolume.toFixed(2)} ETH
          </div>
          <div className="text-sm text-gray-400 mt-1">Total Volume</div>
        </GlassCard>
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-yellow-400">
            {mockMarkets.reduce((sum, m) => sum + m.totalBets, 0)}
          </div>
          <div className="text-sm text-gray-400 mt-1">Total Bets</div>
        </GlassCard>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 mb-8 items-center justify-between">
        <div className="flex gap-2">
          <GlassButton
            onClick={() => setFilter("all")}
            variant={filter === "all" ? "strong" : "regular"}
          >
            All Markets
          </GlassButton>
          <GlassButton
            onClick={() => setFilter("open")}
            variant={filter === "open" ? "strong" : "regular"}
          >
            Open
          </GlassButton>
          <GlassButton
            onClick={() => setFilter("resolved")}
            variant={filter === "resolved" ? "strong" : "regular"}
          >
            Resolved
          </GlassButton>
        </div>

        <Link href="/markets/my-bets">
          <GlassButton variant="prominent">My Bets</GlassButton>
        </Link>
      </div>

      {/* Market List */}
      <div className="space-y-4">
        {filteredMarkets.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <p className="text-white/60 text-lg">
              No markets found. The prophecy remains unwritten.
            </p>
          </GlassCard>
        ) : (
          filteredMarkets.map((market) => {
            const lockTimeLeft = market.lockTime - Date.now();
            const hoursLeft = Math.max(0, Math.floor(lockTimeLeft / 3600000));
            const minutesLeft = Math.max(
              0,
              Math.floor((lockTimeLeft % 3600000) / 60000)
            );

            return (
              <GlassCard
                key={market.marketId}
                className="p-6 hover:scale-[1.01] transition-transform cursor-pointer"
                onClick={() => router.push(`/markets/${market.marketId}`)}
              >
                <div className="flex flex-col md:flex-row gap-6">
                  {/* Left: Market Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span
                        className={`text-xs font-bold uppercase tracking-wider ${STATUS_COLORS[market.status]}`}
                      >
                        {STATUS_LABELS[market.status]}
                      </span>
                      <span className="text-xs text-gray-400">
                        Game #{market.gameId}
                      </span>
                      <span className="text-xs text-gray-500">•</span>
                      <Link
                        href={`/agents/${market.agentId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        {market.agentName}
                      </Link>
                    </div>

                    <h3 className="text-xl font-bold text-white mb-2">
                      {MARKET_TYPE_LABELS[market.marketType]}
                      {market.marketType === MarketType.EarningsOver &&
                        ` $${(market.targetValue / 100).toFixed(2)}`}
                      {market.marketType === MarketType.RoundPrediction &&
                        ` Round ${market.targetValue}`}
                    </h3>

                    {market.status === MarketStatus.Open && (
                      <p className="text-sm text-gray-400">
                        Locks in {hoursLeft}h {minutesLeft}m
                      </p>
                    )}

                    {market.status === MarketStatus.Resolved && market.outcome !== undefined && (
                      <p className="text-sm text-green-400 font-semibold">
                        Outcome: {market.outcome ? "YES" : "NO"}
                      </p>
                    )}
                  </div>

                  {/* Center: Pool Stats */}
                  <div className="flex flex-col justify-center gap-2 min-w-[200px]">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-400">Total Pool:</span>
                      <span className="text-lg font-semibold text-white">
                        {market.totalPool.toFixed(3)} ETH
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-400">Total Bets:</span>
                      <span className="text-lg font-semibold text-white">
                        {market.totalBets}
                      </span>
                    </div>
                  </div>

                  {/* Right: Odds Display */}
                  <div className="flex flex-col gap-2 min-w-[180px]">
                    <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-3">
                      <div className="text-xs text-green-400 font-semibold mb-1">
                        YES
                      </div>
                      <div className="text-2xl font-bold text-green-400">
                        {(market.yesOdds / 100).toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-400">
                        {market.yesPool.toFixed(3)} ETH
                      </div>
                    </div>
                    <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3">
                      <div className="text-xs text-red-400 font-semibold mb-1">
                        NO
                      </div>
                      <div className="text-2xl font-bold text-red-400">
                        {(market.noOdds / 100).toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-400">
                        {market.noPool.toFixed(3)} ETH
                      </div>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="flex items-center">
                    <GlassButton
                      size="sm"
                      variant="prominent"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/markets/${market.marketId}`);
                      }}
                      disabled={market.status !== MarketStatus.Open}
                    >
                      {market.status === MarketStatus.Open ? "Place Bet" : "View"}
                    </GlassButton>
                  </div>
                </div>
              </GlassCard>
            );
          })
        )}
      </div>

      {/* Info Banner */}
      <GlassCard className="mt-8 p-6 border-2 border-blue-400/30">
        <h3 className="text-lg font-bold text-blue-400 mb-2">
          How Prediction Markets Work
        </h3>
        <ul className="text-sm text-gray-300 space-y-2">
          <li>
            • <strong>Parimutuel Betting:</strong> All bets go into a pool. Winners
            split the pool proportionally.
          </li>
          <li>
            • <strong>Platform Fee:</strong> 2% fee on total pool (8% less than
            FanDuel).
          </li>
          <li>
            • <strong>Odds Change:</strong> As people bet, odds shift based on pool
            sizes.
          </li>
          <li>
            • <strong>Lock Time:</strong> Betting closes before the game starts.
          </li>
        </ul>
      </GlassCard>
    </div>
  );
}
