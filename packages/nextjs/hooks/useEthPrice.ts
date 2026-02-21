"use client";

import { useEffect, useState } from "react";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { fetchPriceFromUniswap } from "~~/utils/scaffold-eth/fetchPriceFromUniswap";

/**
 * Hook to fetch ETH price in USD from Uniswap
 * Refreshes every 30 seconds
 */
export const useEthPrice = () => {
  const { targetNetwork } = useTargetNetwork();
  const [ethPrice, setEthPrice] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const price = await fetchPriceFromUniswap(targetNetwork);
        setEthPrice(price);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to fetch ETH price:", error);
        setIsLoading(false);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [targetNetwork]);

  return { ethPrice, isLoading };
};
