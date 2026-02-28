"use client";

import { useState } from "react";
import BriefcaseRow from "./BriefcaseRow";
import { Phase } from "@/types/game";
import type { GameState } from "@/types/game";

interface CommitRevealProps {
  gameState: GameState;
  gameId: bigint;
  onCommit: (caseIndex: number) => Promise<void>;
  onReveal: () => Promise<void>;
  isPending: boolean;
}

export default function CommitReveal({
  gameState,
  gameId,
  onCommit,
  onReveal,
  isPending,
}: CommitRevealProps) {
  const [selectedCase, setSelectedCase] = useState<number | null>(null);
  const isWaitingForReveal = gameState.phase === Phase.WaitingForReveal;

  const handleCaseClick = (index: number) => {
    if (isPending || isWaitingForReveal) return;
    setSelectedCase(index);
  };

  const handleCommit = async () => {
    if (selectedCase === null) return;
    await onCommit(selectedCase);
    setSelectedCase(null);
  };

  return (
    <div className="space-y-6">
      {/* Briefcases */}
      <BriefcaseRow
        opened={gameState.opened}
        playerCase={gameState.playerCase}
        caseValues={gameState.caseValues}
        onCaseClick={handleCaseClick}
        disabled={isPending || isWaitingForReveal}
      />

      {/* Commit step */}
      {!isWaitingForReveal && (
        <div className="text-center space-y-3">
          {selectedCase !== null ? (
            <>
              <p className="text-amber-300">
                Open Case <span className="font-bold text-lg">#{selectedCase + 1}</span>?
              </p>
              <button
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3 px-8 rounded-xl transition-all disabled:opacity-50"
                onClick={handleCommit}
                disabled={isPending}
              >
                {isPending ? "Committing..." : "Commit Selection"}
              </button>
            </>
          ) : (
            <p className="text-gray-400">Select a case to open</p>
          )}
        </div>
      )}

      {/* Reveal step */}
      {isWaitingForReveal && (
        <div className="text-center space-y-4">
          <div className="animate-pulse">
            <p className="text-amber-300 text-lg font-semibold">
              Case selected... building tension...
            </p>
            <p className="text-gray-500 text-sm mt-1">
              Waiting for next block confirmation
            </p>
          </div>
          <button
            className="bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-400 hover:to-red-400 text-white font-bold py-4 px-10 rounded-xl text-lg transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
            onClick={onReveal}
            disabled={isPending}
          >
            {isPending ? "Revealing..." : "REVEAL!"}
          </button>
        </div>
      )}
    </div>
  );
}
