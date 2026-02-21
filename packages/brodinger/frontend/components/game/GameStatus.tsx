"use client";

import { GamePhase, casesRemainingInRound } from "../../types/game";

interface GameStatusProps {
  phase: GamePhase;
  currentRound: number;
  casesOpenedThisRound: number;
  ethUsdPrice?: bigint;
}

export default function GameStatus({
  phase,
  currentRound,
  casesOpenedThisRound,
  ethUsdPrice,
}: GameStatusProps) {
  const phaseText: Record<GamePhase, string> = {
    [GamePhase.WaitingForPlayer]: "Waiting for contestant...",
    [GamePhase.WaitingForVRF]: "Shuffling cases...",
    [GamePhase.RevealCase]: "Reveal your case selection",
    [GamePhase.OpeningCases]: `Round ${currentRound + 1} — Open ${casesRemainingInRound(currentRound, casesOpenedThisRound)} more case${casesRemainingInRound(currentRound, casesOpenedThisRound) !== 1 ? "s" : ""}`,
    [GamePhase.BankerOffer]: "The Banker is making an offer...",
    [GamePhase.FinalSwap]: "Final decision — Keep or Swap?",
    [GamePhase.GameOver]: "Game Over",
  };

  const ethPrice = ethUsdPrice
    ? `$${(Number(ethUsdPrice) / 1e8).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "...";

  return (
    <div className="text-center space-y-1" data-testid="game-status">
      <p className="text-amber-400 font-semibold text-lg" data-testid="phase-text">
        {phaseText[phase]}
      </p>
      <p className="text-gray-400 text-sm">
        ETH/USD: {ethPrice}
      </p>
      {phase === GamePhase.WaitingForVRF && (
        <div className="flex justify-center">
          <div className="animate-spin h-6 w-6 border-2 border-amber-400 border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  );
}
