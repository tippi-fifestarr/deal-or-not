import { defineChain } from "viem";
import { hardhat } from "wagmi/chains";

// Chain IDs
export const CHAIN_IDS = {
  HARDHAT: 31337,
  BASE_SEPOLIA: 84532,
  OG_NEWTON: 16602,
  ADI: 36900,
} as const;

// CCIP Chain Selectors (from Chainlink docs)
// Base Sepolia: https://docs.chain.link/ccip/supported-networks
export const CCIP_CHAIN_SELECTORS = {
  [CHAIN_IDS.BASE_SEPOLIA]: 10344971235874465080n, // Base Sepolia
  // 0G and ADI may not have CCIP support - will be null if not available
  [CHAIN_IDS.OG_NEWTON]: null as bigint | null,
  [CHAIN_IDS.ADI]: null as bigint | null,
  [CHAIN_IDS.HARDHAT]: null as bigint | null, // Mock CCIP in local dev
} as const;

// Home chain is Base Sepolia (where CashCase and CCIPBridge live)
export const HOME_CHAIN_ID = CHAIN_IDS.BASE_SEPOLIA;

// Define custom chains for 0G and ADI
export const ogNewtonTestnet = defineChain({
  id: CHAIN_IDS.OG_NEWTON,
  name: "0G Newton Testnet",
  nativeCurrency: {
    name: "A0GI",
    symbol: "A0GI",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://evmrpc-testnet.0g.ai"],
    },
  },
  blockExplorers: {
    default: {
      name: "0G Explorer",
      url: "https://explorer-testnet.0g.ai",
    },
  },
  testnet: true,
});

export const adiChain = defineChain({
  id: CHAIN_IDS.ADI,
  name: "ADI Chain",
  nativeCurrency: {
    name: "ADI",
    symbol: "ADI",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.adifoundation.ai/"],
    },
  },
  blockExplorers: {
    default: {
      name: "ADI Explorer",
      url: "https://explorer.adifoundation.ai",
    },
  },
  testnet: false, // ADI Chain is mainnet
});

export const baseSepolia = defineChain({
  id: CHAIN_IDS.BASE_SEPOLIA,
  name: "Base Sepolia",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://sepolia.base.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "BaseScan",
      url: "https://sepolia.basescan.org",
    },
  },
  testnet: true,
});

// All supported chains
export const SUPPORTED_CHAINS = [hardhat, baseSepolia, ogNewtonTestnet, adiChain] as const;

// Chain metadata helper
export interface ChainConfig {
  chainId: number;
  name: string;
  isHomeChain: boolean;
  hasCCIP: boolean;
  ccipChainSelector: bigint | null;
  rpcUrl: string;
  blockExplorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export function getChainConfig(chainId: number): ChainConfig | null {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  if (!chain) return null;

  const isHomeChain = chainId === HOME_CHAIN_ID;
  const ccipSelector = CCIP_CHAIN_SELECTORS[chainId as keyof typeof CCIP_CHAIN_SELECTORS] ?? null;
  const hasCCIP = ccipSelector !== null;

  return {
    chainId: chain.id,
    name: chain.name,
    isHomeChain,
    hasCCIP,
    ccipChainSelector: ccipSelector,
    rpcUrl: chain.rpcUrls.default.http[0],
    blockExplorerUrl: chain.blockExplorers?.default?.url ?? "",
    nativeCurrency: {
      name: chain.nativeCurrency.name,
      symbol: chain.nativeCurrency.symbol,
      decimals: chain.nativeCurrency.decimals,
    },
  };
}

// Contract address getters (from environment variables)
export function getCashCaseAddress(chainId: number): `0x${string}` | null {
  const envKey = `NEXT_PUBLIC_CASHCASE_ADDRESS_${chainId}`;
  const address = process.env[envKey] as `0x${string}` | undefined;
  if (address && address !== "0x0000000000000000000000000000000000000000") {
    return address;
  }
  // Fallback to single env var for backward compatibility (localhost)
  if (chainId === CHAIN_IDS.HARDHAT) {
    const fallback = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined;
    if (fallback && fallback !== "0x0000000000000000000000000000000000000000") {
      return fallback;
    }
  }
  return null;
}

export function getRegistryAddress(chainId: number): `0x${string}` | null {
  const envKey = `NEXT_PUBLIC_REGISTRY_ADDRESS_${chainId}`;
  const address = process.env[envKey] as `0x${string}` | undefined;
  if (address && address !== "0x0000000000000000000000000000000000000000") {
    return address;
  }
  // Fallback to single env var for backward compatibility
  const fallback = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as `0x${string}` | undefined;
  if (fallback && fallback !== "0x0000000000000000000000000000000000000000") {
    return fallback;
  }
  return null;
}

export function getCCIPGatewayAddress(chainId: number): `0x${string}` | null {
  // Gateway only exists on spoke chains (not home chain)
  if (chainId === HOME_CHAIN_ID) {
    return null;
  }
  const envKey = `NEXT_PUBLIC_CCIP_GATEWAY_ADDRESS_${chainId}`;
  const address = process.env[envKey] as `0x${string}` | undefined;
  if (address && address !== "0x0000000000000000000000000000000000000000") {
    return address;
  }
  return null;
}

export function getCCIPRouterAddress(chainId: number): `0x${string}` | null {
  const envKey = `NEXT_PUBLIC_CCIP_ROUTER_ADDRESS_${chainId}`;
  const address = process.env[envKey] as `0x${string}` | undefined;
  if (address && address !== "0x0000000000000000000000000000000000000000") {
    return address;
  }
  return null;
}

export function getHomeChainSelector(): bigint | null {
  const selector = process.env.NEXT_PUBLIC_CCIP_HOME_CHAIN_SELECTOR;
  if (selector) {
    return BigInt(selector);
  }
  // Fallback to Base Sepolia selector if not set
  return CCIP_CHAIN_SELECTORS[CHAIN_IDS.BASE_SEPOLIA];
}

export function isHomeChain(chainId: number): boolean {
  return chainId === HOME_CHAIN_ID;
}

// Helper to get MetaMask chain params for adding custom chains
export function getAddChainParams(chainId: number) {
  const config = getChainConfig(chainId);
  if (!config) return null;

  return {
    chainId: `0x${chainId.toString(16)}`,
    chainName: config.name,
    rpcUrls: [config.rpcUrl],
    nativeCurrency: config.nativeCurrency,
    blockExplorerUrls: config.blockExplorerUrl ? [config.blockExplorerUrl] : undefined,
  };
}
