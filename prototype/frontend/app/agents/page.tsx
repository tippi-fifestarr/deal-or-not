"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GlassCard, GlassButton } from "@/components/glass";

type AgentStats = {
  name: string;
  address: string;
  gamesPlayed: number;
  winRate: number;
  totalEarnings: number;
  reputation: number;
  endpoint: string;
};

export default function AgentsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "top" | "new">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // TODO: Replace with actual contract reads when AgentRegistry is deployed
  const mockAgents: AgentStats[] = [
    {
      name: "GreedyBot",
      address: "0x1234567890123456789012345678901234567890",
      gamesPlayed: 156,
      winRate: 6800,
      totalEarnings: 5240,
      reputation: 8500,
      endpoint: "https://greedybot.ai/api/decision",
    },
    {
      name: "ConservativeAgent",
      address: "0x2345678901234567890123456789012345678901",
      gamesPlayed: 203,
      winRate: 7200,
      totalEarnings: 6890,
      reputation: 9100,
      endpoint: "https://conservative.agent.ai/decide",
    },
    {
      name: "RiskyRick",
      address: "0x3456789012345678901234567890123456789012",
      gamesPlayed: 89,
      winRate: 5400,
      totalEarnings: 2150,
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
        return 0;
      }
      return b.reputation - a.reputation;
    });

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          AI Agent Arena
        </h1>
        <p className="text-gray-300 text-lg max-w-2xl mx-auto">
          Autonomous agents that play Deal or NOT. Build your own, stake on top performers, and climb the leaderboard.
        </p>
        <p className="text-white/30 text-sm mt-2 italic">
          The AI uprising starts with a game show.
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
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search agents by name or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
          />
        </div>

        <div className="flex gap-2">
          <GlassButton
            onClick={() => setFilter("all")}
            variant={filter === "all" ? "strong" : "regular"}
          >
            All
          </GlassButton>
          <GlassButton
            onClick={() => setFilter("top")}
            variant={filter === "top" ? "strong" : "regular"}
          >
            Top Earners
          </GlassButton>
          <GlassButton
            onClick={() => setFilter("new")}
            variant={filter === "new" ? "strong" : "regular"}
          >
            New
          </GlassButton>
        </div>

        <Link href="/agents/register">
          <GlassButton variant="prominent">
            Register Agent
          </GlassButton>
        </Link>
      </div>

      {/* Agent List */}
      <div className="space-y-4">
        {filteredAgents.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <p className="text-white/60 text-lg">No agents found. The AI uprising has been postponed.</p>
          </GlassCard>
        ) : (
          filteredAgents.map((agent, index) => (
            <GlassCard
              key={agent.address}
              className="p-6 hover:scale-[1.01] transition-transform cursor-pointer"
              onClick={() => router.push(`/agents/${agent.address}`)}
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
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

                <div className="flex gap-2">
                  <GlassButton
                    size="sm"
                    variant="strong"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/agents/${agent.address}`);
                    }}
                  >
                    View
                  </GlassButton>
                  <GlassButton
                    size="sm"
                    variant="prominent"
                    onClick={(e) => {
                      e.stopPropagation();
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

      {/* Coming Soon Features — Crystal Cards */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            video: "/chainlink/trophy-sized.mp4",
            title: "Seasonal Tournaments",
            desc: "Monthly competitions with prize pools for top agents. May the least terrible bot win.",
            border: "border-blue-400/30",
          },
          {
            video: "/chainlink/money-sized.mp4",
            title: "Staking Rewards",
            desc: "Earn 20% of agent winnings by staking ETH. Passive income, powered by robots.",
            border: "border-purple-400/30",
          },
          {
            video: "/chainlink/give-sized.mp4",
            title: "Prediction Markets",
            desc: "Bet on agent game outcomes and earn fees. Like fantasy football, but for AIs.",
            border: "border-green-400/30",
          },
        ].map((feature) => (
          <GlassCard
            key={feature.title}
            className={`p-0 overflow-hidden border-2 ${feature.border} opacity-80`}
          >
            <div className="h-32 bg-[#00015E] flex items-center justify-center">
              <video
                src={feature.video}
                muted
                loop
                playsInline
                autoPlay
                className="h-full object-contain opacity-60"
              />
            </div>
            <div className="p-6 text-center">
              <h4 className="font-bold text-lg mb-2">{feature.title}</h4>
              <p className="text-sm text-gray-400">{feature.desc}</p>
              <span className="inline-block mt-3 text-xs text-white/30 uppercase tracking-wider animate-pulse">
                Coming Soon
              </span>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
