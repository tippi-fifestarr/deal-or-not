"use client";

import { formatEther } from "viem";
import { type CaseTier, PRIZE_LABELS, TIER_BG_COLORS, TIER_COLORS, getCaseTier } from "~~/contracts/DealOrNoDealAbi";
import { useEthPrice } from "~~/hooks/useEthPrice";

type PrizeBoardProps = {
  /** All 26 prize values sorted ascending (from the contract's prize distribution) */
  allValues: bigint[];
  /** Which values have been revealed/removed */
  remainingValues: bigint[];
};

/**
 * Displays all 26 prize tiers in two columns, with removed values struck through.
 * Values are shown in ascending order matching the show's format.
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

    // Determine tier based on position in the sorted array
    const tier = getCaseTier(idx);

    return { value, isRemaining, tier, label: PRIZE_LABELS[idx] ?? `#${idx}` };
  });

  // Split into two columns: low (0-12) and high (13-25)
  const leftColumn = items.slice(0, 13);
  const rightColumn = items.slice(13);

  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body p-4">
        <h3 className="card-title text-sm">Prize Board</h3>
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
  label,
  ethPrice,
}: {
  value: bigint;
  isRemaining: boolean;
  tier: CaseTier;
  label: string;
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
      <span className="truncate">{label}</span>
      <span className="ml-2 text-right whitespace-nowrap">
        {ethPrice > 0
          ? `$${usdValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
          : ethValue >= 0.0001
            ? `${ethValue.toFixed(4)} ETH`
            : "<0.0001 ETH"}
      </span>
    </div>
  );
};
