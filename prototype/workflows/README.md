# Phase 2: CRE Auto-Reveal Workflows

This directory contains Chainlink Runtime Environment (CRE) workflows for automating game mechanics.

## Overview

**Phase 2** adds CRE auto-reveal to improve UX from **2 transactions → 1 transaction**.

### Before Phase 2 (Current v1)
```
Player commits → Wait 1 block → Player reveals
   (TX 1)                          (TX 2)
```

### After Phase 2 (CRE Auto-Reveal)
```
Player commits → CRE auto-reveals after 1 block
   (TX 1)           (Keystone TX)
```

## Workflows

### 1. Case Reveal Orchestrator

**File**: `case-reveal-orchestrator.ts`

**Purpose**: Automate case reveals after player commits

**Flow**:
1. Player calls `commitCase(gameId, hash)` on-chain
2. Player sends reveal data `{gameId, caseIndex, salt}` to CRE via HTTP endpoint
3. CRE workflow listens for `CaseCommitted` event
4. CRE waits 1 block automatically
5. CRE calls `revealCase()` via Keystone Forwarder with DON consensus

**Security**:
- Keystone Forwarder requires 4-of-6 DON node consensus
- BFT proof submitted on-chain
- Only processes valid commits with matching reveal data
- Enforces 256-block expiry window

## Setup

### 1. Deploy Contract with CRE Support

The `DealOrNot.sol` contract now includes:
- `keystoneForwarder` address (set by owner)
- `autoRevealEnabled` flag (set by owner)
- `_requirePlayerOrForwarder()` authorization check

Deploy and configure:
```solidity
// After deployment
DealOrNot contract = DealOrNot(contractAddress);

// Set Keystone Forwarder address
contract.setKeystoneForwarder(0x...); // DON address

// Enable auto-reveal
contract.setAutoRevealEnabled(true);
```

### 2. Configure CRE Workflow

Create `.env` file in `workflows/` directory:

```bash
# RPC endpoint
RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY

# Contract address
CONTRACT_ADDRESS=0x...

# Keystone Forwarder address (DON)
KEYSTONE_FORWARDER=0x...

# DON node signing key
DON_NODE_KEY=0x...
```

### 3. Run Orchestrator

Each DON node runs the orchestrator:

```bash
cd workflows
npm install
ts-node case-reveal-orchestrator.ts
```

Output:
```
[CRE] Case Reveal Orchestrator started
[CRE] Listening for CaseCommitted events on 0x...
[CRE] CaseCommitted event detected: game=1, round=0
[CRE] Found reveal data for game 1. Scheduling reveal...
[CRE] Waiting 1 blocks before revealing...
[CRE] Executing reveal for game 1...
[CRE] Reveal transaction sent: 0x...
[CRE] ✅ Auto-reveal successful for game 1
```

## Frontend Integration

### Player Submit Reveal Data

When player commits, also send reveal data to CRE:

```typescript
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

// 1. Commit on-chain
const { writeContractAsync } = useScaffoldWriteContract({
  contractName: "DealOrNot",
});

const caseIndex = 2;
const salt = BigInt(Math.floor(Math.random() * 1e18));
const commitHash = keccak256(encodePacked(["uint8", "uint256"], [caseIndex, salt]));

await writeContractAsync({
  functionName: "commitCase",
  args: [gameId, commitHash],
});

// 2. Submit reveal data to CRE
await fetch("https://cre-endpoint.chainlink.network/reveal", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    gameId: gameId.toString(),
    caseIndex,
    salt: salt.toString(),
    player: address,
    commitBlock: blockNumber,
    timestamp: Date.now(),
  }),
});

// 3. CRE handles reveal automatically after 1 block
```

### Listen for Auto-Reveal

Frontend watches for `CaseCollapsed` event:

```typescript
import { useScaffoldEventHistory } from "~~/hooks/scaffold-eth";

const { data: reveals } = useScaffoldEventHistory({
  contractName: "DealOrNot",
  eventName: "CaseCollapsed",
  filters: { gameId },
  watch: true,
});

// When reveal happens, update UI
useEffect(() => {
  if (reveals && reveals.length > 0) {
    const latest = reveals[reveals.length - 1];
    console.log(`Case ${latest.args.caseIndex} revealed: $${latest.args.valueCents / 100}`);
  }
}, [reveals]);
```

## Architecture

### Consensus Flow

```
┌─────────────┐
│   Player    │
│  commits    │
└──────┬──────┘
       │ TX 1: commitCase(hash)
       │ HTTP: {caseIndex, salt}
       ▼
┌─────────────────────────────────────┐
│         CRE DON (6 nodes)           │
│                                     │
│  Node 1 ──┐                         │
│  Node 2 ──┤ Listen for event        │
│  Node 3 ──┤ Wait 1 block            │
│  Node 4 ──┤ Compute reveal          │
│  Node 5 ──┤ Sign with BLS           │
│  Node 6 ──┘                         │
│                                     │
│           ▼                         │
│  ┌────────────────────┐             │
│  │ Keystone Forwarder │             │
│  │  - Collect sigs    │             │
│  │  - Wait 4-of-6     │             │
│  │  - Aggregate BLS   │             │
│  └────────┬───────────┘             │
└───────────┼─────────────────────────┘
            │ TX 2: revealCase()
            ▼        + BFT proof
    ┌──────────────┐
    │  DealOrNot   │
    │   Contract   │
    └──────────────┘
```

## Phase Comparison

