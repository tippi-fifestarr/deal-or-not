# Deployment Guide: Deal or NOT

All contracts deploy to Base Sepolia via Foundry. The Gateway (CCIP spoke) deploys to ETH Sepolia.

## Prerequisites

1. [Foundry](https://book.getfoundry.sh/) installed (`forge`, `cast`)
2. Deployer wallet with ETH on Base Sepolia (and ETH Sepolia for CCIP)
3. VRF subscription funded with LINK: [vrf.chain.link](https://vrf.chain.link)

## Environment Setup

Everything runs through `prototype/scripts/env.sh`, which reads keys from `prototype/.env` (gitignored) or falls back to `prototype/.env.example`.

```bash
# From the repo root:
source prototype/scripts/env.sh

# This exports: DEPLOYER_KEY, DEPLOYER_ADDR, PLAYER_KEY, PLAYER_ADDR,
#               PRIVATE_KEY (alias for DEPLOYER_KEY, used by forge scripts),
#               RPC_URL, CONTRACT, BEST_OF_BANKER, SPONSOR_JACKPOT, etc.
```

Before hackathon submission, move keys from `.env.example` to `.env` (gitignored) and strip keys from `.env.example` so they're not in the repo.

For manual forge deploys, env.sh exports `PRIVATE_KEY` so forge scripts work directly:
```bash
source prototype/scripts/env.sh
cd prototype/contracts
forge script script/DeployDealOrNotAgents.s.sol:DeployDealOrNotAgents \
  --rpc-url $RPC_URL --broadcast
```

Or use the deploy helper:
```bash
bash prototype/scripts/deploy.sh all        # Deploy + wire everything
bash prototype/scripts/deploy.sh agents     # Just DealOrNotAgents
bash prototype/scripts/deploy.sh wire       # Post-deploy authorizations
bash prototype/scripts/deploy.sh verify     # Sourcify verification
bash prototype/scripts/deploy.sh addresses  # Show all current addresses
```

## Compile and Test

```bash
cd prototype/contracts
forge build    # Should compile with warnings only
forge test     # 204 tests across 9 suites, all passing
```

The `chainlink-brownie-contracts` submodule should be at v1.3.0 (`5cb41fbc`) for CCIP support.
If CCIP contracts fail to compile:
```bash
cd lib/chainlink-brownie-contracts
git checkout 5cb41fbc   # v1.3.0 (has CCIP support)
cd ../..
```

## What to Deploy

There are 8 deploy scripts. Not all contracts need redeploying every time.

| Script | Deploys | When to Use |
|--------|---------|-------------|
| `DeployConfidential.s.sol` | DealOrNotConfidential (core game) | Rarely, already deployed |
| `DeployBestOfBanker.s.sol` | BestOfBanker (AI quote gallery) | Rarely, already deployed |
| `DeploySponsorJackpot.s.sol` | SponsorJackpot | Rarely, already deployed |
| `DeployBridge.s.sol` | DealOrNotBridge (CCIP hub, Base Sepolia) | When CCIP changes |
| `DeployGateway.s.sol` | DealOrNotGateway (CCIP spoke, ETH Sepolia) | When CCIP changes |
| `DeployAgentInfrastructure.s.sol` | AgentStaking, SeasonalLeaderboard, PredictionMarket | When agent infra changes |
| `DeployDealOrNotAgents.s.sol` | DealOrNotAgents + MockKeystoneForwarder | When agent game logic changes |
| `DeploySharedPriceFeed.s.sol` | SharedPriceFeed | First deploy or price feed changes |

## Deploy Commands

### Agent Game (DealOrNotAgents)

```bash
cd prototype/contracts

# Loads PRIVATE_KEY from .env
source .env 2>/dev/null

forge script script/DeployDealOrNotAgents.s.sol:DeployDealOrNotAgents \
  --rpc-url $RPC_URL \
  --broadcast
```

Outputs:
- MockKeystoneForwarder address
- DealOrNotAgents address

### Agent Infrastructure (Staking, Leaderboard, Markets)

Only needed if AgentStaking, SeasonalLeaderboard, or PredictionMarket code changed.

```bash
forge script script/DeployAgentInfrastructure.s.sol:DeployAgentInfrastructure \
  --rpc-url $RPC_URL \
  --broadcast
```

Uses existing AgentRegistry at `0xf3B0d29416d3504c802bab4A799349746A37E788`.

### SharedPriceFeed

```bash
# Base Sepolia (default ETH/USD feed)
forge script script/DeploySharedPriceFeed.s.sol \
  --rpc-url $RPC_URL \
  --broadcast

# ETH Sepolia (different feed address)
PRICE_FEED=0x694AA1769357215DE4FAC081bf1f309aDC325306 \
forge script script/DeploySharedPriceFeed.s.sol \
  --rpc-url $ETH_SEPOLIA_RPC \
  --broadcast
```

## Post-Deploy Wiring

After deploying new contracts, they need to be authorized to talk to each other.

### After deploying DealOrNotAgents

```bash
# 1. Add as VRF consumer at https://vrf.chain.link
#    Subscription ID: 20136374336138753384898843390506225296052091906296406953567310616148092014984

# 2. Authorize in AgentRegistry
cast send 0xf3B0d29416d3504c802bab4A799349746A37E788 \
  "authorizeContract(address)" $NEW_AGENTS_ADDR \
  --private-key $PRIVATE_KEY --rpc-url $RPC_URL

# 3. Authorize in AgentStaking (so DealOrNotAgents can add rewards)
cast send $STAKING_ADDR \
  "setAuthorizedCaller(address,bool)" $NEW_AGENTS_ADDR true \
  --private-key $PRIVATE_KEY --rpc-url $RPC_URL

# 4. Authorize in SeasonalLeaderboard
cast send $LEADERBOARD_ADDR \
  "authorizeRecorder(address)" $NEW_AGENTS_ADDR \
  --private-key $PRIVATE_KEY --rpc-url $RPC_URL
```

### After deploying AgentStaking

```bash
# Authorize DealOrNotAgents to add rewards
cast send $NEW_STAKING_ADDR \
  "setAuthorizedCaller(address,bool)" $AGENTS_ADDR true \
  --private-key $PRIVATE_KEY --rpc-url $RPC_URL
```

### After deploying SeasonalLeaderboard

```bash
# Authorize recorder + start first season
cast send $NEW_LEADERBOARD_ADDR \
  "authorizeRecorder(address)" $AGENTS_ADDR \
  --private-key $PRIVATE_KEY --rpc-url $RPC_URL

cast send $NEW_LEADERBOARD_ADDR \
  "startSeason()" \
  --private-key $PRIVATE_KEY --rpc-url $RPC_URL
```

## Update Frontend

After deploying, update the addresses in `prototype/frontend/lib/chains.ts`:

```typescript
export const CHAIN_CONTRACTS = {
  [baseSepolia.id]: {
    dealOrNot: "0xd9D4A974021055c46fD834049e36c21D7EE48137",
    // ... update any redeployed contract addresses here
    dealOrNotAgents: "NEW_ADDRESS_HERE",
    agentStaking: "NEW_ADDRESS_HERE",
  },
};
```

Then rebuild the frontend:
```bash
cd prototype/frontend
npm run build
```

## Verify on Sourcify

Sourcify verification is free (no API key needed) and works with Blockscout:

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
| DealOrNotConfidential | [`0xd9D4A974021055c46fD834049e36c21D7EE48137`](https://sepolia.basescan.org/address/0xd9D4A974021055c46fD834049e36c21D7EE48137) | Active, core game |
| BestOfBanker | [`0x05EdC924f92aBCbbB91737479948509dC7E23bF9`](https://sepolia.basescan.org/address/0x05EdC924f92aBCbbB91737479948509dC7E23bF9) | Active |
| SponsorJackpot | [`0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95`](https://sepolia.basescan.org/address/0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95) | Active |
| DealOrNotBridge | [`0xcF3B0d1575b30B53d8Db4EDe30Ebb47D51a2650a`](https://sepolia.basescan.org/address/0xcF3B0d1575b30B53d8Db4EDe30Ebb47D51a2650a) | CCIP hub |
| AgentRegistry | [`0xf3B0d29416d3504c802bab4A799349746A37E788`](https://base-sepolia.blockscout.com/address/0xf3B0d29416d3504c802bab4A799349746A37E788) | Active |
| DealOrNotAgents | [`0x12e23ff7954c62ae18959c5fd4aed6b51ebcd627`](https://base-sepolia.blockscout.com/address/0x12e23ff7954c62ae18959c5fd4aed6b51ebcd627) | Redeployed Mar 8 (price validation, staleness, swap fix) |
| MockKeystoneForwarder | [`0xf958dfa3167bea463a624dc03dcfa3b55e56043a`](https://base-sepolia.blockscout.com/address/0xf958dfa3167bea463a624dc03dcfa3b55e56043a) | For DealOrNotAgents |
| AgentStaking | [`0xd46eba96e29e83952ec0ef74eed3c7eb1a4ba6b4`](https://base-sepolia.blockscout.com/address/0xd46eba96e29e83952ec0ef74eed3c7eb1a4ba6b4) | Redeployed Mar 8 (emergency withdraw, reward loss fix) |
| SeasonalLeaderboard | [`0x13c3c750ed19c935567dcb54ee4e88ff6789001a`](https://base-sepolia.blockscout.com/address/0x13c3c750ed19c935567dcb54ee4e88ff6789001a) | Redeployed Mar 8 |
| PredictionMarket | [`0x05408be7468d01852002156a1b380e3953a502ee`](https://base-sepolia.blockscout.com/address/0x05408be7468d01852002156a1b380e3953a502ee) | Redeployed Mar 8 |
| SharedPriceFeed | [`0x91d8104e6e138607c00dd0bc132e1291a641c36d`](https://base-sepolia.blockscout.com/address/0x91d8104e6e138607c00dd0bc132e1291a641c36d) | New, deployed Mar 8 |

### ETH Sepolia

| Contract | Address |
|----------|---------|
| DealOrNotGateway | [`0xaB2995091CCE608d1F3f18f36F8e6615aB2fc124`](https://sepolia.etherscan.io/address/0xaB2995091CCE608d1F3f18f36F8e6615aB2fc124) |

### Chainlink Infrastructure (Base Sepolia)

| Service | Address |
|---------|---------|
| VRF Coordinator | `0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE` |
| ETH/USD Price Feed | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` |
| CRE Keystone Forwarder | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` |

## Quick Verification

```bash
# Check AgentRegistry has agents
cast call 0xf3B0d29416d3504c802bab4A799349746A37E788 "nextAgentId()(uint256)" --rpc-url https://sepolia.base.org

# Check DealOrNotAgents game count
cast call 0x12e23ff7954c62ae18959c5fd4aed6b51ebcd627 "nextGameId()(uint256)" --rpc-url https://sepolia.base.org

# Check core game is active
cast call 0xd9D4A974021055c46fD834049e36c21D7EE48137 "nextGameId()(uint256)" --rpc-url https://sepolia.base.org
```

## Deployment Checklist (fix/pr15-audit-fixes)

- [x] Forge build passes (204 tests, 0 failures)
- [x] CCIP submodule fixed (v1.2.0 to v1.3.0)
- [x] Deploy new DealOrNotAgents (`0x12e2...`) with price validation, staleness, swap flag fixes
- [x] Deploy new AgentStaking (`0xd46e...`) with emergency withdraw, reward loss fixes
- [x] Deploy new SeasonalLeaderboard (`0x13c3...`)
- [x] Deploy new PredictionMarket (`0x0540...`)
- [x] Deploy SharedPriceFeed (`0x91d8...`) with staleness + decimals validation
- [ ] Add DealOrNotAgents as VRF consumer at https://vrf.chain.link
- [x] Authorize DealOrNotAgents in AgentRegistry
- [x] Authorize DealOrNotAgents in AgentStaking
- [x] Authorize DealOrNotAgents in SeasonalLeaderboard
- [x] Update `prototype/frontend/lib/chains.ts` with new addresses
- [x] Frontend `npm run build` passes with new addresses
- [ ] Verify contracts on Sourcify
- [ ] Manual test: create agent game, verify price validation works
- [ ] Manual test: frontend renders agent game state correctly
- [ ] Move burner keys from `.env.example` to `.env` before submission
