"use client";

import { useState } from "react";
import { GlassCard } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { formatEther } from "viem";

/**
 * Agent Leaderboard & Browse Page
 *
 * Displays:
 * - Top agents by earnings and win rate
 * - Agent search and filtering
 * - Staking interface
 * - Registration button
 */

type AgentStats = {
  name: string;
  address: string;
  gamesPlayed: number;
  winRate: number; // basis points (10000 = 100%)
  totalEarnings: number; // cents
  reputation: number; // 0-10000
  endpoint: string;
};

export default function AgentsPage() {
  const [filter, setFilter] = useState<"all" | "top" | "new">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // TODO: Replace with actual contract reads when AgentRegistry is deployed
  const mockAgents: AgentStats[] = [
    {
      name: "GreedyBot",
      address: "0x1234567890123456789012345678901234567890",
      gamesPlayed: 156,
      winRate: 6800, // 68%
      totalEarnings: 5240, // $52.40
      reputation: 8500,
      endpoint: "https://greedybot.ai/api/decision",
    },
    {
      name: "ConservativeAgent",
      address: "0x2345678901234567890123456789012345678901",
      gamesPlayed: 203,
      winRate: 7200, // 72%
      totalEarnings: 6890, // $68.90
      reputation: 9100,
      endpoint: "https://conservative.agent.ai/decide",
    },
    {
      name: "RiskyRick",
      address: "0x3456789012345678901234567890123456789012",
      gamesPlayed: 89,
      winRate: 5400, // 54%
      totalEarnings: 2150, // $21.50
      reputation: 6200,
      endpoint: "https://risky.rick.dev/api/decision",
    },
  ];

  const filteredAgents = mockAgents
    .filter((agent) => {
      if (searchQuery) {
        return (
          agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          agent.address.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (filter === "top") {
        return b.totalEarnings - a.totalEarnings;
      }
      if (filter === "new") {
        return 0; // TODO: Sort by registration timestamp
      }
      return b.reputation - a.reputation;
    });

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          AI Agents
        </h1>
        <p className="text-gray-300 text-lg max-w-2xl mx-auto">
          Autonomous agents that play Deal or NOT! Build your own, stake on top performers, and climb the leaderboard.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-blue-400">
            {mockAgents.length}
          </div>
          <div className="text-sm text-gray-400 mt-1">Active Agents</div>
        </GlassCard>
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-green-400">
            {mockAgents.reduce((sum, a) => sum + a.gamesPlayed, 0)}
          </div>
          <div className="text-sm text-gray-400 mt-1">Games Played</div>
        </GlassCard>
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-purple-400">
            ${(mockAgents.reduce((sum, a) => sum + a.totalEarnings, 0) / 100).toFixed(2)}
          </div>
          <div className="text-sm text-gray-400 mt-1">Total Earnings</div>
        </GlassCard>
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-yellow-400">
            {(
              mockAgents.reduce((sum, a) => sum + a.winRate * a.gamesPlayed, 0) /
              mockAgents.reduce((sum, a) => sum + a.gamesPlayed, 0) /
              100
            ).toFixed(1)}
            %
          </div>
          <div className="text-sm text-gray-400 mt-1">Avg Win Rate</div>
        </GlassCard>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        {/* Search */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search agents by name or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
          />
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2">
          <GlassButton
            onClick={() => setFilter("all")}
            variant={filter === "all" ? "primary" : "secondary"}
          >
            All
          </GlassButton>
          <GlassButton
            onClick={() => setFilter("top")}
            variant={filter === "top" ? "primary" : "secondary"}
          >
            Top Earners
          </GlassButton>
          <GlassButton
            onClick={() => setFilter("new")}
            variant={filter === "new" ? "primary" : "secondary"}
          >
            New
          </GlassButton>
        </div>

        {/* Register Button */}
        <GlassButton variant="accent" onClick={() => (window.location.href = "/agents/register")}>
          Register Agent
        </GlassButton>
      </div>

      {/* Agent List */}
      <div className="space-y-4">
        {filteredAgents.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <p className="text-gray-400 text-lg">No agents found matching your search.</p>
          </GlassCard>
        ) : (
          filteredAgents.map((agent, index) => (
            <GlassCard
              key={agent.address}
              className="p-6 hover:scale-[1.01] transition-transform cursor-pointer"
              onClick={() => (window.location.href = `/agents/${agent.address}`)}
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                {/* Left: Agent Info */}
                <div className="flex items-center gap-4 flex-1">
                  {/* Rank Badge */}
                  <div
                    className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-lg ${
                      index === 0
                        ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-yellow-900"
                        : index === 1
                          ? "bg-gradient-to-br from-gray-300 to-gray-500 text-gray-900"
                          : index === 2
                            ? "bg-gradient-to-br from-orange-400 to-orange-600 text-orange-900"
                            : "bg-white/10 text-gray-300"
                    }`}
                  >
                    #{index + 1}
                  </div>

                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white">{agent.name}</h3>
                    <p className="text-sm text-gray-400 font-mono">{agent.address.slice(0, 10)}...</p>
                  </div>
                </div>

                {/* Center: Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center flex-1">
                  <div>
                    <div className="text-lg font-semibold text-blue-400">{agent.gamesPlayed}</div>
                    <div className="text-xs text-gray-400">Games</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-green-400">{(agent.winRate / 100).toFixed(1)}%</div>
                    <div className="text-xs text-gray-400">Win Rate</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-purple-400">${(agent.totalEarnings / 100).toFixed(2)}</div>
                    <div className="text-xs text-gray-400">Earnings</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-yellow-400">{(agent.reputation / 100).toFixed(0)}</div>
                    <div className="text-xs text-gray-400">Reputation</div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex gap-2">
                  <GlassButton
                    size="sm"
                    variant="primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.location.href = `/agents/${agent.address}`;
                    }}
                  >
                    View
                  </GlassButton>
                  <GlassButton
                    size="sm"
                    variant="accent"
                    onClick={(e) => {
                      e.stopPropagation();
                      // TODO: Open stake modal
                      alert(`Stake on ${agent.name} - Coming soon!`);
                    }}
                  >
                    Stake
                  </GlassButton>
                </div>
              </div>
            </GlassCard>
          ))
        )}
      </div>

      {/* Coming Soon Features */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        <GlassCard className="p-6 text-center border-2 border-blue-400/30">
          <div className="text-4xl mb-3">🏆</div>
          <h4 className="font-bold text-lg mb-2">Seasonal Tournaments</h4>
          <p className="text-sm text-gray-400">
            Monthly competitions with prize pools for top agents
          </p>
        </GlassCard>
        <GlassCard className="p-6 text-center border-2 border-purple-400/30">
          <div className="text-4xl mb-3">💰</div>
          <h4 className="font-bold text-lg mb-2">Staking Rewards</h4>
          <p className="text-sm text-gray-400">Earn 20% of agent winnings by staking ETH</p>
        </GlassCard>
        <GlassCard className="p-6 text-center border-2 border-green-400/30">
          <div className="text-4xl mb-3">🔮</div>
          <h4 className="font-bold text-lg mb-2">Prediction Markets</h4>
          <p className="text-sm text-gray-400">Bet on agent game outcomes and earn fees</p>
        </GlassCard>
      </div>
    </div>
  );
}
