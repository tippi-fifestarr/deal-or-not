"use client";

import { formatEther } from "viem";
import { type CaseTier, TIER_BG_COLORS, TIER_COLORS, getCaseTier } from "~~/contracts/DealOrNoDealAbi";
import { useEthPrice } from "~~/hooks/useEthPrice";

type PrizeBoardProps = {
  /** All 26 prize values sorted ascending (from the contract's prize distribution) */
  allValues: bigint[];
  /** Which values have been revealed/removed */
  remainingValues: bigint[];
};

/** Format ETH value to a compact readable string */
function formatEthCompact(eth: number): string {
  if (eth === 0) return "0";
  if (eth < 0.0001) return "<.0001";
  if (eth < 0.01) return eth.toFixed(4);
  if (eth < 1) return eth.toFixed(3);
  return eth.toFixed(2);
}

/** Format USD value to a compact readable string */
function formatUsdCompact(usd: number): string {
  if (usd < 0.01) return "$0";
  if (usd < 1) return `$${usd.toFixed(2)}`;
  if (usd < 1000) return `$${usd.toFixed(0)}`;
  if (usd < 1_000_000) return `$${(usd / 1000).toFixed(1)}K`;
  return `$${(usd / 1_000_000).toFixed(2)}M`;
}

/**
 * Displays all 26 prize values in two columns with real ETH + USD amounts.
 * Removed values are struck through.
 */
export const PrizeBoard = ({ allValues, remainingValues }: PrizeBoardProps) => {
  const { ethPrice } = useEthPrice();

  // Sort all values ascending for display
  const sortedValues = [...allValues].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  // Track which values from remainingValues have been "consumed"
  // so we correctly handle duplicate amounts
  const remainingCounts = new Map<string, number>();
  for (const v of remainingValues) {
    const key = v.toString();
    remainingCounts.set(key, (remainingCounts.get(key) ?? 0) + 1);
  }

  // Build display items
  const items = sortedValues.map((value, idx) => {
    const key = value.toString();
    const count = remainingCounts.get(key) ?? 0;
    const isRemaining = count > 0;
    if (isRemaining) {
      remainingCounts.set(key, count - 1);
    }

    const tier = getCaseTier(idx);
    return { value, isRemaining, tier };
  });

  // Split into two columns: low (0-12) and high (13-25)
  const leftColumn = items.slice(0, 13);
  const rightColumn = items.slice(13);

  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body p-4">
        <h3 className="card-title text-sm">Prize Board</h3>
        {/* Column headers */}
        <div className="grid grid-cols-2 gap-x-4">
          <div className="flex justify-between text-[10px] opacity-50 px-2 mb-1">
            <span>ETH</span>
            <span>USD</span>
          </div>
          <div className="flex justify-between text-[10px] opacity-50 px-2 mb-1">
            <span>ETH</span>
            <span>USD</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0">
          {/* Low values */}
          <div className="flex flex-col gap-0.5">
            {leftColumn.map((item, idx) => (
              <PrizeRow key={idx} {...item} ethPrice={ethPrice} />
            ))}
          </div>

          {/* High values */}
          <div className="flex flex-col gap-0.5">
            {rightColumn.map((item, idx) => (
              <PrizeRow key={idx} {...item} ethPrice={ethPrice} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const PrizeRow = ({
  value,
  isRemaining,
  tier,
  ethPrice,
}: {
  value: bigint;
  isRemaining: boolean;
  tier: CaseTier;
  ethPrice: number;
}) => {
  const ethValue = parseFloat(formatEther(value));
  const usdValue = ethValue * ethPrice;

  return (
    <div
      className={`
        flex items-center justify-between px-2 py-0.5 rounded text-xs font-mono
        ${isRemaining ? TIER_BG_COLORS[tier] : "bg-transparent"}
        ${isRemaining ? TIER_COLORS[tier] : "text-base-content/20 line-through"}
      `}
    >
      <span className="truncate">{formatEthCompact(ethValue)}</span>
      <span className="ml-2 text-right whitespace-nowrap opacity-70">
        {ethPrice > 0 ? formatUsdCompact(usdValue) : "—"}
      </span>
    </div>
  );
};
