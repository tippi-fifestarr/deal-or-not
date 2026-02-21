"use client";

import { useReadContract, useWriteContract, useChainId } from "wagmi";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { CCIP_GATEWAY_ABI, CCIP_ROUTER_ABI } from "../lib/contracts";
import {
  getCCIPGatewayAddress,
  getCCIPRouterAddress,
  getHomeChainSelector,
  isHomeChain,
} from "../lib/chains";
import { formatCCIPFeeETH, getCCIPExplorerUrl } from "../lib/ccip";
import { useMemo } from "react";

export interface BetParams {
  gameId: bigint;
  betType: number; // 0 = deal outcome, 1 = case value, etc.
  choice: number; // Specific choice within bet type
}

/**
 * Hook to check if current chain supports CCIP betting
 */
export function useCCIPSupported() {
  const chainId = useChainId();
  const isHome = isHomeChain(chainId);
  const gatewayAddress = useMemo(() => getCCIPGatewayAddress(chainId), [chainId]);

  return {
    isSupported: !isHome && gatewayAddress !== null,
    isHomeChain: isHome,
    gatewayAddress,
  };
}

/**
 * Hook to get CCIP gateway contract config
 */
function useCCIPGatewayConfig() {
  const chainId = useChainId();
  const gatewayAddress = useMemo(() => getCCIPGatewayAddress(chainId), [chainId]);

  return useMemo(
    () =>
      gatewayAddress
        ? ({
            address: gatewayAddress,
            abi: CCIP_GATEWAY_ABI,
          } as const)
        : null,
    [gatewayAddress]
  );
}

/**
 * Hook to estimate CCIP fee for a bet
 */
export function useCCIPFeeEstimate(params: BetParams | null) {
  const chainId = useChainId();
  const routerAddress = useMemo(() => getCCIPRouterAddress(chainId), [chainId]);
  const homeChainSelector = useMemo(() => getHomeChainSelector(), []);
  const gatewayAddress = useMemo(() => getCCIPGatewayAddress(chainId), [chainId]);

  // Encode bet data: (gameId, betType, choice, bettor)
  const betData = useMemo(() => {
    if (!params || !gatewayAddress || !homeChainSelector) return null;

    // For fee estimation, we use a placeholder address for bettor
    // The actual bettor will be msg.sender in the contract
    const placeholderBettor = "0x0000000000000000000000000000000000000000";
    return encodeAbiParameters(
      parseAbiParameters("uint256, uint8, uint8, address"),
      [params.gameId, params.betType, params.choice, placeholderBettor as `0x${string}`]
    );
  }, [params, gatewayAddress, homeChainSelector]);

  const ccipMessage = useMemo(() => {
    if (!betData || !gatewayAddress || !homeChainSelector) return null;

    return {
      receiver: encodeAbiParameters(parseAbiParameters("address"), [gatewayAddress]),
      data: betData,
      tokenAmounts: [],
      feeToken: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      extraArgs: "0x" as `0x${string}`, // Simplified for now
    };
  }, [betData, gatewayAddress, homeChainSelector]);

  const { data: fee, isLoading } = useReadContract({
    address: routerAddress ?? undefined,
    abi: CCIP_ROUTER_ABI,
    functionName: "getFee",
    args: routerAddress && homeChainSelector && ccipMessage
      ? [homeChainSelector, ccipMessage]
      : undefined,
    query: {
      enabled: routerAddress !== null && homeChainSelector !== null && ccipMessage !== null,
    },
  });

  return {
    fee: fee as bigint | undefined,
    isLoading,
    formattedFee: fee ? formatCCIPFeeETH(fee as bigint) : null,
  };
}

/**
 * Hook to place a cross-chain bet
 */
export function usePlaceBet() {
  const gatewayConfig = useCCIPGatewayConfig();
  const { writeContractAsync, isPending } = useWriteContract();

  const placeBet = async (params: BetParams, value: bigint) => {
    if (!gatewayConfig) {
      throw new Error("CCIP gateway not available on this chain");
    }

    return writeContractAsync({
      ...gatewayConfig,
      functionName: "placeBet",
      args: [params.gameId, params.betType, params.choice],
      value,
    });
  };

  return {
    placeBet,
    isPending,
    isAvailable: gatewayConfig !== null,
  };
}

/**
 * Hook to get bet statistics from gateway
 */
export function useBetStatistics() {
  const gatewayConfig = useCCIPGatewayConfig();

  const { data: totalBetsSent } = useReadContract({
    ...gatewayConfig,
    functionName: "totalBetsSent",
    query: { enabled: gatewayConfig !== null },
  });

  const { data: totalPayoutsReceived } = useReadContract({
    ...gatewayConfig,
    functionName: "totalPayoutsReceived",
    query: { enabled: gatewayConfig !== null },
  });

  return {
    totalBetsSent: totalBetsSent as bigint | undefined,
    totalPayoutsReceived: totalPayoutsReceived as bigint | undefined,
    isAvailable: gatewayConfig !== null,
  };
}

/**
 * Hook to get CCIP message explorer URL
 */
export function useCCIPExplorer(messageId: string | null) {
  const chainId = useChainId();

  return useMemo(() => {
    if (!messageId) return null;
    return getCCIPExplorerUrl(chainId, messageId);
  }, [chainId, messageId]);
}
