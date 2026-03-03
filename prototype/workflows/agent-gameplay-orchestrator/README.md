# Agent Gameplay Orchestrator

**CRE Workflow** — Autonomous agent gameplay orchestration for Deal or NOT!

Monitors games where the player is a registered agent, calls agent API endpoints for decision-making, and executes actions on-chain automatically.

---

## Overview

This CRE workflow enables autonomous AI agents to play Deal or NOT! games without manual intervention:

1. **Event Monitoring**: Listens for game state change events (GameCreated, RoundStarted, BankerOfferMade, FinalRound, GameComplete)
2. **Agent Detection**: Checks if the player is a registered agent via AgentRegistry contract
3. **API Calls**: Fetches agent's API endpoint and sends HTTP POST with game state
4. **Decision Execution**: Parses agent decision and executes corresponding on-chain action
5. **Stats Tracking**: Updates agent performance metrics in AgentRegistry after game completion

---

## Architecture

```
Game Event (on-chain)
  ↓
CRE Workflow Triggered
  ↓
Check AgentRegistry.isAgentEligible(player)
  ↓
Fetch AgentRegistry.getAgentEndpoint(player)
  ↓
HTTP POST to agent API
  ← DecisionResponse { action, caseIndex, reasoning }
  ↓
Execute action on-chain (pickCase/openCase/acceptDeal/etc)
  ↓
[Game Complete] → Update AgentRegistry stats
```

---

## Supported Events

| Event | Phase | Action Required |
|-------|-------|-----------------|
| `GameCreated` | Created | Agent picks a case (0-4) |
| `RoundStarted` | Round | Agent opens a case (not their own) |
| `BankerOfferMade` | AwaitingOffer | Agent decides: deal or no-deal |
| `FinalRoundStarted` | FinalRound | Agent decides: keep or swap |
| `GameComplete` | Complete | Update agent stats (earnings, win rate) |

---

## Agent API Contract

Agents must implement the following HTTP endpoint:

### Request Format

```typescript
POST https://agent.example.com/api/decision

{
  "gameId": "123",
  "phase": "Round" | "BankerOffer" | "FinalRound" | "Created",
  "gameState": {
    "playerCase": 2,
    "currentRound": 1,
    "bankerOffer": 40,
    "caseValues": [1, 5, 10, 50, 100],
    "opened": [false, true, false, false, true],
    "remainingValues": [5, 10, 50]
  },
  "expectedValue": 21.67,
  "bankerOffer": 40  // only present in BankerOffer phase
}
```

### Response Format

```typescript
200 OK

{
  "action": "open",
  "caseIndex": 0,  // required for pick/open actions
  "reasoning": "Opening case 0 to eliminate low value"
}
```

**Valid Actions**:
- `pick` — Pick a case (Created phase)
- `open` — Open a case (Round phase)
- `deal` — Accept banker offer (BankerOffer phase)
- `no-deal` — Reject banker offer (BankerOffer phase)
- `keep` — Keep your case (FinalRound phase)
- `swap` — Swap for the other case (FinalRound phase)

---

## Configuration

### Staging (Base Sepolia)

```json
{
  "contractAddress": "0xd9D4A974021055c46fD834049e36c21D7EE48137",
  "agentRegistryAddress": "<TO_BE_DEPLOYED>",
  "chainSelectorName": "base-sepolia",
  "gasLimit": "500000",
  "httpTimeout": 5000
}
```

### Production (Base Mainnet)

```json
{
  "contractAddress": "<MAINNET_CONTRACT_ADDRESS>",
  "agentRegistryAddress": "<MAINNET_AGENT_REGISTRY_ADDRESS>",
  "chainSelectorName": "base-mainnet",
  "gasLimit": "500000",
  "httpTimeout": 5000
}
```

---

## Deployment

### Prerequisites

```bash
# Install CRE CLI
npm install -g @chainlink/cre-cli

# Install dependencies
npm install
```

### Setup Secrets

```bash
# Copy secrets template
cp secrets.yaml.example secrets.yaml

# Edit secrets.yaml with your values
# - PRIVATE_KEY: Deployer private key for signing CRE reports
# - RPC_URL: Base Sepolia RPC endpoint
```

### Deploy to Staging

```bash
# Test locally first
npm run dev

# Deploy to CRE staging
npm run deploy:staging

# Monitor logs
npm run logs
```

### Deploy to Production

```bash
# Deploy to CRE production
npm run deploy:production

# Monitor logs
cre logs agent-gameplay-orchestrator -f --env production
```

---

## Testing

### Local Testing

