import { formatEther, formatUnits } from "viem";
import { getChainConfig, CHAIN_IDS } from "./chains";

/**
 * Get CCIP explorer URL for a message
 * @param chainId Chain ID where the message was sent from
 * @param messageId CCIP message ID (bytes32)
 * @returns Explorer URL or null if not available
 */
export function getCCIPExplorerUrl(
  chainId: number,
  messageId: string
): string | null {
  const config = getChainConfig(chainId);
  if (!config || !config.blockExplorerUrl) {
    return null;
  }

  // CCIP messages can be viewed on Chainlink CCIP explorer
  // For now, link to the transaction that sent the message
  // In the future, could link to https://ccip.chain.link/msg/{messageId}
  return `${config.blockExplorerUrl}/tx/${messageId}`;
}

/**
 * Format CCIP fee for display
 * @param fee Fee in wei
 * @param decimals Native currency decimals (usually 18)
 * @returns Formatted fee string
 */
export function formatCCIPFee(fee: bigint, decimals: number = 18): string {
  if (fee === 0n) return "0";
  try {
    return formatUnits(fee, decimals);
  } catch {
    return fee.toString();
  }
}

/**
 * Format CCIP fee in ETH for display
 * @param fee Fee in wei
 * @returns Formatted fee string with ETH suffix
 */
export function formatCCIPFeeETH(fee: bigint): string {
  const formatted = formatCCIPFee(fee);
  return `${formatted} ETH`;
}

/**
 * Extract messageId from transaction receipt
 * This would typically come from the BetPlaced event
 * @param txHash Transaction hash
 * @returns MessageId if found in events, null otherwise
 */
export function parseCCIPMessageId(txHash: string): string | null {
  // In practice, this would parse the transaction receipt
  // and extract the messageId from the BetPlaced event
  // For now, return the txHash as a placeholder
  return txHash;
}

/**
 * Get CCIP router address for a chain
 * Base Sepolia: Real CCIP router from Chainlink
 * Other chains: May use mock router or null
 */
export function getCCIPRouterAddress(chainId: number): `0x${string}` | null {
  // Base Sepolia CCIP Router (from Chainlink docs)
  if (chainId === CHAIN_IDS.BASE_SEPOLIA) {
    // This is the actual Base Sepolia CCIP router address
    // Should be verified from Chainlink docs: https://docs.chain.link/ccip/supported-networks
    return "0x1035CabC275068eF6232c983BdE55e5f0DE8CD04" as `0x${string}`;
  }

  // For other chains, check env var or return null
  const envKey = `NEXT_PUBLIC_CCIP_ROUTER_ADDRESS_${chainId}`;
  const address = process.env[envKey] as `0x${string}` | undefined;
  if (address && address !== "0x0000000000000000000000000000000000000000") {
    return address;
  }

  return null;
}

/**
 * Check if a chain supports CCIP
 */
export function chainSupportsCCIP(chainId: number): boolean {
  const config = getChainConfig(chainId);
  return config?.hasCCIP ?? false;
}

/**
 * Get home chain selector for CCIP
 */
export function getHomeChainSelector(): bigint | null {
  const selector = process.env.NEXT_PUBLIC_CCIP_HOME_CHAIN_SELECTOR;
  if (selector) {
    return BigInt(selector);
  }
  // Base Sepolia chain selector
  return 10344971235874465080n;
}

/**
 * Format bet amount with CCIP fee breakdown
 */
export function formatBetWithFee(
  totalAmount: bigint,
  ccipFee: bigint,
  decimals: number = 18
): { total: string; fee: string; bet: string } {
  const betAmount = totalAmount - ccipFee;
  return {
    total: formatUnits(totalAmount, decimals),
    fee: formatUnits(ccipFee, decimals),
    bet: formatUnits(betAmount, decimals),
  };
}
