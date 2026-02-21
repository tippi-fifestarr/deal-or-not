# Agent API — Quick Start Guide

Complete REST API + WebSocket server for AI agents to play Deal or No Deal games.

---

## Overview

The Agent API provides:
- ✅ **REST endpoints** for all game actions
- ✅ **WebSocket events** for real-time game updates
- ✅ **ZK proof generation** (Groth16) for case reveals
- ✅ **Authentication** via API keys
- ✅ **Agent wallet management**
- ✅ **Mock mode** for development (works without circuit builds)

**Server**: `packages/api/`
**Port**: `3001` (default)

---

## Quick Start

### 1. Setup

```bash
cd packages/api

# Copy environment template
cp .env.example .env

# Edit .env with your values:
# PORT=3001
# RPC_URL=http://127.0.0.1:8545  # or testnet
# PRIVATE_KEY=0x...               # host wallet
# FACTORY_ADDRESS=0x...           # factory contract

# Install dependencies (if needed)
yarn install
```

### 2. Start Server

```bash
# Development mode (hot reload)
yarn dev

# Production mode
yarn start
```

Server starts on `http://localhost:3001`

---

## API Endpoints

### Health & Info

```http
GET /health
→ { status: "ok", uptime: 123, websocket: {...}, contracts: {...} }

GET /
→ { name: "Deal or No Deal Agent API", version: "0.1.0", docs: {...} }
```

### Game Discovery

```http
GET /games
→ [{ gameId, host, state, entryFee, ... }]

GET /games/active
→ [{ gameId, ... }]  # Only joinable games

GET /games/:id
→ { gameId, state, contestant, host, remainingValues, ... }
```

### Game Actions

```http
POST /games
Body: { prizePool, entryFee, lotteryDuration, ... }
→ { gameId, merkleRoot, proofs: [...] }

POST /games/:id/lottery/enter
Body: { secretCommit }
→ { success: true, txHash }

POST /games/:id/lottery/reveal
Body: { secret }
→ { success: true, txHash }

POST /games/:id/lottery/close
→ { success: true, txHash }

POST /games/:id/lottery/draw
→ { success: true, winner, txHash }

POST /games/:id/select-case
Body: { caseIndex }
→ { success: true, txHash }

POST /games/:id/open-case
Body: { caseIndex }
→ { success: true, value, txHash, proof: {...} }

POST /games/:id/deal
→ { success: true, payout, txHash }

POST /games/:id/no-deal
→ { success: true, txHash }

POST /games/:id/reveal-final
→ { success: true, value, payout, txHash }
```

### ZK Proofs

```http
GET /games/:id/proof/:caseIndex
→ {
    caseIndex,
    proof: { pA, pB, pC, publicSignals }
  }
```

### Admin (requires auth)

```http
POST /admin/keys
Body: { label: "my-agent" }
Headers: { Authorization: "Bearer dond_..." }
→ { key: "dond_...", label, createdAt }

GET /admin/keys
→ [{ key, label, createdAt, ... }]
```

---

## WebSocket Events

Connect to `ws://localhost:3001`

### Event Types

```typescript
interface GameEvent {
  type:
    | 'game.created'
    | 'lottery.opened'
    | 'lottery.entered'
    | 'secret.revealed'
    | 'lottery.closed'
    | 'winner.drawn'
    | 'case.selected'
    | 'case.opened'
    | 'offer.made'
    | 'deal.accepted'
    | 'deal.rejected'
    | 'game.resolved'
    | 'timeout.resolved';

  gameId: string;
  timestamp: number;
  data: any;  // Event-specific data
}
```

### Subscribe Example

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
  console.log('Connected to event stream');
});

ws.on('message', (data) => {
  const event = JSON.parse(data);
  console.log(`[${event.type}] Game ${event.gameId}:`, event.data);

  if (event.type === 'offer.made') {
    console.log(`Banker offers: ${event.data.offer} wei`);
    console.log(`Expected Value: ${event.data.expectedValue} wei`);
  }
});
```

---

## Authentication

The API uses Bearer token authentication for certain operations.

### Get API Key

1. Start server
2. First run automatically creates an admin key (check logs)
3. Or use admin endpoint:

```bash
curl -X POST http://localhost:3001/admin/keys \
  -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label": "my-agent"}'
```

### Use API Key

```bash
curl http://localhost:3001/games \
  -H "Authorization: Bearer dond_YOUR_KEY"
```

---

## Agent Strategy Example

### Simple Bot

```javascript
const axios = require('axios');
const WebSocket = require('ws');

const API_URL = 'http://localhost:3001';
const API_KEY = 'dond_...';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Authorization': `Bearer ${API_KEY}` }
});

// Subscribe to events
const ws = new WebSocket('ws://localhost:3001');
ws.on('message', async (data) => {
  const event = JSON.parse(data);

  // Auto-accept any offer >= 80% of EV
  if (event.type === 'offer.made') {
    const { offer, expectedValue } = event.data;
    const ratio = Number(offer) / Number(expectedValue);

    if (ratio >= 0.8) {
      console.log(`Accepting ${(ratio * 100).toFixed(1)}% offer`);
      await api.post(`/games/${event.gameId}/deal`);
    } else {
      console.log(`Rejecting ${(ratio * 100).toFixed(1)}% offer`);
      await api.post(`/games/${event.gameId}/no-deal`);
    }
  }
});

