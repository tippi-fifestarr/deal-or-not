"use client";

import { formatEther } from "viem";
import { useEthPrice } from "~~/hooks/useEthPrice";

type EthValueProps = {
  value: bigint;
  showBoth?: boolean; // Show both ETH and USD
  usdOnly?: boolean; // Show only USD
  className?: string;
};

/**
 * Display ETH value with optional USD conversion
 */
export const EthValue = ({ value, showBoth = false, usdOnly = false, className = "" }: EthValueProps) => {
  const { ethPrice } = useEthPrice();
  const ethAmount = parseFloat(formatEther(value));
  const usdAmount = ethAmount * ethPrice;

  if (usdOnly && ethPrice > 0) {
    return (
      <span className={className}>
        ${usdAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    );
  }

  if (showBoth && ethPrice > 0) {
    return (
      <span className={className}>
        {ethAmount.toFixed(4)} ETH
        <span className="text-sm opacity-70 ml-1">
          (${usdAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
        </span>
      </span>
    );
  }

  return <span className={className}>{ethAmount.toFixed(4)} ETH</span>;
};