| Feature | Phase 1 (v1) | Phase 2 (CRE Auto-Reveal) | Phase 3 (+ Confidential Compute) |
|---------|-------------|--------------------------|----------------------------------|
| **Player TX** | 2 (commit + reveal) | 1 (commit only) | 1 (commit only) |
| **Reveal data** | Player keeps secret | Sent to CRE off-chain | Threshold encrypted on-chain |
| **Reveal executor** | Player | Keystone DON | Keystone DON |
| **Case values** | On-chain (pre-deterministic) | On-chain (pre-deterministic) | TEE enclaves (truly hidden) |
| **Banker offers** | On-chain pure function | On-chain pure function | AI in TEE with private data |

## Security Considerations

### Phase 2 Limitations

⚠️ **Case values are still pre-deterministic**

Even with CRE auto-reveal, case values are computed from:
```solidity
keccak256(vrfSeed, caseIndex, totalCollapsed, blockhash(commitBlock))
```

Since `vrfSeed` and `blockhash` are public after the commit block, **anyone can precompute all possible case values** before reveal.

This is acceptable for Phase 2 because:
1. Values are hidden from player (can't choose advantageous path)
2. Player experience is identical to TV show (suspenseful)
3. Banker offers are fair (EV-based, variance adds unpredictability)

### Phase 3 Upgrade Path

**True quantum superposition** requires Confidential Compute:
- Case values encrypted with DON's threshold key (DKG)
- Values assigned in TEE enclaves (SGX/SEV)
- No single node can decrypt
- Values exist nowhere readable until reveal
- On-chain state shows only `bytes encryptedValue`

See `../docs/PHASE3-CONFIDENTIAL-COMPUTE.md` (coming soon)

## Testing

### Local Testing

1. Run local blockchain:
```bash
# In prototype/contracts
forge anvil
```

2. Deploy contract:
```bash
forge script script/Deploy.s.sol --broadcast --rpc-url http://localhost:8545
```

3. Set Keystone address (use test account):
```bash
cast send $CONTRACT_ADDRESS "setKeystoneForwarder(address)" $FORWARDER_ADDRESS --private-key $PRIVATE_KEY
cast send $CONTRACT_ADDRESS "setAutoRevealEnabled(bool)" true --private-key $PRIVATE_KEY
```

4. Run orchestrator:
```bash
cd workflows
RPC_URL=http://localhost:8545 \
CONTRACT_ADDRESS=$CONTRACT_ADDRESS \
DON_NODE_KEY=$TEST_PRIVATE_KEY \
ts-node case-reveal-orchestrator.ts
```

5. Create game and commit from frontend
6. Watch orchestrator auto-reveal after 1 block

### Testnet Testing

Deploy to Base Sepolia:
```bash
# Deploy contract
forge script script/Deploy.s.sol --broadcast --rpc-url $BASE_SEPOLIA_RPC --verify

# Get Keystone Forwarder address from Chainlink docs
# https://docs.chain.link/chainlink-functions/resources/supported-networks

# Configure contract
cast send $CONTRACT_ADDRESS "setKeystoneForwarder(address)" $KEYSTONE_ADDRESS --rpc-url $BASE_SEPOLIA_RPC --private-key $PRIVATE_KEY
cast send $CONTRACT_ADDRESS "setAutoRevealEnabled(bool)" true --rpc-url $BASE_SEPOLIA_RPC --private-key $PRIVATE_KEY
```

## Monitoring

### Metrics

CRE workflows should emit metrics:
- `reveal_request_received` - Reveal data submitted
- `reveal_scheduled` - Reveal scheduled for future block
- `reveal_executed` - Reveal transaction sent
- `reveal_confirmed` - Reveal confirmed on-chain
- `reveal_failed` - Reveal transaction failed

### Alerts

Set up alerts for:
- Reveal failures (retry needed)
- High latency (> 2 blocks)
- Queue buildup (> 10 pending)
- Keystone consensus failures

## Cost Analysis

### Gas Costs

| Operation | Gas | Cost (Base @ 0.05 gwei) |
|-----------|-----|------------------------|
| commitCase | ~50k | ~$0.005 |
| revealCase (player) | ~120k | ~$0.012 |
| revealCase (Keystone) | ~135k | ~$0.014 |
| **Total Phase 1** | **~170k** | **~$0.017** |
| **Total Phase 2** | **~185k** | **~$0.019** |

**UX improvement**: Player pays only ~$0.005 (1 TX), DON pays ~$0.014 for reveal

### CRE Costs

DON operational costs (estimated):
- Node compute: Minimal (event listening + 1 TX per game)
- Keystone consensus: ~6 nodes × signature aggregation
- On-chain TX: ~$0.014 per reveal (Base L2)

**Pricing model**: Could charge player small fee in `commitCase()` to subsidize DON costs

## Roadmap

- [x] Phase 2: CRE Auto-Reveal (this)
- [ ] Phase 3: Confidential Compute for case values
- [ ] Phase 4: AI Banker with CRE workflows
- [ ] Phase 5: CCIP cross-chain games
- [ ] Phase 6: Prediction markets integration

## Resources

- [Chainlink CRE Documentation](https://docs.chain.link/chainlink-functions)
- [Keystone Forwarder Addresses](https://docs.chain.link/chainlink-functions/resources/supported-networks)
- [CRE Workflow Examples](https://github.com/smartcontractkit/chainlink-cre-examples)
- [BLS Signature Aggregation](https://docs.chain.link/architecture-overview/off-chain-reporting)

## Support

Questions? Check:
- Deal or NOT Discord: `#cre-workflows`
- Chainlink Developer Hub: https://dev.chain.link
- PRD Section 3: Architecture
