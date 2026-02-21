export const HARDHAT_CHAIN_ID = 31337;
// Legacy: kept for backward compatibility
export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000";
export const NUM_CASES = 12;
export const ENTRY_FEE_CENTS = 100n;
export const MAX_CASE_CENTS = 1000n;
export const SLIPPAGE_BPS = 500n;

// Re-export chain-aware getters from chains.ts for convenience
export {
  getCashCaseAddress,
  getRegistryAddress,
  getCCIPGatewayAddress,
  getCCIPRouterAddress,
  isHomeChain,
  getHomeChainSelector,
} from "./chains";
