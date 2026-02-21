"use client";

import { useState } from "react";
import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { formatEther, parseEther } from "viem";
import { useAccount } from "wagmi";
import { GAME_STATE_LABELS, GameState } from "~~/contracts/DealOrNoDealAbi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useGameRead } from "~~/hooks/useGameContract";

const GameLobby: NextPage = () => {
  const { address: connectedAddress } = useAccount();

  // Read total games from factory
  const { data: totalGames } = useScaffoldReadContract({
    contractName: "DealOrNoDealFactory",
    functionName: "totalGames",
  });

  const total = totalGames ? Number(totalGames) : 0;

  return (
    <div className="flex flex-col items-center grow pt-6 px-4">
      <h1 className="text-3xl font-bold mb-2">Deal or No Deal</h1>
      <p className="text-sm opacity-70 mb-6">Onchain game show with commit-reveal lottery and ZK proofs</p>

      {/* Progressive Jackpot Banner */}
      <JackpotBanner />

      {/* Create Game section */}
      <CreateGamePanel connectedAddress={connectedAddress} />

      {/* Game list */}
      <div className="w-full max-w-4xl mt-8">
        <h2 className="text-xl font-bold mb-4">
          Active Games {total > 0 && <span className="badge badge-primary">{total}</span>}
        </h2>

        {total === 0 ? (
          <div className="card bg-base-200 shadow-lg">
            <div className="card-body items-center text-center py-12">
              <p className="text-lg opacity-70">No games yet</p>
              <p className="text-sm opacity-50">Create the first game to get started.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {Array.from({ length: total }, (_, i) => total - 1 - i).map(gid => (
              <GameListItem key={gid} gameId={gid} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/** Single game card in the lobby listing */
const GameListItem = ({ gameId }: { gameId: number }) => {
  const { data: deployment } = useScaffoldReadContract({
    contractName: "DealOrNoDealFactory",
    functionName: "getDeployment",
    args: [BigInt(gameId)],
  });

  if (!deployment) {
    return <div className="card bg-base-200 shadow animate-pulse h-24" />;
  }

  const dep = deployment as {
    game: `0x${string}`;
    nft: `0x${string}`;
    host: `0x${string}`;
    createdAt: bigint;
    gameId: bigint;
  };

  return <GameListItemDetails deployment={dep} />;
};

/** Details for a single game listing -- reads state from the game clone */
const GameListItemDetails = ({
  deployment,
}: {
  deployment: {
    game: `0x${string}`;
    nft: `0x${string}`;
    host: `0x${string}`;
    createdAt: bigint;
    gameId: bigint;
  };
}) => {
  const { data: gameState } = useGameRead({
    gameAddress: deployment.game,
    functionName: "getGameState",
  });

  const gs = gameState as
    | [
        {
          host: `0x${string}`;
          contestant: `0x${string}`;
          state: number;
          outcome: number;
          prizePool: bigint;
          currentRound: bigint;
          totalEntries: bigint;
          config: { entryFee: bigint };
        },
        bigint,
        bigint,
        bigint,
      ]
    | undefined;

  const state = gs?.[0]?.state ?? 0;
  const prizePool = gs?.[0]?.prizePool ?? 0n;
  const entries = gs?.[0]?.totalEntries ?? 0n;
  const entryFee = gs?.[0]?.config?.entryFee ?? 0n;
  const round = gs?.[0]?.currentRound ?? 0n;

  const createdDate = new Date(Number(deployment.createdAt) * 1000);

  const STATE_BADGE_COLOR: Record<number, string> = {
    [GameState.Created]: "badge-neutral",
    [GameState.LotteryOpen]: "badge-info",
    [GameState.LotteryReveal]: "badge-warning",
    [GameState.LotteryComplete]: "badge-success",
    [GameState.CaseSelection]: "badge-accent",
    [GameState.RoundPlay]: "badge-primary",
    [GameState.BankerOffer]: "badge-secondary",
    [GameState.GameOver]: "badge-ghost",
  };

  return (
    <Link href={`/game/${deployment.game}`}>
      <div className="card bg-base-200 shadow-lg hover:shadow-xl cursor-pointer">
        <div className="card-body p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold">Game #{Number(deployment.gameId)}</span>
              <div className={`badge ${STATE_BADGE_COLOR[state] ?? "badge-neutral"}`}>
                {GAME_STATE_LABELS[state] ?? "Unknown"}
              </div>
            </div>
            <div className="text-xs opacity-50">
              {createdDate.toLocaleDateString()} {createdDate.toLocaleTimeString()}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm">
            <div className="flex items-center gap-1">
              <span className="opacity-70">Host:</span>
              <Address address={deployment.host} />
            </div>
            {entryFee > 0n && (
              <div>
                <span className="opacity-70">Entry: </span>
                <span className="font-mono">{parseFloat(formatEther(entryFee)).toFixed(4)} ETH</span>
              </div>
            )}
            {entries > 0n && (
              <div>
                <span className="opacity-70">Entries: </span>
                <span className="font-bold">{Number(entries)}</span>
              </div>
            )}
            {prizePool > 0n && (
              <div>
                <span className="opacity-70">Pool: </span>
                <span className="font-mono font-bold">{parseFloat(formatEther(prizePool)).toFixed(4)} ETH</span>
              </div>
            )}
            {state >= GameState.RoundPlay && state < GameState.GameOver && (
              <div>
                <span className="opacity-70">Round: </span>
                <span>{Number(round) + 1}/10</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};

/** Panel for creating a new game */
const CreateGamePanel = ({ connectedAddress }: { connectedAddress: string | undefined }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [entryFee, setEntryFee] = useState("0.001");
  const [lotteryDuration, setLotteryDuration] = useState("3600"); // 1 hour
  const [revealDuration, setRevealDuration] = useState("1800"); // 30 min
  const [turnTimeout, setTurnTimeout] = useState("3600"); // 1 hour
  const [minPlayers, setMinPlayers] = useState("2");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const { writeContractAsync } = useScaffoldWriteContract({
    contractName: "DealOrNoDealFactory",
  });

  const handleCreateGame = async () => {
    if (!connectedAddress) {
      setError("Connect your wallet first");
      return;
    }
    setError("");
    setIsCreating(true);

    try {
      // Generate a random merkle root placeholder
      // In production, the host would generate this from their secret case assignments
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      const merkleRoot = `0x${Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")}` as `0x${string}`;

      // Generate a random salt
      const saltBytes = new Uint8Array(32);
      crypto.getRandomValues(saltBytes);
      const salt = `0x${Array.from(saltBytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")}` as `0x${string}`;

      const config = {
        entryFee: parseEther(entryFee),
        lotteryDuration: BigInt(lotteryDuration),
        revealDuration: BigInt(revealDuration),
        turnTimeout: BigInt(turnTimeout),
        hostFeeBps: 500, // 5%
        protocolFeeBps: 500, // 5%
        refundBps: 5000, // 50% refund to losers
        minPlayers: Number(minPlayers),
        randomnessMethod: 0, // 0 = CommitReveal
      };

      await writeContractAsync({
        functionName: "createGame",
        args: [merkleRoot, config, salt],
      });

      setIsOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setError(msg.slice(0, 200));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="w-full max-w-4xl">
      {!isOpen ? (
        <button className="btn btn-primary btn-lg w-full" onClick={() => setIsOpen(true)} disabled={!connectedAddress}>
          Create New Game
        </button>
      ) : (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body">
            <h3 className="card-title">Create New Game</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Entry Fee (ETH)</span>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={entryFee}
                  onChange={e => setEntryFee(e.target.value)}
                  className="input input-bordered"
                  placeholder="0.001"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Min Players</span>
                </label>
                <input
                  type="number"
                  min="2"
                  max="100"
                  value={minPlayers}
                  onChange={e => setMinPlayers(e.target.value)}
                  className="input input-bordered"
                  placeholder="2"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Lottery Duration (seconds)</span>
                </label>
                <input
                  type="number"
                  min="60"
                  value={lotteryDuration}
                  onChange={e => setLotteryDuration(e.target.value)}
                  className="input input-bordered"
                  placeholder="3600"
                />
                <label className="label">
                  <span className="label-text-alt">{Math.round(Number(lotteryDuration) / 60)} minutes</span>
                </label>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Reveal Duration (seconds)</span>
                </label>
                <input
                  type="number"
                  min="60"
                  value={revealDuration}
                  onChange={e => setRevealDuration(e.target.value)}
                  className="input input-bordered"
                  placeholder="1800"
                />
                <label className="label">
                  <span className="label-text-alt">{Math.round(Number(revealDuration) / 60)} minutes</span>
                </label>
              </div>

              <div className="form-control md:col-span-2">
                <label className="label">
                  <span className="label-text">Turn Timeout (seconds)</span>
                </label>
                <input
                  type="number"
                  min="60"
                  value={turnTimeout}
                  onChange={e => setTurnTimeout(e.target.value)}
                  className="input input-bordered"
                  placeholder="3600"
                />
                <label className="label">
                  <span className="label-text-alt">{Math.round(Number(turnTimeout) / 60)} minutes</span>
                </label>
              </div>
            </div>

            {error && (
              <div className="alert alert-error mt-2 text-sm">
                <span>{error}</span>
              </div>
            )}

            <div className="card-actions justify-end mt-4">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setIsOpen(false);
                  setError("");
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreateGame} disabled={isCreating}>
                {isCreating ? <span className="loading loading-spinner loading-sm" /> : "Create Game"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Progressive Jackpot banner showing the current pool */
const JackpotBanner = () => {
  const { data: jackpotPool } = useScaffoldReadContract({
    contractName: "DealOrNoDealFactory",
    functionName: "jackpotPool",
  });

  const pool = jackpotPool ?? 0n;

  return (
    <div className="w-full max-w-4xl mb-4">
      <div
        className="card shadow-lg"
        style={{
          background: "linear-gradient(135deg, #b8860b 0%, #ffd700 50%, #b8860b 100%)",
        }}
      >
        <div className="card-body items-center text-center py-4">
          <h2 className="text-lg font-bold text-black tracking-wide uppercase">Progressive Jackpot</h2>
          <p className="text-3xl font-mono font-black text-black">
            {pool > 0n ? `${parseFloat(formatEther(pool)).toFixed(4)} ETH` : "Building..."}
          </p>
          <p className="text-xs text-black/60">Go NO DEAL all 10 rounds + hold the top case to win it all</p>
        </div>
      </div>
    </div>
  );
};

export default GameLobby;
