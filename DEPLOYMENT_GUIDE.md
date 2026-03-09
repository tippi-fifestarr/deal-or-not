# Deployment Guide: Deal or NOT

All contracts deploy to **Base Sepolia** via Foundry. The Gateway (CCIP spoke) deploys to **ETH Sepolia**.

Live at **[dealornot.vercel.app](https://dealornot.vercel.app)**.

## Prerequisites

1. [Foundry](https://book.getfoundry.sh/) installed (`forge`, `cast`)
2. Deployer wallet with ETH on Base Sepolia (and ETH Sepolia for CCIP)
3. VRF subscription funded with LINK: [vrf.chain.link](https://vrf.chain.link)

## Environment Setup

Everything runs through `packages/convergence/script/env.sh`, which reads keys from `.env` (gitignored) or `.env.example` (fallback).

```bash
# From the repo root:
source packages/convergence/script/env.sh

# Or from packages/convergence/:
source script/env.sh

# This exports: DEPLOYER_KEY, DEPLOYER_ADDR, PLAYER_KEY, PLAYER_ADDR,
#               PRIVATE_KEY (alias for DEPLOYER_KEY, used by forge scripts),
#               RPC_URL, GAME_CONTRACT, BANK_CONTRACT, AGENTS_CONTRACT, etc.
```

## Compile and Test

```bash
cd packages/convergence
forge build    # Should compile with warnings only
forge test     # 244+ tests across 13 suites, all passing
```

## What to Deploy

There are 4 deploy scripts in `packages/convergence/script/`:

| Script | Deploys | When to Use |
|--------|---------|-------------|
| `Deploy.s.sol` | DealOrNotQuickPlay + Bank (core game) | Rarely, already deployed |
| `DeployAgentInfra.s.sol` | DealOrNotAgents, AgentRegistry, AgentStaking, SeasonalLeaderboard, PredictionMarket, SharedPriceFeed | When agent infra changes |
| `DeployCCIP.s.sol` | DealOrNotBridge (Base Sepolia) + DealOrNotGateway (ETH Sepolia) | When CCIP changes |
| `DeployCCIPGasFunder.s.sol` | CCIP gas funding helper | When CCIP gas config changes |

## Deploy Commands

### Core Game (DealOrNotQuickPlay + Bank)

```bash
cd packages/convergence
source script/env.sh

forge script script/Deploy.s.sol \
  --rpc-url $RPC_URL --broadcast
```

### Agent Infrastructure

```bash
forge script script/DeployAgentInfra.s.sol \
  --rpc-url $RPC_URL --broadcast
```

### CCIP Bridge + Gateway

```bash
# Bridge on Base Sepolia
forge script script/DeployCCIP.s.sol \
  --rpc-url $RPC_URL --broadcast

# Gateway on ETH Sepolia (update RPC)
forge script script/DeployCCIP.s.sol \
  --rpc-url $ETH_SEPOLIA_RPC --broadcast
```

## Post-Deploy Wiring

After deploying new contracts, they need to be authorized to talk to each other.

### After deploying DealOrNotAgents

```bash
source script/env.sh

# 1. Add as VRF consumer at https://vrf.chain.link

# 2. Authorize CRE Forwarder (so CRE workflows can write to the contract)
cast send $AGENTS_CONTRACT \
  "setCREForwarder(address)" $CRE_FORWARDER \
  --private-key $DEPLOYER_KEY --rpc-url $RPC_URL

# 3. Authorize in AgentStaking (so DealOrNotAgents can add rewards)
cast send $AGENT_STAKING \
  "setAuthorizedCaller(address,bool)" $AGENTS_CONTRACT true \
  --private-key $DEPLOYER_KEY --rpc-url $RPC_URL

# 4. Authorize in SeasonalLeaderboard
cast send $SEASONAL_LEADERBOARD \
  "authorizeRecorder(address)" $AGENTS_CONTRACT \
  --private-key $DEPLOYER_KEY --rpc-url $RPC_URL
```

### After deploying PredictionMarket

```bash
# Authorize CRE Forwarder for market-creator workflow
cast send $PREDICTION_MARKET \
  "authorizeResolver(address)" $CRE_FORWARDER \
  --private-key $DEPLOYER_KEY --rpc-url $RPC_URL
```

## Update Frontend

After deploying, update the addresses in `packages/convergence/dealornot/lib/config.ts`:

```typescript
export const CONTRACT_ADDRESS = "0x..."; // DealOrNotQuickPlay
```

And agent addresses in the relevant hooks. Then redeploy:

```bash
cd packages/convergence/dealornot
npx vercel --prod
```

## Verify on Sourcify

Sourcify verification is free (no API key needed):

```bash
forge verify-contract $CONTRACT_ADDR ContractName \
  --verifier sourcify \
  --chain-id 84532 \
  --watch
```

For contracts with constructor args, add `--constructor-args $(cast abi-encode "constructor(address)" $ARG)`.

## Currently Deployed (Base Sepolia)

| Contract | Address | Status |
|----------|---------|--------|
| DealOrNotQuickPlay | [`0x46B6b547A4683ac5533CAce6aDc4d399b50424A7`](https://sepolia.basescan.org/address/0x46B6b547A4683ac5533CAce6aDc4d399b50424A7) | Active, core game |
| Bank | [`0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB`](https://sepolia.basescan.org/address/0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB) | Active |
| SponsorVault | [`0x14a26cb376d8e36c47261A46d6b203A7BaADaE53`](https://sepolia.basescan.org/address/0x14a26cb376d8e36c47261A46d6b203A7BaADaE53) | Active |
| BestOfBanker | [`0x55100EF4168d21631EEa6f2b73D6303Bb008F554`](https://sepolia.basescan.org/address/0x55100EF4168d21631EEa6f2b73D6303Bb008F554) | Active |
| DealOrNotBridge | [`0xB233eFD1623f843151C97a1fB32f9115AaE6a875`](https://sepolia.basescan.org/address/0xB233eFD1623f843151C97a1fB32f9115AaE6a875) | CCIP hub |
| DealOrNotAgents | [`0xa04cF1072A33B3FF4aB6bb1E054e69e66BaD5430`](https://sepolia.basescan.org/address/0xa04cF1072A33B3FF4aB6bb1E054e69e66BaD5430) | Active |
| AgentRegistry | [`0x2eDE9C65F4Ff33F4190aee798478bb579f248F52`](https://sepolia.basescan.org/address/0x2eDE9C65F4Ff33F4190aee798478bb579f248F52) | Active |
| AgentStaking | [`0xaFb6D74eD5286158312163671E93fba8A6Fd058e`](https://sepolia.basescan.org/address/0xaFb6D74eD5286158312163671E93fba8A6Fd058e) | Active |
| SeasonalLeaderboard | [`0x2C91eF4616f7D4386F27C237D77169395e9EfCE0`](https://sepolia.basescan.org/address/0x2C91eF4616f7D4386F27C237D77169395e9EfCE0) | Active |
| PredictionMarket | [`0x1B995CC591Ec168df03339Fae74B0752Aa1259d8`](https://sepolia.basescan.org/address/0x1B995CC591Ec168df03339Fae74B0752Aa1259d8) | Active |
| SharedPriceFeed | [`0x9AB27e309E677c0ec488E37E8F3B193958D2bBc7`](https://sepolia.basescan.org/address/0x9AB27e309E677c0ec488E37E8F3B193958D2bBc7) | Active |

### ETH Sepolia

| Contract | Address |
|----------|---------|
| DealOrNotGateway | [`0x366215E1F493f3420AbD5551c0618c2B28CBc18A`](https://sepolia.etherscan.io/address/0x366215E1F493f3420AbD5551c0618c2B28CBc18A) |

### Chainlink Infrastructure (Base Sepolia)

| Service | Address |
|---------|---------|
| VRF Coordinator | `0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE` |
| ETH/USD Price Feed | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` |
| CRE Keystone Forwarder | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` |

## Quick Verification

```bash
source packages/convergence/script/env.sh

# Check bank is active
cast call $BANK_CONTRACT "isActive()(bool)" --rpc-url $RPC_URL

# Check game count
cast call $GAME_CONTRACT "nextGameId()(uint256)" --rpc-url $RPC_URL

# Check BestOfBanker has AI quotes
cast call $BEST_OF_BANKER "quoteCount()(uint256)" --rpc-url $RPC_URL

# Check agent game count
cast call $AGENTS_CONTRACT "nextGameId()(uint256)" --rpc-url $RPC_URL
```
