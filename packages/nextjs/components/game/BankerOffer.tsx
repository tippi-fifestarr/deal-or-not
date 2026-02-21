"use client";

import { useState } from "react";
import { formatEther } from "viem";
import { useEthPrice } from "~~/hooks/useEthPrice";

type BankerOfferProps = {
  offer: bigint;
  currentEV: bigint;
  onAcceptDeal: () => Promise<void>;
  onRejectDeal: () => Promise<void>;
  isContestant: boolean;
};

/**
 * Modal overlay that appears during the BankerOffer state.
 * Shows the offer amount, deal quality, and DEAL / NO DEAL buttons.
 */
export const BankerOffer = ({ offer, currentEV, onAcceptDeal, onRejectDeal, isContestant }: BankerOfferProps) => {
  const [isPending, setIsPending] = useState(false);
  const { ethPrice } = useEthPrice();

  const offerEth = parseFloat(formatEther(offer));
  const evEth = parseFloat(formatEther(currentEV));
  const offerUsd = offerEth * ethPrice;
  const evUsd = evEth * ethPrice;

  // Deal quality: offer / EV * 100
  const dealQuality = evEth > 0 ? (offerEth / evEth) * 100 : 0;

  const getQualityLabel = (): { text: string; className: string } => {
    if (dealQuality >= 90) return { text: "Excellent Deal", className: "text-success" };
    if (dealQuality >= 70) return { text: "Good Deal", className: "text-info" };
    if (dealQuality >= 50) return { text: "Fair Deal", className: "text-warning" };
    return { text: "Low-ball Offer", className: "text-error" };
  };

  const quality = getQualityLabel();

  const handleAccept = async () => {
    setIsPending(true);
    try {
      await onAcceptDeal();
    } finally {
      setIsPending(false);
    }
  };

  const handleReject = async () => {
    setIsPending(true);
    try {
      await onRejectDeal();
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="card bg-base-100 shadow-2xl w-full max-w-md mx-4">
        <div className="card-body items-center text-center">
          {/* Phone icon / Banker header */}
          <div className="text-4xl mb-2">&#128222;</div>
          <h2 className="card-title text-2xl">The Banker is Calling...</h2>

          {/* Offer amount */}
          <div className="my-4">
            <p className="text-sm opacity-70 mb-1">The Banker offers you</p>
            {ethPrice > 0 ? (
              <>
                <p className="text-5xl font-bold text-primary">
                  ${offerUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-sm opacity-50 mt-1">{offerEth.toFixed(4)} ETH</p>
              </>
            ) : (
              <p className="text-4xl font-bold text-primary">{offerEth.toFixed(4)} ETH</p>
            )}
          </div>

          {/* EV comparison */}
          <div className="w-full bg-base-200 rounded-lg p-4 mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="opacity-70">Expected Value:</span>
              {ethPrice > 0 ? (
                <span className="font-mono">
                  ${evUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              ) : (
                <span className="font-mono">{evEth.toFixed(4)} ETH</span>
              )}
            </div>
            <div className="flex justify-between text-sm mb-3">
              <span className="opacity-70">Offer vs EV:</span>
              <span className={`font-bold ${quality.className}`}>{dealQuality.toFixed(1)}%</span>
            </div>

            {/* Visual bar */}
            <div className="w-full bg-base-300 rounded-full h-3 relative">
              <div className="bg-primary rounded-full h-3" style={{ width: `${Math.min(dealQuality, 100)}%` }} />
              {/* EV marker at 100% */}
              <div className="absolute top-0 w-0.5 h-3 bg-warning" style={{ left: "100%" }} />
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span>0%</span>
              <span className={quality.className}>{quality.text}</span>
              <span>EV</span>
            </div>
          </div>

          {/* Action buttons */}
          {isContestant ? (
            <div className="flex gap-4 w-full">
              <button className="btn btn-success btn-lg flex-1 text-xl" onClick={handleAccept} disabled={isPending}>
                {isPending ? <span className="loading loading-spinner" /> : "DEAL"}
              </button>
              <button className="btn btn-error btn-lg flex-1 text-xl" onClick={handleReject} disabled={isPending}>
                {isPending ? <span className="loading loading-spinner" /> : "NO DEAL"}
              </button>
            </div>
          ) : (
            <div className="text-sm opacity-70">Waiting for the contestant to decide...</div>
          )}
        </div>
      </div>
    </div>
  );
};
