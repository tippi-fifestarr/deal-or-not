# Agent Integration Plan - Deal or No Deal

## Overview

Enable AI agents to autonomously play the Deal or No Deal game from lottery entry through final payout.

## Game Flow & Required Actions

### Phase 1: Lottery Entry
**State**: `LotteryOpen` → `LotteryReveal` → `LotteryComplete`

**Agent Actions**:
1. **Monitor** new games via `GameDeployed` events
2. **Decide** whether to enter based on:
   - Entry fee vs agent's bankroll
   - Current player count vs `minPlayers`
   - Prize pool size estimation
   - Risk tolerance profile
3. **enterLottery(bytes32 commitHash)** with ETH value = entryFee
   - Generate random secret: `bytes32 secret = keccak256(timestamp + agentId + random)`
   - Compute commit: `keccak256(abi.encodePacked(secret, agent.address))`
4. **Wait** for lottery duration to end
5. **revealSecret(bytes32 secret)** during reveal window
6. **Wait** for anyone to call `drawWinner()`

### Phase 2: Case Selection
**State**: `LotteryComplete` (if agent wins)

**Agent Actions**:
1. **selectCase(uint256 caseIndex)** - choose initial briefcase (0-25)
   - Strategy: Random selection (no information available)
   - Advanced: Track historical case distributions (if patterns exist)

### Phase 3: Gameplay Loop (10 rounds)
**State**: `RoundPlay` → `BankerOffer` → repeat

**Round Structure**:
| Round | Cases to Open | Cases Remaining | Offer Timing |
|-------|---------------|-----------------|--------------|
| 0     | 6             | 20              | After 6      |
| 1     | 5             | 15              | After 11     |
| 2     | 4             | 11              | After 15     |
| 3     | 3             | 8               | After 18     |
| 4     | 2             | 6               | After 20     |
| 5     | 1             | 5               | After 21     |
| 6     | 1             | 4               | After 22     |
| 7     | 1             | 3               | After 23     |
| 8     | 1             | 2               | After 24     |
| 9     | Final reveal  | 1               | No offer     |

**Agent Actions per Round**:
1. **Monitor** remaining case values via contract state
2. **openCase(caseIndex, value, pA, pB, pC)** N times
   - Requires ZK proof from host/API
   - Strategy: Random unopened case selection, or avoid extremes
3. **Wait** for banker offer (contract auto-transitions to `BankerOffer`)
4. **Decide** Deal or No Deal:
   - Calculate EV: `sum(remainingValues) / count(remainingValues)`
   - Compare banker offer vs EV
   - Apply risk tolerance: `risk < 0.5 → conservative, risk > 0.8 → aggressive`
   - Decision function: `acceptDeal()` or `rejectDeal()`
5. **Repeat** until Round 9 or agent accepts deal

### Phase 4: Final Resolution
**State**: `GameOver`

**Agent Actions**:
1. If Round 9 reached: **revealFinalCase(value, pA, pB, pC)** (requires ZK proof)
2. Receive payout automatically
3. Log outcome for learning

---

## Architecture Options

### Option A: REST API + WebSocket Events (Recommended)

**Components**:
- **API Server** (`packages/agent-api/`)
  - Express.js REST endpoints
  - WebSocket server for real-time events
  - ZK proof generation service
  - Agent wallet management

- **Agent SDK** (`packages/agent-sdk/`)
  - TypeScript library for agents
  - High-level game interface
  - Strategy plugins
  - Event handlers

**Endpoints**:
```typescript
// Game Discovery
GET  /games                    // List all games
GET  /games/:id                // Game details
GET  /games/active             // Currently joinable
GET  /games/playing            // Games in progress

// Actions
POST /games/:id/enter          // Enter lottery
POST /games/:id/reveal         // Reveal secret
POST /games/:id/select-case    // Select initial case
POST /games/:id/open-case      // Open case (gets ZK proof)
POST /games/:id/accept-deal    // Accept banker offer
POST /games/:id/reject-deal    // Reject banker offer
POST /games/:id/reveal-final   // Reveal final case

// ZK Proofs
GET  /games/:id/proof/:caseIndex  // Get ZK proof for case

// Agent Management
POST /agent/wallet/create      // Generate new wallet
GET  /agent/wallet/balance     // Check ETH balance
GET  /agent/games              // My active games
GET  /agent/stats              // Win/loss history

// WebSocket Events
WS   /events                   // Subscribe to game events
  - game.created
  - lottery.opened
  - lottery.closed
  - winner.selected
  - case.opened
  - offer.made
  - game.resolved
```

**WebSocket Event Format**:
```typescript
interface GameEvent {
  type: 'game.created' | 'lottery.closed' | 'offer.made' | ...;
  gameId: string;
  timestamp: number;
  data: {
    // Event-specific data
    offer?: bigint;
    expectedValue?: bigint;
    remainingValues?: bigint[];
  };
}
```

