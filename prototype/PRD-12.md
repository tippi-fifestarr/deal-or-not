# Deal or NOT — 12-Case Upgrade with Lottery

## Context

Ryan identified two fundamental problems with the 5-case prototype:
1. **5 cases breaks banker logic** — only 3 rounds of offers, discount curve is truncated (27%→80%), EV stabilizes too fast, no meaningful tension
2. **Single player = no pot** — case values are hardcoded cents with no real money flowing in or out

**Decision:** 12 cases, 5 rounds, both Quick Play (banker deposit) and Multiplayer (lottery entry fees).

The existing 5-case contract at `0xaB29...` stays as-is. We write a new `DealOrNot12.sol` alongside it, blending:
- Current prototype's VRF v2.5 + quantum collapse engine
- CashCase.sol's 12-case round structure + settlement
- Foundry DealOrNoDeal.sol's lottery system

---

## Contract: `prototype/contracts/src/DealOrNot12.sol` (new)

### Game Parameters

- **12 cases**, values: `[1, 5, 10, 25, 50, 100, 200, 300, 400, 500, 750, 1000]` cents ($0.01–$10)
- **5 rounds**: open 4→3→2→1→1, then final swap/keep
- **Two modes**: QuickPlay (banker deposit) and Lottery (entry fees)

### Phase Flow

```
Quick Play:  WaitingForVRF → CaseSelection → [CommitRound → WaitingForReveal → AwaitingOffer → BankerOffer] × 5 → CommitFinal → WaitingForFinalReveal → GameOver

Lottery:     LotteryOpen → LotteryReveal → LotteryDraw → WaitingForVRF → (same as Quick Play)
```

### Key Functions

**Quick Play:**
- `createQuickPlay() payable` — host deposits ETH covering max case ($10), requests VRF
- `joinQuickPlay(gameId, caseCommitHash) payable` — player pays $1 entry, commits case choice
- `revealCaseSelection(gameId, caseIndex, salt)` — after VRF, reveal initial case pick
- `commitRound(gameId, commitHash)` — commit `keccak256(abi.encode(caseIndices[], salt))`
- `revealRound(gameId, caseIndices[], salt)` — quantum collapse N cases at once
- `ringBanker(gameId)` — auto-calc offer on-chain, transition to BankerOffer
- `acceptDeal(gameId)` / `rejectDeal(gameId)`
- `commitFinalDecision(gameId, commitHash)` / `revealFinalDecision(gameId, swap, salt)`

**Settlement:** Player gets payout in ETH (converted via price feed snapshot). Banker gets remainder from combined pot.

**Lottery (Phase 2):**
- `createLottery(entryFee, duration, revealDuration, hostFeeBps, protocolFeeBps, refundBps)`
- `enterLottery(gameId, commitHash) payable`
- `revealSecret(gameId, secret)`
- `drawWinner(gameId)` — VRF + combined entropy selects contestant
- `claimRefund(gameId)` — losers reclaim partial entry fee
- Prize pool = total entries - fees, values scaled by basis points distribution

### Multi-Case Commit-Reveal (critical change from 5-case)

Current prototype commits one case per round. New contract commits an array:
```
commit: keccak256(abi.encode(uint8[] caseIndices, uint256 salt))
reveal: verify hash, collapse all N cases with blockhash entropy from commit block
```

This means round 0 opens 4 cases in a single commit-reveal cycle. The video interstitial plays during the 1-block wait, then all 4 cases collapse simultaneously on reveal.

### Quantum Collapse Engine

Same 3-layer approach (VRF seed + case context + blockhash), loop over 12 values instead of 5. `usedValuesBitmap` tracks consumed values (fits in uint256). Collapse is deterministic given the entropy — no single party can predict or manipulate outcomes.

### Storage Optimization

- `openedBitmap` (uint256) replaces `bool[5] opened` — single slot for 12 flags
- `caseValuesPacked` (uint256) — 12 values in 20-bit slots (CashCase pattern, single storage slot)

---

## Contract: `prototype/contracts/src/BankerAlgorithm.sol` (modify)

Update discount curve for 5 rounds:
```
Round 0: 15% of EV  (lowball after opening 4 cases)
Round 1: 30% of EV
Round 2: 45% of EV
Round 3: 65% of EV
Round 4: 85% of EV  (final offer before swap decision)
```

Random variance: ±5% early → ±8% mid → ±12% late rounds.
Context adjustments: +3% if player's EV dropped >20%, -3% if rose >20%.

With 12 cases and 5 rounds, the banker has enough data points for meaningful psychology. After round 0 (4 cases opened), 8 remain — big EV swings possible. By round 4, only 2 remain and the banker's 85% offer is close to fair value.

