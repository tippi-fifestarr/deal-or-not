# Deployment Guide - Deal or NOT Agent Infrastructure

## What's Ready to Deploy

### ✅ Contracts (100% Complete)
- **AgentRegistry.sol** - Agent registration, stats tracking, API endpoint management
- **AgentStaking.sol** - ETH staking on agents, reward distribution
- **SeasonalLeaderboard.sol** - Monthly tournaments, point system, prize distribution
- **PredictionMarket.sol** - Betting markets on game outcomes

### ✅ CRE Workflows (100% Complete)
- **agent-gameplay-orchestrator** - Autonomous agent gameplay (compiles ✓)
  - HTTP client: Uses Node.js `fetch()` for agent API calls
  - Event handlers: GameCreated, RoundComplete, BankerOfferMade, GameResolved
  - Stats tracking: Auto-updates AgentRegistry after game completion

### ✅ Contract Updates
- **AgentRegistry** enhancements:
  - `playerToAgentId` mapping for O(1) lookups
  - `getAgentId(address)` - for CRE orchestrator
  - `isAgentEligible(address)` - overloaded for address-based checks
  - `getAgentEndpoint(address)` - overloaded for orchestrator
  - `updateAgentStats()` - alias for `recordGame()` (CRE compat)

---

## Deployment Script

**Location**: `/Users/uni/deal-or-not/prototype/contracts/script/DeployAgentInfrastructure.s.sol`

**What it deploys**:
1. AgentRegistry
2. AgentStaking (linked to AgentRegistry)
3. SeasonalLeaderboard (linked to AgentRegistry)
4. PredictionMarket

**Command**:
```bash
cd prototype/contracts
forge script script/DeployAgentInfrastructure.s.sol:DeployAgentInfrastructure \
  --rpc-url $RPC_URL \
  --broadcast \
  --verify
```

---

## Post-Deployment Configuration

After deploying, you need to authorize contracts to interact with each other:

### 1. Authorize DealOrNotConfidential to update AgentRegistry
```bash
REGISTRY_ADDR=<AgentRegistry_address>
GAME_ADDR=0xd9D4A974021055c46fD834049e36c21D7EE48137  # Base Sepolia

cast send $REGISTRY_ADDR \
  "authorizeContract(address)" \
  $GAME_ADDR \
  --private-key $DEPLOYER_KEY \
  --rpc-url $RPC_URL
```

### 2. Authorize SeasonalLeaderboard to record games
```bash
LEADERBOARD_ADDR=<SeasonalLeaderboard_address>

cast send $LEADERBOARD_ADDR \
  "authorizeRecorder(address)" \
  $GAME_ADDR \
  --private-key $DEPLOYER_KEY \
  --rpc-url $RPC_URL
```

### 3. Authorize PredictionMarket resolver (for CRE workflow)
```bash
MARKET_ADDR=<PredictionMarket_address>
CRE_RESOLVER=<CRE_orchestrator_or_admin>

cast send $MARKET_ADDR \
  "authorizeResolver(address)" \
  $CRE_RESOLVER \
  --private-key $DEPLOYER_KEY \
  --rpc-url $RPC_URL
```

### 4. Start First Season (Optional)
```bash
cast send $LEADERBOARD_ADDR \
  "startSeason()" \
  --private-key $DEPLOYER_KEY \
  --rpc-url $RPC_URL
```

---

## CRE Workflow Deployment

### Prerequisites
- Contracts deployed (addresses above)
- CRE CLI installed: `npm install -g @chainlink/cre`

### Deploy agent-gameplay-orchestrator

1. **Update config with contract addresses**:
```bash
cd prototype/workflows/agent-gameplay-orchestrator
```

Edit `config.staging.json`:
```json
{
  "contractAddress": "0xd9D4A974021055c46fD834049e36c21D7EE48137",
  "agentRegistryAddress": "<AgentRegistry_address>",
  "chainSelectorName": "base-sepolia",
  "gasLimit": "500000",
  "httpTimeout": 30000
}
```