### Option B: OpenClaw Integration

**Components**:
- **OpenClaw Agent** with custom skill
- **MCP Server** for Deal or No Deal protocol
- **Gateway hooks** for event monitoring

**OpenClaw Skill** (`packages/openclaw-skill/deal-or-no-deal.js`):
```javascript
module.exports = {
  name: 'deal-or-no-deal',
  description: 'Play Deal or No Deal onchain game',

  actions: {
    monitorGames: async () => { /* ... */ },
    enterLottery: async (gameId, entryFee) => { /* ... */ },
    playGame: async (gameId, strategy) => { /* ... */ }
  },

  strategies: {
    conservative: { riskTolerance: 0.3 },
    balanced: { riskTolerance: 0.5 },
    aggressive: { riskTolerance: 0.8 }
  }
};
```

**MCP Tools**:
- `deal_or_no_deal__list_games`
- `deal_or_no_deal__enter_lottery`
- `deal_or_no_deal__make_decision`
- `deal_or_no_deal__check_status`

### Option C: Standalone Agent CLI

**Components**:
- **CLI tool** (`packages/agent-cli/`)
- **Config file** for strategy/wallet
- **Cron job** for continuous monitoring

**Usage**:
```bash
# Setup
deal-agent init --wallet <private-key> --rpc <url>
deal-agent configure --strategy balanced --max-entry 0.1

# Run
deal-agent watch --auto-enter --auto-play
deal-agent play --game <gameId> --strategy aggressive
deal-agent status
```

---

## Decision-Making Strategies

**UPDATE (Variance System Enabled)**: The banker now uses **contextual variance** to create strategic depth!

**With Variance System:**
- Base offers reduced 3-5% (compensates for variance)
- Random variance: ±5-12% based on round
- Context adjustment: ±3% based on EV change
- **Maximum possible: 98% of EV** (Round 8 + max positive variance)
- **Minimum possible: 20% of EV** (floor)

Banker discount schedule:
- Round 0: 30% EV | Round 1: 40% | Round 2: 50% | Round 3: 60% | Round 4: 70%
- Round 5: 80% | Round 6: 85% | Round 7: 90% | Round 8: 95% | Round 9: Final reveal (no offer)

### 1. Threshold Strategy (Corrected)
```typescript
function shouldAcceptDeal(
  bankerOffer: bigint,
  remainingValues: bigint[],
  round: number
): boolean {
  const ev = calculateEV(remainingValues);
  const ratio = Number(bankerOffer) / Number(ev);

  // Accept if offer meets minimum threshold (always < 100%)
  const minThreshold = 0.85; // 85% of EV or better
  return ratio >= minThreshold;
}
```

### 2. Variance-Adjusted Strategy
```typescript
function shouldAcceptDeal(
  bankerOffer: bigint,
  remainingValues: bigint[],
  round: number
): boolean {
  const ev = calculateEV(remainingValues);
  const variance = calculateVariance(remainingValues, ev);
  const stdDev = Math.sqrt(variance);

  // Coefficient of Variation: measures relative risk
  const cv = stdDev / ev;

  // High variance (cv > 0.8) → accept lower offers
  // Low variance (cv < 0.3) → demand higher offers
  const baseThreshold = 0.85;
  const varianceAdjustment = Math.min(cv * 0.2, 0.25); // Max -25%
  const threshold = baseThreshold - varianceAdjustment;

  const ratio = Number(bankerOffer) / Number(ev);
  return ratio >= threshold;
}
```

### 3. Bankroll Protection Strategy
```typescript
function shouldAcceptDeal(
  bankerOffer: bigint,
  remainingValues: bigint[],
  entryFee: bigint,
  bankroll: bigint
): boolean {
  const ev = calculateEV(remainingValues);
  const ratio = Number(bankerOffer) / Number(ev);

  // Lock in 5x profit immediately
  if (bankerOffer >= entryFee * 5n) return true;

  // If offer is >50% of bankroll, protect capital
  if (Number(bankerOffer) > Number(bankroll) * 0.5) {
    return ratio >= 0.75; // Accept 75%+ of EV
  }

  // Otherwise, demand 90%+ of EV
  return ratio >= 0.9;
}
```

### 4. Adverse Selection Strategy
```typescript
function shouldAcceptDeal(
  bankerOffer: bigint,
  remainingValues: bigint[],
  initialEV: bigint,
  round: number
): boolean {
  const currentEV = calculateEV(remainingValues);
  const evDecline = 1 - Number(currentEV) / Number(initialEV);
  const ratio = Number(bankerOffer) / Number(currentEV);

  // If EV has dropped >60%, you've opened high-value cases → take the deal
  if (evDecline > 0.6 && ratio >= 0.7) return true;

  // If EV is rising (opened low-value cases), be greedy
  if (evDecline < -0.2) return ratio >= 0.95;

  // Normal case: 85% threshold
  return ratio >= 0.85;
}
```

