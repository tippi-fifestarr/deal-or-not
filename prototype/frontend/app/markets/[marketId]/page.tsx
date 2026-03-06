"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { GlassCard, GlassButton } from "@/components/glass";
import Link from "next/link";

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
  createdAt: number;
};

type Bet = {
  betId: number;
  bettor: string;
  prediction: boolean;
  amount: number;
  timestamp: number;
  claimed: boolean;
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

export default function MarketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const marketId = parseInt(params.marketId as string);

  const [betAmount, setBetAmount] = useState("0.01");
  const [selectedPrediction, setSelectedPrediction] = useState<boolean | null>(null);
  const [isPlacingBet, setIsPlacingBet] = useState(false);

  // TODO: Replace with actual contract read
  const mockMarket: MarketData = {
    marketId: 1,
    gameId: 42,
    agentId: 1,
    agentName: "GreedyBot",
    marketType: MarketType.WillWin,
    targetValue: 0,
    status: MarketStatus.Open,
    lockTime: Date.now() + 3600000,
    totalPool: 2.5,
    yesPool: 1.8,
    noPool: 0.7,
    yesOdds: 7200,
    noOdds: 2800,
    totalBets: 12,
    createdAt: Date.now() - 7200000,
  };

  // TODO: Replace with actual contract reads
  const mockBets: Bet[] = [
    {
      betId: 1,
      bettor: "0x1234...5678",
      prediction: true,
      amount: 0.5,
      timestamp: Date.now() - 3600000,
      claimed: false,
    },
    {
      betId: 2,
      bettor: "0xabcd...ef01",
      prediction: false,
      amount: 0.3,
      timestamp: Date.now() - 1800000,
      claimed: false,
    },
    {
      betId: 3,
      bettor: "0x9876...4321",
      prediction: true,
      amount: 0.8,
      timestamp: Date.now() - 900000,
      claimed: false,
    },
  ];

  const calculatePotentialPayout = (
    prediction: boolean,
    amount: number
  ): number => {
    const newTotalPool = mockMarket.totalPool + amount;
    const newWinningPool = prediction
      ? mockMarket.yesPool + amount
      : mockMarket.noPool + amount;

    const fee = newTotalPool * 0.02; // 2% platform fee
    const payoutPool = newTotalPool - fee;

    return (amount * payoutPool) / newWinningPool;
  };

  const handlePlaceBet = async () => {
    if (selectedPrediction === null) return;

    setIsPlacingBet(true);
    try {
      // TODO: Call placeBet on PredictionMarket contract
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate tx
      alert(`Bet placed! ${betAmount} ETH on ${selectedPrediction ? "YES" : "NO"}`);
    } catch (error) {
      console.error("Bet failed:", error);
      alert("Bet failed. See console for details.");
    } finally {
      setIsPlacingBet(false);
    }
  };

  const lockTimeLeft = mockMarket.lockTime - Date.now();
  const hoursLeft = Math.max(0, Math.floor(lockTimeLeft / 3600000));
  const minutesLeft = Math.max(0, Math.floor((lockTimeLeft % 3600000) / 60000));

  const potentialPayout =
    selectedPrediction !== null && parseFloat(betAmount) > 0
      ? calculatePotentialPayout(selectedPrediction, parseFloat(betAmount))
      : 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Back Button */}
      <button
        onClick={() => router.back()}
        className="mb-6 text-gray-400 hover:text-white flex items-center gap-2"
      >
        ← Back to Markets
      </button>

      {/* Market Header */}
      <GlassCard className="p-8 mb-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-bold uppercase tracking-wider rounded-full">
                {STATUS_LABELS[mockMarket.status]}
              </span>
              <span className="text-sm text-gray-400">Game #{mockMarket.gameId}</span>
            </div>

            <h1 className="text-4xl font-bold text-white mb-2">
              {MARKET_TYPE_LABELS[mockMarket.marketType]}
              {mockMarket.marketType === MarketType.EarningsOver &&
                ` $${(mockMarket.targetValue / 100).toFixed(2)}`}
              {mockMarket.marketType === MarketType.RoundPrediction &&
                ` Round ${mockMarket.targetValue}`}
            </h1>

            <Link
              href={`/agents/${mockMarket.agentId}`}
              className="text-blue-400 hover:text-blue-300 flex items-center gap-2"
            >
              Agent: {mockMarket.agentName} →
            </Link>
          </div>

          {mockMarket.status === MarketStatus.Open && (
            <div className="text-right">
              <p className="text-sm text-gray-400">Locks in</p>
              <p className="text-2xl font-bold text-yellow-400">
                {hoursLeft}h {minutesLeft}m
              </p>
            </div>
          )}
        </div>

        {/* Market Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-400">Total Pool</p>
            <p className="text-2xl font-bold text-white">
              {mockMarket.totalPool.toFixed(3)} ETH
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Total Bets</p>
            <p className="text-2xl font-bold text-white">{mockMarket.totalBets}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Platform Fee</p>
            <p className="text-2xl font-bold text-white">2%</p>
          </div>
        </div>
      </GlassCard>

      {/* Betting Interface */}
      {mockMarket.status === MarketStatus.Open && (
        <GlassCard className="p-8 mb-6">
          <h2 className="text-2xl font-bold text-white mb-6">Place Your Bet</h2>

          {/* Odds Display */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => setSelectedPrediction(true)}
              className={`p-6 rounded-xl border-2 transition-all ${
                selectedPrediction === true
                  ? "bg-green-500/30 border-green-400"
                  : "bg-green-500/10 border-green-500/50 hover:bg-green-500/20"
              }`}
            >
              <div className="text-sm text-green-400 font-semibold mb-2">YES</div>
              <div className="text-4xl font-bold text-green-400 mb-2">
                {(mockMarket.yesOdds / 100).toFixed(1)}%
              </div>
              <div className="text-sm text-gray-400">
                Pool: {mockMarket.yesPool.toFixed(3)} ETH
              </div>
            </button>

            <button
              onClick={() => setSelectedPrediction(false)}
              className={`p-6 rounded-xl border-2 transition-all ${
                selectedPrediction === false
                  ? "bg-red-500/30 border-red-400"
                  : "bg-red-500/10 border-red-500/50 hover:bg-red-500/20"
              }`}
            >
              <div className="text-sm text-red-400 font-semibold mb-2">NO</div>
              <div className="text-4xl font-bold text-red-400 mb-2">
                {(mockMarket.noOdds / 100).toFixed(1)}%
              </div>
              <div className="text-sm text-gray-400">
                Pool: {mockMarket.noPool.toFixed(3)} ETH
              </div>
            </button>
          </div>

          {/* Bet Amount Input */}
          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-2">Bet Amount (ETH)</label>
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
              placeholder="0.01"
            />
            <div className="flex gap-2 mt-2">
              {["0.01", "0.05", "0.1", "0.5"].map((val) => (
                <button
                  key={val}
                  onClick={() => setBetAmount(val)}
                  className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 rounded-lg text-gray-300"
                >
                  {val} ETH
                </button>
              ))}
            </div>
          </div>

          {/* Potential Payout */}
          {selectedPrediction !== null && potentialPayout > 0 && (
            <div className="mb-6 p-4 bg-blue-500/20 border border-blue-500/50 rounded-xl">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Potential Payout:</span>
                <span className="text-2xl font-bold text-blue-400">
                  {potentialPayout.toFixed(4)} ETH
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Estimated profit:{" "}
                {(potentialPayout - parseFloat(betAmount)).toFixed(4)} ETH (
                {(((potentialPayout - parseFloat(betAmount)) / parseFloat(betAmount)) * 100).toFixed(1)}% return)
              </div>
            </div>
          )}

          {/* Place Bet Button */}
          <GlassButton
            variant="prominent"
            onClick={handlePlaceBet}
            disabled={
              selectedPrediction === null ||
              parseFloat(betAmount) < 0.001 ||
              isPlacingBet
            }
            className="w-full py-4 text-lg"
          >
            {isPlacingBet
              ? "Placing Bet..."
              : selectedPrediction === null
                ? "Select YES or NO"
                : `Bet ${betAmount} ETH on ${selectedPrediction ? "YES" : "NO"}`}
          </GlassButton>
        </GlassCard>
      )}

      {/* Resolved Market - Outcome */}
      {mockMarket.status === MarketStatus.Resolved && mockMarket.outcome !== undefined && (
        <GlassCard className="p-8 mb-6 border-2 border-green-400/50">
          <h2 className="text-2xl font-bold text-white mb-4">Market Resolved</h2>
          <div className="text-center">
            <p className="text-6xl font-bold text-green-400 mb-2">
              {mockMarket.outcome ? "YES" : "NO"}
            </p>
            <p className="text-gray-400">
              The market has been resolved. Winners can claim their payouts.
            </p>
          </div>
        </GlassCard>
      )}

      {/* Recent Bets */}
      <GlassCard className="p-8">
        <h2 className="text-2xl font-bold text-white mb-6">Recent Bets</h2>
        <div className="space-y-3">
          {mockBets.map((bet) => (
            <div
              key={bet.betId}
              className="flex justify-between items-center p-4 bg-white/5 rounded-lg"
            >
              <div className="flex items-center gap-4">
                <span
                  className={`px-3 py-1 rounded-lg font-semibold text-sm ${
                    bet.prediction
                      ? "bg-green-500/20 text-green-400"
                      : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {bet.prediction ? "YES" : "NO"}
                </span>
                <span className="text-gray-400 font-mono text-sm">{bet.bettor}</span>
              </div>
              <div className="text-right">
                <p className="text-white font-semibold">{bet.amount.toFixed(3)} ETH</p>
                <p className="text-xs text-gray-500">
                  {new Date(bet.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
