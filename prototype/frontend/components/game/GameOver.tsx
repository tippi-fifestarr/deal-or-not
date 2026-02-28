"use client";

import { centsToUsd, formatWei } from "@/lib/utils";
import { CASE_VALUES_CENTS, NUM_CASES } from "@/types/game";
import type { GameState } from "@/types/game";

interface GameOverProps {
  gameState: GameState;
  payoutWei?: bigint;
  onPlayAgain: () => void;
}

export default function GameOver({
  gameState,
  payoutWei,
  onPlayAgain,
}: GameOverProps) {
  return (
    <div className="space-y-6 text-center">
      <h2 className="text-3xl font-bold text-amber-400">Game Over!</h2>

      {/* Final payout */}
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-amber-700/30">
        <p className="text-gray-400 text-sm uppercase tracking-wider mb-2">
          Your Payout
        </p>
        <p className="text-white text-5xl font-bold">
          {centsToUsd(gameState.finalPayout)}
        </p>
        {payoutWei && (
          <p className="text-gray-400 text-sm mt-1">~{formatWei(payoutWei)}</p>
        )}
      </div>

      {/* All cases revealed */}
      <div>
        <h3 className="text-gray-400 text-sm uppercase tracking-wider mb-3">
          All Cases Revealed
        </h3>
        <div className="flex gap-3 justify-center flex-wrap">
          {Array.from({ length: NUM_CASES }, (_, i) => {
            const value = gameState.caseValues[i];
            const isPlayerCase = i === gameState.playerCase;
            return (
              <div
                key={i}
                className={`w-24 h-28 rounded-xl flex flex-col items-center justify-center border-2 ${
                  isPlayerCase
                    ? "bg-amber-900/40 border-amber-500 shadow-lg shadow-amber-500/20"
                    : "bg-gray-800/50 border-gray-700"
                }`}
              >
                <span
                  className={`text-xs ${
                    isPlayerCase ? "text-amber-400" : "text-gray-500"
                  }`}
                >
                  #{i + 1}
                  {isPlayerCase && " (yours)"}
                </span>
                <span
                  className={`text-lg font-bold mt-1 ${
                    isPlayerCase ? "text-amber-300" : "text-gray-300"
                  }`}
                >
                  {value > 0n ? centsToUsd(value) : "???"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <button
        className="bg-gradient-to-r from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-white font-bold py-3 px-8 rounded-xl transition-all"
        onClick={onPlayAgain}
      >
        Play Again
      </button>
    </div>
  );
}