### 5. Always Reject Strategy (Optimal EV Maximization)
```typescript
function shouldAcceptDeal(): boolean {
  // NEVER accept a deal - banker is always low-balling
  // Expected final payout = 100% of your selected case value
  // Expected offer payout = 30-95% of EV (always worse)
  return false;
}

// Note: This maximizes EV but ignores:
// - Time value of money
// - Risk of very low case ($0.01)
// - Opportunity cost of capital
// - Psychological factors (certainty vs gambling)
```

### 6. Variance-Exploiting Strategy (NEW - Recommended with Variance System)
```typescript
interface OfferHistory {
  round: number;
  offer: bigint;
  ev: bigint;
  ratio: number;
}

function shouldAcceptDeal(
  bankerOffer: bigint,
  remainingValues: bigint[],
  round: number,
  offerHistory: OfferHistory[]
): boolean {
  const ev = calculateEV(remainingValues);
  const ratio = Number(bankerOffer) / Number(ev);

  // Calculate expected offer range for this round (from contract)
  const { minOffer, avgOffer, maxOffer } = getOfferRange(remainingValues, round, initialEV);

  // Percentile calculation: where does this offer rank?
  const range = Number(maxOffer - minOffer);
  const position = Number(bankerOffer - minOffer);
  const percentile = range > 0 ? position / range : 0.5;

  // Accept if offer is in top 30% of possible offers for this round
  if (percentile >= 0.7) return true;

  // Or accept if it's above the historical average for this round
  const avgRatioForRound = calculateHistoricalAverage(offerHistory, round);
  if (ratio > avgRatioForRound * 1.1) return true; // 10% better than historical

  // Context exploitation: if EV dropped and banker is generous, take it
  const evChange = (Number(ev) - Number(initialEV)) / Number(initialEV);
  if (evChange < -0.25 && ratio >= 0.70) return true;

  // Otherwise, standard threshold
  return ratio >= 0.85;
}
```

### 7. Hybrid Pragmatic Strategy (Recommended)
```typescript
function shouldAcceptDeal(
  bankerOffer: bigint,
  remainingValues: bigint[],
  round: number,
  entryFee: bigint
): boolean {
  const ev = calculateEV(remainingValues);
  const ratio = Number(bankerOffer) / Number(ev);
  const variance = calculateVariance(remainingValues, ev);
  const cv = Math.sqrt(variance) / Number(ev);

  // Early exits for exceptional cases
  if (bankerOffer >= entryFee * 10n) return true; // 10x profit
  if (round >= 7 && ratio >= 0.9) return true;    // Late game, good offer

  // Variance-based decision
  if (cv > 1.0) {
    // High risk: accept 70%+ of EV
    return ratio >= 0.7;
  } else if (cv < 0.3) {
    // Low risk: demand 95%+ of EV (essentially never accept)
    return ratio >= 0.95;
  } else {
    // Medium risk: 85% threshold
    return ratio >= 0.85;
  }
}
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Create `packages/agent-api/` directory
- [ ] Setup Express.js + WebSocket server
- [ ] Implement wallet management (ethers.js Wallet)
- [ ] Add contract event listeners
- [ ] Create `/games` and `/games/:id` endpoints
- [ ] Setup ZK proof caching/fetching

### Phase 2: Agent SDK (Week 1-2)
- [ ] Create `packages/agent-sdk/` directory
- [ ] Implement `GameClient` class
- [ ] Add event subscription methods
- [ ] Create `Strategy` interface
- [ ] Implement EV calculator
- [ ] Add decision functions
- [ ] Write SDK documentation

### Phase 3: Strategies & Testing (Week 2)
- [ ] Implement 5 decision strategies
- [ ] Create test suite for strategies
- [ ] Add simulation mode (no real ETH)
- [ ] Backtest strategies on historical data
- [ ] Performance metrics tracking

### Phase 4: Agent Runners (Week 3)
- [ ] Create standalone CLI agent
- [ ] (Optional) Create OpenClaw integration
- [ ] Add multi-agent coordination
- [ ] Implement bankroll management
- [ ] Add logging and metrics

### Phase 5: Production (Week 4)
- [ ] Deploy API server (Railway/Vercel)
- [ ] Setup monitoring (Grafana/Datadog)
- [ ] Create agent dashboard
- [ ] Security audit
- [ ] Load testing
- [ ] Documentation

---

## Example: Agent SDK Usage

```typescript
import { GameClient, Strategy } from '@deal-or-no-deal/agent-sdk';
import { Wallet } from 'ethers';

