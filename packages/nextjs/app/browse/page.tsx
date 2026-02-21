"use client";

import { useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { useScaffoldEventHistory } from "~~/hooks/scaffold-eth";
import { useEthPrice } from "~~/hooks/useEthPrice";

type GameFilter = "all" | "lottery" | "active" | "completed";

export default function BrowseGamesPage() {
  const { ethPrice } = useEthPrice();
  const [filter, setFilter] = useState<GameFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Get all created games
  const { data: gameCreatedEvents } = useScaffoldEventHistory({
    contractName: "DealOrNoDealFactory",
    eventName: "GameDeployed",
    fromBlock: 0n,
  });

  // Get all resolved games
  const { data: gameResolvedEvents } = useScaffoldEventHistory({
    contractName: "DealOrNoDeal",
    eventName: "GameResolved",
    fromBlock: 0n,
  });

  const games =
    gameCreatedEvents?.map(event => {
      const gameAddress = event.args.game; // Changed from gameId to game
      const host = event.args.host;
      const merkleRoot = event.args.merkleRoot;

      const resolved = gameResolvedEvents?.find(r => r.args.gameId === gameAddress);

      return {
        address: gameAddress as string,
        host,
        merkleRoot,
        resolved: !!resolved,
        outcome: resolved?.args.outcome,
        payout: resolved?.args.payout,
        blockNumber: event.blockNumber,
      };
    }) ?? [];

  // Filter games
  const filteredGames = games
    .filter(game => {
      if (filter === "completed") return game.resolved;
      if (filter === "active") return !game.resolved;
      // lottery and all show everything for now
      return true;
    })
    .filter(game => {
      if (!searchTerm) return true;
      return (
        game.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        game.host?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });

  return (
    <div className="flex flex-col items-center grow pt-10 px-4">
      <div className="w-full max-w-6xl">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Browse Games</h1>
          <Link href="/stats">
            <button className="btn btn-outline btn-sm">View Stats</button>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6 flex-wrap">
          <div className="join">
            <button
              className={`join-item btn btn-sm ${filter === "all" ? "btn-active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All ({games.length})
            </button>
            <button
              className={`join-item btn btn-sm ${filter === "lottery" ? "btn-active" : ""}`}
              onClick={() => setFilter("lottery")}
            >
              🎰 Lottery Open
            </button>
            <button
              className={`join-item btn btn-sm ${filter === "active" ? "btn-active" : ""}`}
              onClick={() => setFilter("active")}
            >
              🎮 Active ({games.filter(g => !g.resolved).length})
            </button>
            <button
              className={`join-item btn btn-sm ${filter === "completed" ? "btn-active" : ""}`}
              onClick={() => setFilter("completed")}
            >
              ✅ Completed ({games.filter(g => g.resolved).length})
            </button>
          </div>

          <input
            type="text"
            placeholder="Search by address..."
            className="input input-bordered input-sm flex-1 max-w-xs"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Game Grid */}
        {filteredGames.length === 0 ? (
          <div className="card bg-base-200 shadow-lg">
            <div className="card-body items-center text-center py-12">
              <div className="text-6xl mb-4">🎰</div>
              <h3 className="text-2xl font-bold mb-2">No games found</h3>
              <p className="opacity-70">Be the first to create a game!</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGames.map((game, index) => (
              <GameCard key={index} game={game} ethPrice={ethPrice} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const GameCard = ({
  game,
  ethPrice,
}: {
  game: {
    address: string;
    host: string | undefined;
    merkleRoot: string | undefined;
    resolved: boolean;
    outcome: number | undefined;
    payout: bigint | undefined;
    blockNumber: bigint | undefined;
  };
  ethPrice: number;
}) => {
  const outcomeLabels: Record<number, string> = {
    1: "DEAL",
    2: "NO DEAL",
    3: "TIMEOUT",
  };

  const outcomeColors: Record<number, string> = {
    1: "badge-success",
    2: "badge-error",
    3: "badge-warning",
  };

  return (
    <Link href={`/game/${game.address}`}>
      <div className="card bg-base-200 shadow-lg hover:shadow-xl transition-shadow cursor-pointer h-full">
        <div className="card-body p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-mono text-sm">
              {game.address?.slice(0, 8)}...{game.address?.slice(-6)}
            </h3>
            {game.resolved ? (
              <span className={`badge badge-sm ${game.outcome ? outcomeColors[game.outcome] : ""}`}>
                {game.outcome ? outcomeLabels[game.outcome] : "Complete"}
              </span>
            ) : (
              <span className="badge badge-primary badge-sm">Active</span>
            )}
          </div>

          <div className="text-xs opacity-70 mb-3">
            Host: {game.host?.slice(0, 6)}...{game.host?.slice(-4)}
          </div>

          {game.resolved && game.payout !== undefined && (
            <div className="stat bg-base-100 rounded p-2">
              <div className="stat-title text-xs">Payout</div>
              <div className="stat-value text-lg">
                {ethPrice > 0
                  ? `$${(parseFloat(formatEther(game.payout)) * ethPrice).toLocaleString("en-US", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}`
                  : `${parseFloat(formatEther(game.payout)).toFixed(4)} ETH`}
              </div>
            </div>
          )}

          {!game.resolved && (
            <div className="text-center py-4">
              <button className="btn btn-primary btn-sm">Join Game</button>
            </div>
          )}

          <div className="text-xs opacity-50 mt-2">Block: {game.blockNumber?.toString()}</div>
        </div>
      </div>
    </Link>
  );
};