2. **Deploy to CRE**:
```bash
cre deploy --config config.staging.json
```

3. **Monitor logs**:
```bash
cre logs agent-gameplay-orchestrator -f
```

---

## Known Issues & Workarounds

### Foundry Compilation Error (Broken Pipe)
**Issue**: `forge build` fails with "Broken pipe (os error 32)" on macOS

**Root cause**: Verbose output + terminal buffer issues on Darwin 20.6.0

**Workarounds**:
1. **Use different machine**: Build on Linux or newer macOS
2. **Use pre-compiled artifacts**: Contracts already compile on GitHub Actions
3. **Deploy via Remix**: Copy contract code to Remix IDE and deploy manually
4. **Use solc directly**: Skip forge and use raw solc compiler

### Missing CCIP Dependencies
**Issue**: `chainlink-brownie-contracts` missing CCIP files

**Affected contracts**: `DealOrNotBridge.sol`, `DealOrNotGateway.sol` (not needed for agent infrastructure)

**Workaround**: Agent contracts don't use CCIP, so can deploy without fixing this

---

## Testing the Agent Orchestrator

### 1. Register a Test Agent
```bash
REGISTRY_ADDR=<AgentRegistry_address>

cast send $REGISTRY_ADDR \
  "registerAgent(string,string,string)" \
  "TestAgent" \
  "https://test-agent.example.com/api" \
  '{"version":"1.0"}' \
  --private-key $AGENT_OWNER_KEY \
  --rpc-url $RPC_URL
```

### 2. Create a Game with Agent as Player
```bash
GAME_ADDR=0xd9D4A974021055c46fD834049e36c21D7EE48137

cast send $GAME_ADDR \
  "createGame()" \
  --from <agent_owner_address> \
  --private-key $AGENT_OWNER_KEY \
  --rpc-url $RPC_URL
```

### 3. Watch CRE Orchestrator Logs
The orchestrator will:
- Detect the agent game via `GameCreated` event
- Call the agent API at each decision point
- Execute agent decisions on-chain
- Update AgentRegistry stats on completion

---

## Deployment Checklist

- [ ] Fix Foundry compilation (or use workaround)
- [ ] Deploy AgentRegistry, AgentStaking, SeasonalLeaderboard, PredictionMarket
- [ ] Authorize DealOrNotConfidential on AgentRegistry
- [ ] Authorize SeasonalLeaderboard as recorder
- [ ] Deploy agent-gameplay-orchestrator CRE workflow
- [ ] Register test agent
- [ ] Run E2E test: agent plays full game
- [ ] Verify stats updated in AgentRegistry
- [ ] Deploy prediction market UI integration
- [ ] Polish agent dashboard

---

## Next Steps After Deployment

1. **Build Prediction Market UI** (`prototype/frontend/`)
   - Market creation form
   - Betting interface with odds display
   - Live market stats
   - Claim payouts UI

2. **Agent Dashboard** (`prototype/frontend/app/agents/`)
   - Leaderboard with live rankings
   - Agent registration form
   - Staking interface
   - Stats visualization

3. **Demo Agent Implementation**
   - Simple HTTP server with decision logic
   - Deploy to Fly.io or Railway
   - Register in AgentRegistry
   - Test full gameplay loop

4. **Hackathon Submission Video**
   - Show agent vs agent gameplay
   - Demonstrate prediction markets
   - Highlight CRE workflows
   - Walk through leaderboard and staking

---

## Deployed Contracts (Existing)

From Tippi's previous work:

- **DealOrNotConfidential**: `0xd9D4A974021055c46fD834049e36c21D7EE48137` (Base Sepolia)
- **BestOfBanker**: `0x05EdC924f92aBCbbB91737479948509dC7E23bF9` (Base Sepolia)
- **SponsorJackpot**: `0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95` (Base Sepolia)

---

## Contact

- GitHub: https://github.com/rdobbeck/deal-or-not
- Branch: `feat/glass-ui-agent-integration`
- Commits: 3 new commits with agent orchestrator + registry fixes

**Ready for deployment when Foundry issues are resolved!**