// Initialize agent
const wallet = new Wallet(process.env.AGENT_PRIVATE_KEY);
const client = new GameClient({
  rpcUrl: 'http://localhost:8545',
  apiUrl: 'http://localhost:3001',
  wallet
});

// Setup strategy
const strategy: Strategy = {
  name: 'balanced',
  riskTolerance: 0.5,

  shouldEnterLottery: (game) => {
    const maxEntry = parseEther('0.1');
    return game.entryFee <= maxEntry && game.totalEntries < 10;
  },

  selectInitialCase: () => {
    return Math.floor(Math.random() * 26); // Random
  },

  selectCaseToOpen: (unopenedCases) => {
    return unopenedCases[Math.floor(Math.random() * unopenedCases.length)];
  },

  shouldAcceptOffer: (offer, remainingValues, round) => {
    const ev = Strategy.calculateEV(remainingValues);
    const variance = Strategy.calculateVariance(remainingValues, ev);
    const cv = Math.sqrt(variance) / ev;

    // Variance-adjusted threshold
    if (cv > 1.0) return offer >= ev * 0.7;  // High variance: accept 70%
    if (cv < 0.3) return offer >= ev * 0.95; // Low variance: demand 95%
    return offer >= ev * 0.85; // Medium: 85%
  }
};

// Run agent
await client.startMonitoring();

client.on('game.created', async (game) => {
  if (strategy.shouldEnterLottery(game)) {
    await client.enterLottery(game.id);
  }
});

client.on('winner.selected', async ({ gameId, winner }) => {
  if (winner === wallet.address) {
    await client.playGame(gameId, strategy);
  }
});
```

---

## OpenClaw Integration Example

```bash
# Setup OpenClaw agent
openclaw agents create dond-player
openclaw agents configure dond-player --model claude-opus-4

# Install Deal or No Deal skill
cd ~/.openclaw/agents/dond-player/skills
git clone https://github.com/deal-or-no-deal/openclaw-skill.git

# Configure strategy
cat > ~/.openclaw/agents/dond-player/config.json <<EOF
{
  "dealOrNoDeal": {
    "wallet": "$AGENT_PRIVATE_KEY",
    "rpcUrl": "https://mainnet.base.org",
    "strategy": "balanced",
    "maxEntryFee": "0.1",
    "autoPlay": true
  }
}
EOF

# Run agent
openclaw agent run dond-player --skill deal-or-no-deal
```

**Agent Prompt**:
```
You are an autonomous Deal or No Deal player. Your goals:
1. Monitor new games and enter profitable lotteries
2. Make rational decisions based on expected value
3. Manage your bankroll conservatively
4. Learn from each game to improve strategy

Current bankroll: 1.5 ETH
Strategy: Balanced (risk tolerance 0.5)
Games played: 23 | Win rate: 43% | Avg profit: +0.12 ETH

Available actions:
- /dond games list
- /dond enter <gameId>
- /dond play <gameId>
- /dond stats
```

---

## Security Considerations

### Wallet Management
- **Private keys** stored encrypted at rest
- **Separate wallets** per agent (no shared keys)
- **Rate limiting** to prevent API abuse
- **Nonce tracking** to prevent tx conflicts

### ZK Proof Handling
- **Verify proofs** before submission (client-side validation)
- **Cache proofs** to reduce API calls
- **Timeout handling** if proof service is down
- **Fallback strategies** (skip game if no proofs available)

### Transaction Safety
- **Gas price limits** to prevent overpaying
- **Simulation** before sending (eth_call)
- **Deadline enforcement** via block timestamps
- **Revert handling** with retries

---

## Monitoring & Metrics

### Agent Performance Metrics
- **Win rate**: Games won / Games played
- **Profit/Loss**: Total ETH gained/lost
- **Average deal round**: When agent typically accepts offers
- **EV accuracy**: How close outcomes are to predicted EV
- **Bankroll drawdown**: Maximum loss from peak

### System Metrics
- **API latency**: Response time for endpoints
- **WebSocket uptime**: Event delivery success rate
- **ZK proof cache hit rate**: % of proofs served from cache
- **Transaction success rate**: % of txs that don't revert
- **Gas efficiency**: Average gas used per game

---

## Next Steps

**Recommended Approach**: Start with Option A (REST API + SDK)

1. ✅ Create `AGENT_INTEGRATION_PLAN.md` (this file)
2. ⏭️ Setup `packages/agent-api/` with basic Express server
3. ⏭️ Implement game monitoring and event subscriptions
4. ⏭️ Create `packages/agent-sdk/` with TypeScript client
5. ⏭️ Implement one simple strategy (EV-based)
6. ⏭️ Test with local Anvil deployment
7. ⏭️ Add more sophisticated strategies
8. ⏭️ (Optional) Build OpenClaw integration

**Timeline**: 3-4 weeks for full implementation
**Team**: 1-2 developers
**Dependencies**: ZK integration must be complete for production use
