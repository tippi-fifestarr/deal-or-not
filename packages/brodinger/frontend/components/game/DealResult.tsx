"use client";

import { centsToUsd } from "../../types/game";
import { formatEther } from "viem";

interface DealResultProps {
  payoutCents: bigint;
  payoutWei?: bigint;
  onPlayAgain: () => void;
}

export default function DealResult({ payoutCents, payoutWei, onPlayAgain }: DealResultProps) {
  return (
    <div
      className="bg-gray-900 border-2 border-amber-500 rounded-xl p-8 text-center max-w-md mx-auto"
      data-testid="deal-result"
    >
      <h2 className="text-amber-400 text-sm uppercase tracking-widest mb-2">
        Game Over
      </h2>
      <p className="text-white text-5xl font-bold mb-2">
        {centsToUsd(Number(payoutCents))}
      </p>
      {payoutWei && (
        <p className="text-gray-400 text-sm mb-6">
          {Number(formatEther(payoutWei)).toFixed(6)} ETH
        </p>
      )}
      <button
        className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-8 rounded-lg transition-colors"
        onClick={onPlayAgain}
        data-testid="play-again-button"
      >
        Play Again
      </button>
    </div>
  );
}
