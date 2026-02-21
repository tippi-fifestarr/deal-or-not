"use client";

import { formatEther } from "viem";
import { useEthPrice } from "~~/hooks/useEthPrice";

type EVDashboardProps = {
  currentEV: bigint;
  bankerOffer: bigint;
  remainingCount: number;
  currentRound: number;
  prizePool: bigint;
};

/**
 * Statistics panel showing Expected Value analytics.
 */
export const EVDashboard = ({ currentEV, bankerOffer, remainingCount, currentRound, prizePool }: EVDashboardProps) => {
  const { ethPrice } = useEthPrice();

  const evEth = parseFloat(formatEther(currentEV));
  const offerEth = parseFloat(formatEther(bankerOffer));
  const poolEth = parseFloat(formatEther(prizePool));

  const evUsd = evEth * ethPrice;
  const offerUsd = offerEth * ethPrice;
  const poolUsd = poolEth * ethPrice;

  const dealQuality = evEth > 0 ? (offerEth / evEth) * 100 : 0;
  const hasOffer = bankerOffer > 0n;

  const getQualityIndicator = (): { label: string; className: string } => {
    if (!hasOffer) return { label: "No offer yet", className: "text-base-content/50" };
    if (dealQuality >= 90) return { label: "Excellent", className: "text-success" };
    if (dealQuality >= 70) return { label: "Good", className: "text-info" };
    if (dealQuality >= 50) return { label: "Fair", className: "text-warning" };
    return { label: "Bad", className: "text-error" };
  };

  const quality = getQualityIndicator();

  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body p-4">
        <h3 className="card-title text-sm">EV Dashboard</h3>

        <div className="grid grid-cols-2 gap-3">
          {/* Current EV */}
          <div className="stat bg-base-100 rounded-lg p-3">
            <div className="stat-title text-xs">Expected Value</div>
            {ethPrice > 0 ? (
              <>
                <div className="stat-value text-base text-primary">
                  ${evUsd.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <div className="stat-desc text-xs">{evEth.toFixed(4)} ETH</div>
              </>
            ) : (
              <>
                <div className="stat-value text-lg text-primary">{evEth.toFixed(4)}</div>
                <div className="stat-desc">ETH</div>
              </>
            )}
          </div>

          {/* Prize Pool */}
          <div className="stat bg-base-100 rounded-lg p-3">
            <div className="stat-title text-xs">Prize Pool</div>
            {ethPrice > 0 ? (
              <>
                <div className="stat-value text-base">
                  ${poolUsd.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <div className="stat-desc text-xs">{poolEth.toFixed(4)} ETH</div>
              </>
            ) : (
              <>
                <div className="stat-value text-lg">{poolEth.toFixed(4)}</div>
                <div className="stat-desc">ETH</div>
              </>
            )}
          </div>

          {/* Current Round */}
          <div className="stat bg-base-100 rounded-lg p-3">
            <div className="stat-title text-xs">Round</div>
            <div className="stat-value text-lg">{currentRound + 1}</div>
            <div className="stat-desc">of 10</div>
          </div>

          {/* Cases Remaining */}
          <div className="stat bg-base-100 rounded-lg p-3">
            <div className="stat-title text-xs">Cases Left</div>
            <div className="stat-value text-lg">{remainingCount}</div>
            <div className="stat-desc">of 26</div>
          </div>
        </div>

        {/* Banker Offer vs EV comparison */}
        {hasOffer && (
          <div className="mt-3 bg-base-100 rounded-lg p-3">
            <div className="text-xs opacity-70 mb-2">Last Banker Offer vs EV</div>
            <div className="flex items-end gap-3">
              {/* EV bar */}
              <div className="flex-1">
                <div className="text-xs mb-1 text-center">EV</div>
                <div className="w-full bg-base-300 rounded h-8 relative overflow-hidden">
                  <div
                    className="bg-primary h-full rounded flex items-center justify-center text-xs font-bold text-primary-content"
                    style={{ width: "100%" }}
                  >
                    {ethPrice > 0
                      ? `$${evUsd.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                      : evEth.toFixed(4)}
                  </div>
                </div>
              </div>

              {/* Offer bar */}
              <div className="flex-1">
                <div className="text-xs mb-1 text-center">Offer</div>
                <div className="w-full bg-base-300 rounded h-8 relative overflow-hidden">
                  <div
                    className={`h-full rounded flex items-center justify-center text-xs font-bold ${
                      dealQuality >= 70
                        ? "bg-success text-success-content"
                        : dealQuality >= 50
                          ? "bg-warning text-warning-content"
                          : "bg-error text-error-content"
                    }`}
                    style={{ width: `${Math.min(dealQuality, 100)}%` }}
                  >
                    {ethPrice > 0
                      ? `$${offerUsd.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                      : offerEth.toFixed(4)}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center mt-2">
              <span className="text-xs opacity-70">Deal Quality:</span>
              <span className={`text-sm font-bold ${quality.className}`}>
                {quality.label} ({dealQuality.toFixed(1)}% of EV)
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