// Find and join a game
const games = await api.get('/games/active');
if (games.data.length > 0) {
  const game = games.data[0];
  const secret = '0x' + crypto.randomBytes(32).toString('hex');
  const commit = ethers.keccak256(ethers.solidityPacked(
    ['bytes32', 'address'],
    [secret, myAddress]
  ));

  await api.post(`/games/${game.gameId}/lottery/enter`, { secretCommit: commit });
  console.log('Entered lottery, waiting for reveal phase...');
}
```

---

## ZK Proof Generation

### Automatic (when using API)

When you call `POST /games/:id/open-case`, the API:
1. Fetches pre-generated proof for that case
2. Returns proof in response
3. You pass proof to contract

### Manual (for hosts creating games)

```javascript
const proofGen = require('../circuits/src/proof-generator');

// Generate all proofs for a new game
const prizePool = 1000000000000000000n; // 1 ETH
const salt = proofGen.generateSalt();
const caseValues = proofGen.generateStandardPrizeDistribution(prizePool);

const { merkleRoot, proofs } = await proofGen.generateGameProofs(
  caseValues,
  salt
);

console.log(`Merkle root: ${merkleRoot}`);
console.log(`Generated ${proofs.length} proofs`);

// Deploy game with merkleRoot
// Store proofs for later retrieval
```

**Performance**: ~12s to generate all 26 proofs

---

## Mock Mode

If circuit artifacts aren't built, the API runs in **mock mode**:
- ✅ All endpoints work
- ✅ Events broadcast correctly
- ⚠️ Proofs are fake (won't verify onchain)
- ⚠️ For development/testing only

To enable real proofs:
```bash
cd ../circuits
npm run build  # Compiles circuits (~30s)
# Then restart API server
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3001 | API server port |
| `RPC_URL` | Yes | - | Ethereum RPC endpoint |
| `PRIVATE_KEY` | Yes | - | Host wallet private key |
| `FACTORY_ADDRESS` | Yes | - | DealOrNoDealFactory contract |
| `ADMIN_API_KEY` | No | auto-generated | Admin key for /admin/* |

---

## Rate Limiting

- **60 requests/minute** per API key
- **Burst**: Up to 10 requests
- Returns `429 Too Many Requests` if exceeded

---

## Error Handling

Standard HTTP status codes:

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created (new resource) |
| 400 | Bad request (invalid params) |
| 401 | Unauthorized (missing/invalid API key) |
| 404 | Not found (game doesn't exist) |
| 429 | Rate limit exceeded |
| 500 | Server error |

Error response format:
```json
{
  "error": "Game not found",
  "code": "GAME_NOT_FOUND",
  "details": { "gameId": "0x123..." }
}
```

---

## Advanced: Custom Agents

### Strategy Plugins

Create a strategy module:

```javascript
// strategies/conservative.js
module.exports = {
  name: 'conservative',

  shouldAcceptDeal(offer, expectedValue, round, history) {
    // Accept anything >= 75% of EV after round 5
    if (round >= 5) {
      return Number(offer) >= Number(expectedValue) * 0.75;
    }
    return false;
  },

  selectCase(remainingCases, history) {
    // Random selection
    return remainingCases[Math.floor(Math.random() * remainingCases.length)];
  }
};
```

Load and use:

```javascript
const strategy = require('./strategies/conservative');

ws.on('message', async (data) => {
  const event = JSON.parse(data);

  if (event.type === 'offer.made') {
    const { offer, expectedValue, round } = event.data;
    const history = getGameHistory(event.gameId);

    if (strategy.shouldAcceptDeal(offer, expectedValue, round, history)) {
      await api.post(`/games/${event.gameId}/deal`);
    } else {
      await api.post(`/games/${event.gameId}/no-deal`);
    }
  }
});
```

---

## Production Checklist

- [ ] Generate production API keys
- [ ] Set strong `ADMIN_API_KEY` in .env
- [ ] Use real RPC endpoint (not local)
- [ ] Build circuits (`npm run build` in circuits/)
- [ ] Setup HTTPS/reverse proxy (nginx)
- [ ] Configure rate limits
- [ ] Setup monitoring (health endpoint)
- [ ] Store proofs in IPFS or database
- [ ] Add retry logic for blockchain calls
- [ ] Implement proper error logging

---

## Troubleshooting

### "Circuit artifacts not found"

- Run `cd ../circuits && npm run build`
- Check CIRCUIT_WASM and CIRCUIT_ZKEY paths in zk-service.js

### "Connection refused"

- Check RPC_URL is correct
- Ensure blockchain is running (for local: `yarn chain`)
- Verify FACTORY_ADDRESS is deployed

### "Transaction failed"

- Check wallet has ETH for gas
- Verify contract addresses are correct
- Check game state (might be wrong phase)

### WebSocket not connecting

- Verify port 3001 is open
- Check firewall settings
- Try `ws://` not `wss://` for local

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/index.js` | Main server, routes, middleware |
| `src/game-routes.js` | Game action endpoints |
| `src/zk-service.js` | ZK proof generation |
| `src/ws-broadcast.js` | WebSocket event broadcasting |
| `src/agent-auth.js` | API key management |
| `../circuits/src/proof-generator.js` | Modular proof generation |

---

## Next Steps

1. **Create Agent SDK**: High-level TypeScript library wrapping the API
2. **Add strategy templates**: Pre-built bot strategies
3. **IPFS integration**: Store proofs decentrally
4. **Dashboard**: Web UI to monitor games and agents
5. **Bankr integration**: Connect to Bankr agent platform

---

For questions or issues, see:
- AGENT_INTEGRATION_PLAN.md - Full architecture
- ZK_STATUS.md - ZK proof system details
- HOST_TOOLS.md - Guide for game hosts
