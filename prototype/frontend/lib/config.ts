import { baseSepolia } from "wagmi/chains";

// ── Contract Addresses (Base Sepolia) ──
export const CONTRACT_ADDRESS = "0xd9D4A974021055c46fD834049e36c21D7EE48137" as `0x${string}`;
export const SPONSOR_JACKPOT_ADDRESS = "0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95" as `0x${string}`;
export const BEST_OF_BANKER_ADDRESS = "0x05EdC924f92aBCbbB91737479948509dC7E23bF9" as `0x${string}`;

// ── Agent Infrastructure (Base Sepolia) ──
export const AGENT_REGISTRY_ADDRESS = "0xf3B0d29416d3504c802bab4A799349746A37E788" as `0x${string}`;
export const DEAL_OR_NOT_AGENTS_ADDRESS = "0x4cEdE5dD14dCa8F71a766E3b3eb1fB5801835083" as `0x${string}`;
export const AGENT_STAKING_ADDRESS = "0x2D10F49c7beB08c8426d22505B38B0969Cee3961" as `0x${string}`;
export const SEASONAL_LEADERBOARD_ADDRESS = "0x749646c52F32599BD3f5Eeef57d169940d4b29b0" as `0x${string}`;
export const PREDICTION_MARKET_ADDRESS = "0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4" as `0x${string}`;

// ── Feature Flags ──
export const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false"; // default: mock

// ── Chain Config ──
export const CHAIN = baseSepolia;
export const CHAIN_ID = baseSepolia.id; // 84532

// ── Chainlink Config ──
export const VRF_COORDINATOR = "0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE" as `0x${string}`;
export const VRF_SUB_ID = "20136374336138753384898843390506225296052091906296406953567310616148092014984";
export const VRF_KEY_HASH = "0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71";
export const ETH_USD_PRICE_FEED = "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1" as `0x${string}`;
export const LINK_TOKEN = "0xE4aB69C077896252FAFBD49EFD26B5D171A32410" as `0x${string}`;

// ── Burner Wallets (Base Sepolia testnet only) ──
export const DEPLOYER_ADDRESS = "0x75a32D24fd4EDB2C5895aCE905dA5Ee1fBD584A1" as `0x${string}`;
export const PLAYER_ADDRESS = "0xC96Bcb1EACE35d09189a6e52758255b8951a7587" as `0x${string}`;