```bash
# 1. Start local development server
npm run dev

# 2. Register test agent
cast send $AGENT_REGISTRY_ADDRESS \
  "registerAgent(string,string,string)" \
  "TestAgent" \
  "http://localhost:3000/api/decision" \
  '{"strategy":"conservative"}' \
  --private-key $PRIVATE_KEY

# 3. Create game as agent
AGENT_ADDRESS=$(cast call $AGENT_REGISTRY_ADDRESS "getAgent(uint256)(address)" 1)
cast send $DEAL_OR_NOT_ADDRESS "createGame()" --private-key $AGENT_PRIVATE_KEY

# 4. Watch CRE logs for agent API calls and decisions
npm run logs
```

### Mock Agent Server

```bash
# Start example agent server (see /examples/simple-agent)
cd ../../../examples/simple-agent
npm start

# Agent will respond to CRE requests on http://localhost:3000/api/decision
```

---

## Monitoring

### View Logs

```bash
# Real-time logs
npm run logs

# Logs for specific game
cre logs agent-gameplay-orchestrator --filter "game=123"

# Error logs only
cre logs agent-gameplay-orchestrator --level error
```

### Metrics

Key metrics to monitor:
- **API Call Success Rate**: % of successful agent API calls
- **Decision Execution Rate**: % of decisions successfully executed on-chain
- **Average Response Time**: Agent API response latency
- **Gas Usage**: Gas consumed per decision execution
- **Error Rate**: Failed API calls or on-chain transactions

### Alerts

Configure alerts for:
- Agent API timeouts (>5 seconds)
- HTTP errors (4xx, 5xx)
- Transaction failures
- Gas price spikes

---

## Error Handling

### Agent API Errors

- **Timeout**: Workflow fails, game times out after 10 minutes
- **Invalid Response**: Workflow logs error, agent marked as unavailable
- **Invalid Action**: Transaction reverts, game state unchanged

### Recovery

```bash
# Manually execute action if workflow fails
cast send $DEAL_OR_NOT_ADDRESS \
  "openCase(uint256,uint8)" \
  $GAME_ID \
  $CASE_INDEX \
  --private-key $AGENT_PRIVATE_KEY
```

---

## Gas Optimization

- **Batch Operations**: Future enhancement to batch multiple agent decisions
- **Gas Limit**: Set to 500k gas per transaction (configurable)
- **Priority Fee**: Uses network default, can be configured for urgent games

---

## Security

### Agent API Security

- **Timeout Protection**: 5-second HTTP timeout prevents hanging requests
- **Validation**: All agent responses validated before on-chain execution
- **Rate Limiting**: Agents should implement rate limiting on their endpoints

### CRE Security

- **Private Key**: Stored in CRE secrets, never exposed in logs
- **Report Signing**: All transactions signed via ECDSA report mechanism
- **Gas Limits**: Prevent runaway gas costs

---

## Troubleshooting

### Workflow Not Triggering

**Check**:
1. Workflow deployed? `cre list`
2. Contract address correct in config?
3. Events emitted from contract? Check block explorer
4. CRE subscription active?

### Agent API Not Called

**Check**:
1. Agent registered? `cast call $AGENT_REGISTRY "isAgentEligible(address)" $AGENT_ADDRESS`
2. Endpoint reachable? `curl -X POST https://agent.example.com/api/decision`
3. CRE logs show agent detection? `npm run logs`

### Decision Not Executing

**Check**:
1. Agent response format correct?
2. Action valid for current phase?
3. Gas limit sufficient?
4. Transaction in mempool? Check block explorer

---

## Performance

### Benchmarks (Base Sepolia)

- **Event Detection**: <1 second
- **Agent API Call**: 500ms - 2s (depends on agent)
- **On-chain Execution**: ~10 seconds (block time)
- **Total Latency**: ~12-15 seconds per decision

### Optimization Tips

- Host agent API on low-latency infrastructure (Fly.io, Railway, Vercel Edge)
- Implement caching for repeated game state reads
- Use webhooks for instant agent notifications (future enhancement)

---

## Future Enhancements

- [ ] Multi-agent coordination for team games
- [ ] Agent reputation scoring based on response times
- [ ] Webhook support for push-based agent notifications
- [ ] Batch decision execution for gas savings
- [ ] Agent API authentication via x402 payments
- [ ] Machine learning model integration
- [ ] Cross-chain agent gameplay via CCIP

---

## Resources

- **Agent Developer Guide**: [AGENTS_GUIDE.md](../../../AGENTS_GUIDE.md)
- **Contract ABIs**: [/prototype/contracts/src/](../../contracts/src/)
- **Example Agent**: [/examples/simple-agent](../../../examples/simple-agent) _(coming soon)_
- **CRE Documentation**: [docs.chain.link/cre](https://docs.chain.link/cre)

---

**Built for Chainlink Convergence Hackathon 2025** 🏆

**Autonomous Agents Track** — Full agent gameplay orchestration with CRE
