"use client";

import { centsToUsd } from "../../types/game";
import { formatEther } from "viem";

interface BankerOfferProps {
  offerCents: bigint;
  offerWei?: bigint;
  onAccept: () => void;
  onReject: () => void;
  isPending: boolean;
}

export default function BankerOffer({
  offerCents,
  offerWei,
  onAccept,
  onReject,
  isPending,
}: BankerOfferProps) {
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      data-testid="banker-offer-modal"
    >
      <div className="bg-gray-900 border-2 border-amber-500 rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl shadow-amber-500/20">
        <h2 className="text-amber-400 text-center text-sm uppercase tracking-widest mb-2">
          The Banker is Calling...
        </h2>
        <div className="text-center mb-6">
          <p className="text-white text-4xl font-bold mb-1">
            {centsToUsd(Number(offerCents))}
          </p>
          {offerWei && (
            <p className="text-gray-400 text-sm">
              ~{Number(formatEther(offerWei)).toFixed(6)} ETH
            </p>
          )}
        </div>

        <div className="flex gap-4">
          <button
            className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
            onClick={onAccept}
            disabled={isPending}
            data-testid="deal-button"
          >
            DEAL
          </button>
          <button
            className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
            onClick={onReject}
            disabled={isPending}
            data-testid="no-deal-button"
          >
            NO DEAL
          </button>
        </div>
      </div>
    </div>
  );
}