---

## Frontend Changes

### Layout: 4×3 Grid (replaces 5-in-a-row)

```
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│  1   │ │  2   │ │  3   │ │  4   │
└──────┘ └──────┘ └──────┘ └──────┘
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│  5   │ │  6   │ │  7   │ │  8   │
└──────┘ └──────┘ └──────┘ └──────┘
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│  9   │ │ 10   │ │ 11   │ │ 12   │
└──────┘ └──────┘ └──────┘ └──────┘
```

### Value Board: Two Columns

```
   LOW           HIGH
┌────────┐   ┌────────┐
│  $0.01 │   │  $2.00 │
│  $0.05 │   │  $3.00 │
│  $0.10 │   │  $4.00 │
│  $0.25 │   │  $5.00 │
│  $0.50 │   │  $7.50 │
│  $1.00 │   │ $10.00 │
└────────┘   └────────┘
```

### Multi-Case Selection UX

Each round, the player selects N cases (4→3→2→1→1):

1. Cases glow when clicked (toggle selection)
2. Counter shows "3 of 4 selected"
3. "Commit Selection" button enabled at exactly N
4. Video interstitial plays during block wait
5. "REVEAL!" collapses all N cases at once with dramatic reveal

### Key Component Changes

| Component | Change |
|-----------|--------|
| `BriefcaseGrid.tsx` | **New** — 4×3 CSS grid, multi-select support |
| `CommitReveal.tsx` | **Rewrite** — multi-case selection, array commit |
| `GameBoard.tsx` | **Major rewrite** — Quick Play funding, 12-case flow |
| `ValueBoard.tsx` | **Modify** — two columns for 12 values |
| `types/game.ts` | **Rewrite** — 12 phases, bitmap helpers |
| `hooks/useCommitReveal.ts` | **Rewrite** — `abi.encode(uint8[], uint256)` |

### Lobby Flow (Quick Play)

1. Host clicks "Quick Play" → MetaMask prompts for deposit (~$10 in ETH)
2. VRF request fires, video plays during wait
3. Player joins → MetaMask prompts for entry fee (~$1 in ETH)
4. Player commits case choice (pre-committed before VRF arrives)
5. VRF seed arrives → player reveals case selection → game begins

### Lobby Flow (Multiplayer Lottery)

1. Host creates game with entry fee, lottery duration, fee structure
2. Players enter lottery (commit secret hash, pay entry fee)
3. Lottery closes → reveal phase → players reveal secrets
4. `drawWinner()` combines entropy + VRF → selects contestant
5. Losers claim partial refunds
6. Game begins with contestant vs CRE Banker (or host as banker)

---

## Sequencing

| Priority | What | Scope |
|----------|------|-------|
| **P1** | `DealOrNot12.sol` Quick Play | New contract, 12 cases, banker deposit, multi-case commit-reveal, settlement |
| **P1** | `BankerAlgorithm.sol` | 5-round discount curve |
| **P1** | Frontend 12-case | BriefcaseGrid, multi-select CommitReveal, ValueBoard 2-col, GameBoard rewrite |
| **P1** | Deploy + test | Base Sepolia, VRF consumer, full playthrough |
| **P2** | Lottery mode (contract) | Entry fees, commit-reveal lottery, winner draw, refunds, scaled prizes |
| **P2** | Lottery UI | LotteryLobby, LotteryEntry, LotteryReveal components |

---

## Verification

1. `forge build` compiles clean
2. `forge test` — full game flow with mock VRF
3. Deploy to Base Sepolia, add as VRF consumer on subscription
4. Frontend: `npm run dev` → connect wallet → Quick Play creates game with deposit
5. Full playthrough: create → VRF → pick case → 5 rounds of multi-case commit-reveal → banker offers → deal/no deal → final swap → GameOver with ETH payout
6. Settlement: verify ETH transferred to player, remainder to banker

---

## Reference Code

| Source | What to Reuse |
|--------|---------------|
| `prototype/contracts/src/DealOrNot.sol` | VRF v2.5 integration, quantum collapse, commit-reveal pattern |
| `packages/brodinger/contracts/CashCase.sol` | 12-case CASES_PER_ROUND, packed value storage, settlement logic |
| `packages/foundry/contracts/DealOrNoDeal.sol` | Lottery system, fee structure, prize pool distribution |
| `packages/foundry/contracts/GameTypes.sol` | Prize distribution basis points, phase definitions |
| `packages/foundry/contracts/BankerAlgorithm.sol` | Variance + context adjustment algorithms |
