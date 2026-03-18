// Aptos contract configuration for Deal or NOT
// Module address will be set after deployment to testnet

export const APTOS_MODULE_ADDRESS = process.env.NEXT_PUBLIC_APTOS_MODULE_ADDRESS ?? "0xCAFE";
export const APTOS_NETWORK = (process.env.NEXT_PUBLIC_APTOS_NETWORK ?? "testnet") as "mainnet" | "testnet" | "devnet";

// Module names matching our Move sources
export const MODULES = {
  quickplay: `${APTOS_MODULE_ADDRESS}::deal_or_not_quickplay`,
  bank: `${APTOS_MODULE_ADDRESS}::bank`,
  priceFeed: `${APTOS_MODULE_ADDRESS}::price_feed_helper`,
  agentRegistry: `${APTOS_MODULE_ADDRESS}::agent_registry`,
  agents: `${APTOS_MODULE_ADDRESS}::deal_or_not_agents`,
  bestOfBanker: `${APTOS_MODULE_ADDRESS}::best_of_banker`,
  predictionMarket: `${APTOS_MODULE_ADDRESS}::prediction_market`,
  sponsorVault: `${APTOS_MODULE_ADDRESS}::sponsor_vault`,
  leaderboard: `${APTOS_MODULE_ADDRESS}::seasonal_leaderboard`,
  staking: `${APTOS_MODULE_ADDRESS}::agent_staking`,
} as const;

// Aptos game phases (7 phases, different from EVM's 9)
export const APTOS_PHASES = {
  Created: 0,
  Round: 1,
  WaitingForReveal: 2,
  AwaitingOffer: 3,
  BankerOffer: 4,
  FinalRound: 5,
  GameOver: 6,
} as const;

export const APTOS_PHASE_NAMES: Record<number, string> = {
  0: "Pick Your Case",
  1: "Choose a Case to Open",
  2: "Revealing Case Value...",
  3: "Ring the Banker",
  4: "The Banker Is Calling...",
  5: "Final Decision",
  6: "Game Over",
};

// Case values in cents (same as EVM)
export const CASE_VALUES_CENTS = [1, 5, 10, 50, 100] as const;

// APT has 8 decimals (vs ETH 18)
export const APT_DECIMALS = 8;
export const OCTAS_PER_APT = 100_000_000;
