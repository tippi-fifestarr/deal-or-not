"use client";

import { useEffect, useState } from "react";
import { Address } from "@scaffold-ui/components";
import { formatEther } from "viem";
import { GAME_OUTCOME_LABELS, GAME_STATE_LABELS, GameState } from "~~/contracts/DealOrNoDealAbi";

type GameData = {
  host: `0x${string}`;
  contestant: `0x${string}`;
  state: number;
  outcome: number;
  prizePool: bigint;
  currentRound: bigint;
  selectedCase: bigint;
  bankerOffer: bigint;
  lastActionTime: bigint;
  lotteryEndTime: bigint;
  revealEndTime: bigint;
  totalEntries: bigint;
  config: {
    entryFee: bigint;
    lotteryDuration: bigint;
    revealDuration: bigint;
    turnTimeout: bigint;
    hostFeeBps: number;
    protocolFeeBps: number;
    refundBps: number;
    minPlayers: number;
  };
};

type GameStatusProps = {
  gameData: GameData | undefined;
  remainingCount: bigint | undefined;
  casesLeftThisRound: bigint | undefined;
  connectedAddress: string | undefined;
};

const STATE_BADGE_COLORS: Record<number, string> = {
  [GameState.Created]: "badge-neutral",
  [GameState.LotteryOpen]: "badge-info",
  [GameState.LotteryReveal]: "badge-warning",
  [GameState.LotteryComplete]: "badge-success",
  [GameState.CaseSelection]: "badge-accent",
  [GameState.RoundPlay]: "badge-primary",
  [GameState.BankerOffer]: "badge-secondary",
  [GameState.GameOver]: "badge-ghost",
};

export const GameStatus = ({ gameData, remainingCount, casesLeftThisRound, connectedAddress }: GameStatusProps) => {
  const [countdown, setCountdown] = useState<string>("");

  useEffect(() => {
    if (!gameData) return;

    const interval = setInterval(() => {
      const now = BigInt(Math.floor(Date.now() / 1000));
      let deadline = 0n;

      if (gameData.state === GameState.LotteryOpen) {
        deadline = gameData.lotteryEndTime;
      } else if (gameData.state === GameState.LotteryReveal) {
        deadline = gameData.revealEndTime;
      } else {
        deadline = gameData.lastActionTime + gameData.config.turnTimeout;
      }

      if (deadline > now) {
        const diff = Number(deadline - now);
        const hours = Math.floor(diff / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        const secs = diff % 60;
        setCountdown(hours > 0 ? `${hours}h ${mins}m ${secs}s` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
      } else {
        setCountdown("Expired");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameData]);

  if (!gameData) {
    return (
      <div className="flex justify-center py-8">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  const state = gameData.state;
  const round = Number(gameData.currentRound);
  const isHost = connectedAddress?.toLowerCase() === gameData.host.toLowerCase();
  const isContestant =
    gameData.contestant !== "0x0000000000000000000000000000000000000000" &&
    connectedAddress?.toLowerCase() === gameData.contestant.toLowerCase();

  const getTurnIndicator = (): string => {
    if (state === GameState.Created) return isHost ? "Your turn (open lottery)" : "Waiting for host";
    if (state === GameState.LotteryOpen) return "Open to entries";
    if (state === GameState.LotteryReveal) return "Reveal your secret";
    if (state === GameState.LotteryComplete)
      return isContestant ? "Your turn (select a case)" : "Waiting for contestant";
    if (state === GameState.RoundPlay) return isContestant ? "Your turn (open cases)" : "Contestant is playing";
    if (state === GameState.BankerOffer)
      return isContestant ? "Your decision: Deal… or NOT?" : "Waiting for contestant";
    if (state === GameState.GameOver) return GAME_OUTCOME_LABELS[gameData.outcome] ?? "Game Over";
    return "";
  };

  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* State badge */}
          <div className={`badge ${STATE_BADGE_COLORS[state] ?? "badge-neutral"} badge-lg gap-1`}>
            {GAME_STATE_LABELS[state] ?? "Unknown"}
          </div>

          {/* Round info */}
          {state === GameState.RoundPlay || state === GameState.BankerOffer ? (
            <div className="badge badge-outline badge-lg">Round {round + 1} / 10</div>
          ) : null}

          {/* Cases remaining this round */}
          {state === GameState.RoundPlay && casesLeftThisRound !== undefined ? (
            <div className="badge badge-outline badge-lg">
              {Number(casesLeftThisRound)} case{Number(casesLeftThisRound) !== 1 ? "s" : ""} to open
            </div>
          ) : null}

          {/* Total cases remaining */}
          {remainingCount !== undefined && state >= GameState.RoundPlay && state < GameState.GameOver ? (
            <div className="badge badge-outline badge-lg">{Number(remainingCount)} cases left</div>
          ) : null}

          {/* Prize pool */}
          {gameData.prizePool > 0n ? (
            <div className="badge badge-accent badge-lg">
              Pool: {parseFloat(formatEther(gameData.prizePool)).toFixed(4)} ETH
            </div>
          ) : null}

          {/* Countdown */}
          {state !== GameState.GameOver && countdown ? (
            <div className={`badge badge-lg ${countdown === "Expired" ? "badge-error" : "badge-warning"}`}>
              {countdown === "Expired" ? "Time expired" : countdown}
            </div>
          ) : null}
        </div>

        {/* Turn indicator */}
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="opacity-70">Turn:</span>
          <span className="font-medium">{getTurnIndicator()}</span>
        </div>

        {/* Players info */}
        <div className="mt-1 flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <span className="opacity-70">Host:</span>
            <Address address={gameData.host} />
          </div>
          {gameData.contestant !== "0x0000000000000000000000000000000000000000" && (
            <div className="flex items-center gap-1">
              <span className="opacity-70">Contestant:</span>
              <Address address={gameData.contestant} />
            </div>
          )}
          {gameData.totalEntries > 0n && (
            <div>
              <span className="opacity-70">Entries:</span>{" "}
              <span className="font-medium">{Number(gameData.totalEntries)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
