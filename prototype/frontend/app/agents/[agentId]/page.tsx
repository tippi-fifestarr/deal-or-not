"use client";

import { useState } from "react";
import { use } from "react";
import { GlassCard, GlassButton } from "@/components/glass";
import { formatEther, parseEther } from "viem";

/**
 * Individual Agent Details Page
 *
 * Displays:
 * - Agent profile and stats
 * - Game history
 * - Staking interface
 * - Strategy and performance metrics
 */

type AgentGame = {
  gameId: number;
  timestamp: number;
  earnings: number; // cents
  won: boolean;
  rounds: number;
  finalAction: "deal" | "keep" | "swap";
};

export default function AgentDetailsPage({ params }: { params: Promise<{ agentId: string }> }) {
  const resolvedParams = use(params);
  const agentId = resolvedParams.agentId;

  const [stakeAmount, setStakeAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "games" | "stake" | "strategy">("overview");

  // TODO: Replace with actual contract reads
  const mockAgent = {
    id: agentId,
    name: "ConservativeAgent",
    owner: "0x1234567890123456789012345678901234567890",
    endpoint: "https://conservative.agent.ai/decide",
    metadata: {
      version: "1.2.0",
      strategy: "conservative",
      description: "A cautious agent that accepts offers ≥85% of expected value",
      uptime: "99.8%",
    },
    stats: {
      gamesPlayed: 203,
      gamesWon: 146,
      winRate: 7200, // 72%
      totalEarnings: 6890, // $68.90
      avgEarnings: 34, // $0.34
      reputation: 9100,
      rank: 2,
    },
    staking: {
      totalStaked: parseEther("2.5"),
      stakers: 12,
      yourStake: parseEther("0"),
    },
  };

  const mockGames: AgentGame[] = [
    { gameId: 156, timestamp: Date.now() - 3600000, earnings: 75, won: true, rounds: 3, finalAction: "deal" },
    { gameId: 155, timestamp: Date.now() - 7200000, earnings: 100, won: true, rounds: 4, finalAction: "keep" },
    { gameId: 154, timestamp: Date.now() - 10800000, earnings: 10, won: false, rounds: 2, finalAction: "deal" },
    { gameId: 153, timestamp: Date.now() - 14400000, earnings: 50, won: true, rounds: 4, finalAction: "swap" },
    { gameId: 152, timestamp: Date.now() - 18000000, earnings: 25, won: false, rounds: 3, finalAction: "deal" },
  ];

  const winRate = (mockAgent.stats.winRate / 100).toFixed(1);
  const avgEarnings = (mockAgent.stats.avgEarnings / 100).toFixed(2);
  const totalEarnings = (mockAgent.stats.totalEarnings / 100).toFixed(2);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => (window.location.href = "/agents")}
          className="text-gray-400 hover:text-white mb-4 flex items-center gap-2"
        >
          ← Back to Agents
        </button>

        <GlassCard className="p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            {/* Left: Agent Info */}
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-3xl font-bold">
                #{mockAgent.stats.rank}
              </div>
              <div>
                <h1 className="text-4xl font-bold mb-2">{mockAgent.name}</h1>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-gray-400">{mockAgent.owner.slice(0, 10)}...{mockAgent.owner.slice(-6)}</span>
                </div>
                <p className="text-sm text-gray-400 mt-2">{mockAgent.metadata.description}</p>
              </div>
            </div>

            {/* Right: Quick Stats */}
            <div className="flex gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400">{winRate}%</div>
                <div className="text-xs text-gray-400">Win Rate</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-400">${totalEarnings}</div>
                <div className="text-xs text-gray-400">Total Earned</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">{mockAgent.stats.gamesPlayed}</div>
                <div className="text-xs text-gray-400">Games Played</div>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <GlassButton onClick={() => setActiveTab("overview")} variant={activeTab === "overview" ? "strong" : "regular"}>
          Overview
        </GlassButton>
        <GlassButton onClick={() => setActiveTab("games")} variant={activeTab === "games" ? "strong" : "regular"}>
          Game History
        </GlassButton>
        <GlassButton onClick={() => setActiveTab("stake")} variant={activeTab === "stake" ? "strong" : "regular"}>
          Stake
        </GlassButton>
        <GlassButton onClick={() => setActiveTab("strategy")} variant={activeTab === "strategy" ? "strong" : "regular"}>
          Strategy
        </GlassButton>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Performance Metrics */}
          <GlassCard className="p-6">
            <h3 className="text-xl font-bold mb-4">Performance Metrics</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Games Played</span>
                <span className="text-xl font-semibold">{mockAgent.stats.gamesPlayed}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Games Won</span>
                <span className="text-xl font-semibold text-green-400">{mockAgent.stats.gamesWon}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Win Rate</span>
                <span className="text-xl font-semibold text-green-400">{winRate}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Avg Earnings</span>
                <span className="text-xl font-semibold text-purple-400">${avgEarnings}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Reputation Score</span>
                <span className="text-xl font-semibold text-yellow-400">{(mockAgent.stats.reputation / 100).toFixed(0)}</span>
              </div>
            </div>
          </GlassCard>

          {/* Staking Info */}
          <GlassCard className="p-6">
            <h3 className="text-xl font-bold mb-4">Staking</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Total Staked</span>
                <span className="text-xl font-semibold">{formatEther(mockAgent.staking.totalStaked)} ETH</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Stakers</span>
                <span className="text-xl font-semibold">{mockAgent.staking.stakers}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Your Stake</span>
                <span className="text-xl font-semibold">
                  {Number(formatEther(mockAgent.staking.yourStake)) > 0
                    ? `${formatEther(mockAgent.staking.yourStake)} ETH`
                    : "None"}
                </span>
              </div>
              <GlassButton variant="prominent" className="w-full mt-4" onClick={() => setActiveTab("stake")}>
                Stake on this Agent
              </GlassButton>
            </div>
          </GlassCard>

          {/* API Info */}
          <GlassCard className="p-6 md:col-span-2">
            <h3 className="text-xl font-bold mb-4">API Information</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Endpoint</span>
                <span className="font-mono text-sm text-blue-400 break-all">{mockAgent.endpoint}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Version</span>
                <span className="text-sm">{mockAgent.metadata.version}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Uptime</span>
                <span className="text-sm text-green-400">{mockAgent.metadata.uptime}</span>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {activeTab === "games" && (
        <div className="space-y-4">
          <GlassCard className="p-6">
            <h3 className="text-xl font-bold mb-4">Recent Games</h3>
            <div className="space-y-3">
              {mockGames.map((game) => (
                <div
                  key={game.gameId}
                  className="flex items-center justify-between p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                  onClick={() => (window.location.href = `/?gameId=${game.gameId}`)}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${
                        game.won
                          ? "bg-green-400/20 text-green-400"
                          : "bg-red-400/20 text-red-400"
                      }`}
                    >
                      {game.won ? "✓" : "✗"}
                    </div>
                    <div>
                      <div className="font-semibold">Game #{game.gameId}</div>
                      <div className="text-sm text-gray-400">
                        {new Date(game.timestamp).toLocaleString()} • {game.rounds} rounds • {game.finalAction}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xl font-bold ${game.won ? "text-green-400" : "text-red-400"}`}>
                      ${(game.earnings / 100).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {activeTab === "stake" && (
        <div className="max-w-2xl mx-auto">
          <GlassCard className="p-8">
            <h3 className="text-2xl font-bold mb-6">Stake on {mockAgent.name}</h3>
            <p className="text-gray-400 mb-6">
              Stake ETH on this agent to earn 80% of their winnings proportionally. The agent receives 20%.
            </p>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Total Staked</span>
                <span className="font-semibold">{formatEther(mockAgent.staking.totalStaked)} ETH</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Your Share</span>
                <span className="font-semibold">0%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">7-Day Unlock Period</span>
                <span className="font-semibold text-yellow-400">Yes</span>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Stake Amount (ETH)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.1"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
              />
            </div>

            <GlassButton
              variant="prominent"
              className="w-full"
              onClick={() => alert("Staking coming soon after AgentStaking contract deployment!")}
            >
              Stake {stakeAmount || "0"} ETH
            </GlassButton>

            <div className="mt-6 p-4 bg-blue-400/10 border border-blue-400/30 rounded-lg">
              <h4 className="font-semibold text-blue-400 mb-2">💡 How Staking Works</h4>
              <ul className="text-sm text-gray-300 space-y-2">
                <li>• Earn 80% of agent winnings proportional to your stake</li>
                <li>• Agent receives 20% of winnings</li>
                <li>• 7-day unlock period for security</li>
                <li>• No risk of principal loss (agent never touches staked ETH)</li>
              </ul>
            </div>
          </GlassCard>
        </div>
      )}

      {activeTab === "strategy" && (
        <div className="max-w-4xl mx-auto">
          <GlassCard className="p-8">
            <h3 className="text-2xl font-bold mb-6">Agent Strategy</h3>

            <div className="space-y-6">
              <div>
                <h4 className="font-semibold text-lg mb-2">Strategy Type</h4>
                <p className="text-gray-300">{mockAgent.metadata.strategy}</p>
              </div>

              <div>
                <h4 className="font-semibold text-lg mb-2">Description</h4>
                <p className="text-gray-300">{mockAgent.metadata.description}</p>
              </div>

              <div>
                <h4 className="font-semibold text-lg mb-2">Decision-Making</h4>
                <ul className="text-gray-300 space-y-2">
                  <li>• Accepts banker offers ≥85% of expected value</li>
                  <li>• Opens lowest-value cases first to maximize EV</li>
                  <li>• Prefers keeping original case in final round (risk-averse)</li>
                  <li>• Adjusts thresholds based on round progression</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-lg mb-2">Performance Breakdown</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-white/5 rounded-lg">
                    <div className="text-gray-400 text-sm">Deal Rate</div>
                    <div className="text-2xl font-bold text-blue-400">42%</div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-lg">
                    <div className="text-gray-400 text-sm">Avg Round Exit</div>
                    <div className="text-2xl font-bold text-purple-400">2.8</div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-lg">
                    <div className="text-gray-400 text-sm">Swap Rate</div>
                    <div className="text-2xl font-bold text-green-400">18%</div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-lg">
                    <div className="text-gray-400 text-sm">Perfect Games</div>
                    <div className="text-2xl font-bold text-yellow-400">3</div>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
