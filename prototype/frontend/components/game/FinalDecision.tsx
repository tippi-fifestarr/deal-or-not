"use client";

import { Phase } from "@/types/game";
import type { GameState } from "@/types/game";
import BriefcaseRow from "./BriefcaseRow";

interface FinalDecisionProps {
  gameState: GameState;
  gameId: bigint;
  onCommitFinal: (swap: boolean) => Promise<void>;
  onRevealFinal: () => Promise<void>;
  isPending: boolean;
}

export default function FinalDecision({
  gameState,
  gameId,
  onCommitFinal,
  onRevealFinal,
  isPending,
}: FinalDecisionProps) {
  const isWaiting = gameState.phase === Phase.WaitingForFinalReveal;

  return (
    <div className="space-y-6">
      <BriefcaseRow
        opened={gameState.opened}
        playerCase={gameState.playerCase}
        caseValues={gameState.caseValues}
        disabled
      />

      {!isWaiting ? (
        <div className="text-center space-y-4">
          <p className="text-amber-300 text-xl font-semibold">
            Two cases remain. Keep your case or swap?
          </p>
          <p className="text-gray-400 text-sm">
            Your Case: #{gameState.playerCase + 1}
          </p>
          <div className="flex gap-4 justify-center">
            <button
              className="bg-gradient-to-b from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
              onClick={() => onCommitFinal(false)}
              disabled={isPending}
            >
              {isPending ? "Committing..." : "KEEP Case"}
            </button>
            <button
              className="bg-gradient-to-b from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
              onClick={() => onCommitFinal(true)}
              disabled={isPending}
            >
              {isPending ? "Committing..." : "SWAP Case"}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center space-y-4">
          <div className="animate-pulse">
            <p className="text-amber-300 text-lg font-semibold">
              Decision locked in... the moment of truth approaches...
            </p>
            <p className="text-gray-500 text-sm mt-1">
              Waiting for block confirmation
            </p>
          </div>
          <button
            className="bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-400 hover:to-red-400 text-white font-bold py-4 px-10 rounded-xl text-lg transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
            onClick={onRevealFinal}
            disabled={isPending}
          >
            {isPending ? "Revealing..." : "REVEAL FINAL!"}
          </button>
        </div>
      )}
    </div>
  );
}
