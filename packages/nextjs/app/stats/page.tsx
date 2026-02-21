"use client";

import Link from "next/link";
import { formatEther } from "viem";
import { useScaffoldEventHistory, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useEthPrice } from "~~/hooks/useEthPrice";

export default function StatsPage() {
  const { ethPrice } = useEthPrice();

  // Read factory contract for global stats
  const { data: factoryGames } = useScaffoldEventHistory({
    contractName: "DealOrNoDealFactory",
    eventName: "GameDeployed",
    fromBlock: 0n,
  });

  const { data: jackpotPool } = useScaffoldReadContract({
    contractName: "DealOrNoDealFactory",
    functionName: "jackpotPool",
  });

  // Get all game resolved events
  const { data: resolvedGames } = useScaffoldEventHistory({
    contractName: "DealOrNoDeal",
    eventName: "GameResolved",
    fromBlock: 0n,
  });

  // Get jackpot wins
  const { data: jackpotWins } = useScaffoldEventHistory({
    contractName: "DealOrNoDealFactory",
    eventName: "JackpotWon",
    fromBlock: 0n,
  });

  const totalGames = factoryGames?.length ?? 0;
  const completedGames = resolvedGames?.length ?? 0;
  const totalJackpots = jackpotWins?.length ?? 0;

  // Calculate stats from resolved games
  const dealCount = resolvedGames?.filter(g => g.args.outcome === 1)?.length ?? 0;
  const noDealCount = resolvedGames?.filter(g => g.args.outcome === 2)?.length ?? 0;
  const timeoutCount = resolvedGames?.filter(g => g.args.outcome === 3)?.length ?? 0;

  const totalPayout =
    resolvedGames?.reduce((sum, game) => {
      return sum + BigInt(game.args.payout || 0n);
    }, 0n) ?? 0n;

  const avgPayout = completedGames > 0 ? totalPayout / BigInt(completedGames) : 0n;

  // Top wins (sorted by payout)
  const topWins =
    resolvedGames
      ?.map(game => ({
        gameId: game.args.gameId,
        payout: BigInt(game.args.payout || 0n),
        outcome: game.args.outcome,
        blockNumber: game.blockNumber,
      }))
      .sort((a, b) => (a.payout > b.payout ? -1 : 1))
      .slice(0, 10) ?? [];

  return (
    <div className="flex flex-col items-center grow pt-10 px-4">
      <div className="w-full max-w-6xl">
        <h1 className="text-4xl font-bold mb-8 text-center">Deal or No Deal Stats</h1>

        {/* Global Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total Games"
            value={totalGames.toLocaleString()}
            subtitle={`${completedGames} completed`}
            icon="🎮"
          />
          <StatCard
            title="Progressive Jackpot"
            value={
              ethPrice > 0
                ? `$${(parseFloat(formatEther(jackpotPool || 0n)) * ethPrice).toLocaleString("en-US", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}`
                : `${parseFloat(formatEther(jackpotPool || 0n)).toFixed(4)} ETH`
            }
            subtitle={`${totalJackpots} won`}
            icon="💰"
          />
          <StatCard
            title="Total Paid Out"
            value={
              ethPrice > 0
                ? `$${(parseFloat(formatEther(totalPayout)) * ethPrice).toLocaleString("en-US", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}`
                : `${parseFloat(formatEther(totalPayout)).toFixed(4)} ETH`
            }
            subtitle={`Avg: ${parseFloat(formatEther(avgPayout)).toFixed(4)} ETH`}
            icon="💵"
          />
          <StatCard
            title="Deal Rate"
            value={`${completedGames > 0 ? ((dealCount / completedGames) * 100).toFixed(1) : 0}%`}
            subtitle={`${dealCount} deals vs ${noDealCount} no deals`}
            icon="🤝"
          />
        </div>

        {/* Outcome Breakdown */}
        <div className="card bg-base-200 shadow-lg mb-8">
          <div className="card-body">
            <h2 className="card-title">Game Outcomes</h2>
            <div className="flex gap-4 flex-wrap">
              <div className="stat bg-base-100 rounded-lg flex-1">
                <div className="stat-figure text-success">✅</div>
                <div className="stat-title">DEAL</div>
                <div className="stat-value text-success">{dealCount}</div>
                <div className="stat-desc">
                  {completedGames > 0 ? ((dealCount / completedGames) * 100).toFixed(1) : 0}% of games
                </div>
              </div>
              <div className="stat bg-base-100 rounded-lg flex-1">
                <div className="stat-figure text-error">❌</div>
                <div className="stat-title">NO DEAL</div>
                <div className="stat-value text-error">{noDealCount}</div>
                <div className="stat-desc">
                  {completedGames > 0 ? ((noDealCount / completedGames) * 100).toFixed(1) : 0}% of games
                </div>
              </div>
              <div className="stat bg-base-100 rounded-lg flex-1">
                <div className="stat-figure text-warning">⏱️</div>
                <div className="stat-title">TIMEOUT</div>
                <div className="stat-value text-warning">{timeoutCount}</div>
                <div className="stat-desc">
                  {completedGames > 0 ? ((timeoutCount / completedGames) * 100).toFixed(1) : 0}% of games
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Wins Leaderboard */}
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body">
            <h2 className="card-title mb-4">🏆 Top 10 Biggest Wins</h2>
            <div className="overflow-x-auto">
              <table className="table table-zebra">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Game ID</th>
                    <th>Payout</th>
                    <th>Outcome</th>
                    <th>Block</th>
                  </tr>
                </thead>
                <tbody>
                  {topWins.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center opacity-50">
                        No completed games yet
                      </td>
                    </tr>
                  ) : (
                    topWins.map((win, index) => (
                      <tr key={index}>
                        <td>
                          <div className="flex items-center gap-2">
                            {index === 0 && "🥇"}
                            {index === 1 && "🥈"}
                            {index === 2 && "🥉"}
                            {index > 2 && `#${index + 1}`}
                          </div>
                        </td>
                        <td>
                          <Link href={`/game/${win.gameId}`} className="link link-primary font-mono text-xs">
                            {win.gameId?.toString().slice(0, 8)}...
                          </Link>
                        </td>
                        <td className="font-mono font-bold">
                          {ethPrice > 0
                            ? `$${(parseFloat(formatEther(win.payout)) * ethPrice).toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : `${parseFloat(formatEther(win.payout)).toFixed(4)} ETH`}
                        </td>
                        <td>
                          {win.outcome === 1 && <span className="badge badge-success">DEAL</span>}
                          {win.outcome === 2 && <span className="badge badge-error">NO DEAL</span>}
                          {win.outcome === 3 && <span className="badge badge-warning">TIMEOUT</span>}
                        </td>
                        <td className="text-xs opacity-70">{win.blockNumber?.toString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const StatCard = ({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
}) => {
  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm opacity-70">{title}</h3>
          <span className="text-3xl">{icon}</span>
        </div>
        <div className="text-3xl font-bold">{value}</div>
        <div className="text-xs opacity-60">{subtitle}</div>
      </div>
    </div>
  );
};
