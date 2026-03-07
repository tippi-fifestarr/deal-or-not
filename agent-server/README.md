# Demo Agent Server for Deal or Not

HTTP API server implementing 3 decision-making strategies for autonomous Deal or Not gameplay.

## Strategies

### 1. Random (`STRATEGY=random`)
Makes completely random valid decisions:
- Picks random case
- Opens random unopened cases
- 50/50 on banker offers
- 50/50 on keep/swap

### 2. EV Maximizer (`STRATEGY=ev-maximizer`) **[Default]**
Mathematically optimal decisions:
- Accepts banker offers **only if** offer > expected value
- Rejects all offers below EV
- Makes rational choices based on game theory

### 3. Risk-Averse (`STRATEGY=risk-averse`)
Conservative decision-making:
- Accepts banker offers at **90% of expected value** (locks in gains early)
- Always keeps case in final round (no unnecessary risk)
- Prefers certainty over variance

## API Contract

### POST `/api/decision`

**Request:**
```json
{
  "gameId": "123",
  "phase": "BankerOffer",
  "gameState": {
    "playerCase": 2,
    "currentRound": 3,
    "bankerOffer": 45,
    "caseValues": [1, 5, 10, 50, 100],
    "opened": [false, true, false, true, false],
    "remainingValues": [1, 10, 100]
  },
  "expectedValue": 37.0,
  "bankerOffer": 45
}
```

**Response:**
```json
{
  "action": "deal",
  "reasoning": "Accepting 45c (EV: 37.00c, gain: 8.00c)"
}
```

**Valid actions:** `pick`, `open`, `deal`, `no-deal`, `keep`, `swap`

### GET `/health`
Returns server status and active strategy.

## Local Development

```bash
# Install dependencies
bun install

# Run default strategy (ev-maximizer)
bun run index.ts

# Run specific strategy
STRATEGY=random bun run index.ts
STRATEGY=risk-averse bun run index.ts

# Test endpoint
curl http://localhost:3001/health

# Test decision (mock request)
curl -X POST http://localhost:3001/api/decision \
  -H "Content-Type: application/json" \
  -d '{
    "gameId": "test-123",
    "phase": "BankerOffer",
    "gameState": {
      "playerCase": 2,
      "currentRound": 1,
      "bankerOffer": 50,
      "caseValues": [1, 5, 10, 50, 100],
      "opened": [false, false, false, false, false],
      "remainingValues": [1, 5, 10, 50, 100]
    },
    "expectedValue": 33.2,
    "bankerOffer": 50
  }'
```

## Deployment

### Railway

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Add environment variables
railway variables set STRATEGY=ev-maximizer

# Deploy
railway up

# Get public URL
railway domain
```

### Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Create Fly app
fly launch --name deal-agent-ev

# Set environment variables
fly secrets set STRATEGY=ev-maximizer

# Deploy
fly deploy
```

## Environment Variables

| Variable | Default | Options |
|----------|---------|---------|
| `PORT` | `3001` | Any valid port |
| `STRATEGY` | `ev-maximizer` | `random`, `ev-maximizer`, `risk-averse` |

## Integration with CRE Orchestrator

Register this agent in the `AgentRegistry` contract:

```solidity
// Register agent with public endpoint
agentRegistry.registerAgent(
  "EV Maximizer Bot",
  "https://deal-agent-ev.up.railway.app/api/decision"
);
```

The CRE workflow will:
1. Detect game events (GameCreated, RoundStarted, BankerOfferMade)
2. Check if player is registered agent
3. Call this HTTP endpoint with game state
4. Parse response and execute action onchain via KeystoneForwarder

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ CRE Workflow (agent-gameplay-orchestrator)              │
│ ┌────────────┐         ┌──────────────┐                │
│ │ Event      │────────▶│ HTTP Request │                │
│ │ Detection  │         │ to Agent API │                │
│ └────────────┘         └──────┬───────┘                │
│                               │                         │
└───────────────────────────────┼─────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Demo Agent Server    │
                    │  (This Repository)    │
                    │                       │
                    │  ┌─────────────────┐  │
                    │  │ Strategy Logic  │  │
                    │  │ • Random        │  │
                    │  │ • EV Maximizer  │  │
                    │  │ • Risk-Averse   │  │
                    │  └─────────────────┘  │
                    │                       │
                    │  POST /api/decision   │
                    └───────────┬───────────┘
                                │
                                ▼
                ┌────────────────────────────────┐
                │ DecisionResponse               │
                │ {                              │
                │   action: "deal",              │
                │   reasoning: "..."             │
                │ }                              │
                └────────────────────────────────┘
```

## Testing Strategy Differences

Run 3 instances with different strategies to compare performance:

```bash
# Terminal 1
STRATEGY=random PORT=3001 bun run index.ts

# Terminal 2
STRATEGY=ev-maximizer PORT=3002 bun run index.ts

# Terminal 3
STRATEGY=risk-averse PORT=3003 bun run index.ts
```

Register all 3 in AgentRegistry and track stats via the subgraph to see which strategy wins more often.
