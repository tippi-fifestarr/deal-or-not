# Cash Case — Situation Report

*Last updated: 2026-02-20*

## Where We Are

4 commits on `main`, all tests passing, clean working tree.

```
da655e0 feat: add AI agent registry and autonomous player system
db8ba45 feat: add CCIP cross-chain betting bridge
1833805 fix: update MockPriceFeed import path and add CCIP/agent dependencies
f59bc35 Cash Case: the cross-chain casino that plays itself
```

**89 tests passing** (41 DealOrNoDeal + 27 AgentRegistry + 21 CCIPBridge)

## What's Built

### Core Game — `contracts/DealOrNoDeal.sol` (510 lines)
- 12-case Deal or No Deal, fully on-chain
- Chainlink VRF v2.5 for randomness (Fisher-Yates shuffle, 12 random words)
- Chainlink Price Feed for real-time ETH/USD conversion
- Commit-reveal for initial case selection (prevents front-running the VRF)
- Bit-packed case values (12 × 20 bits in one uint256)
- 5 rounds, escalating banker offer percentages (15% → 85%)
- Two-player escrow: banker deposits max case value, player pays $1 entry
- Zero contract balance after every settlement

### CCIP Cross-Chain Betting — `contracts/ccip/` (409 lines)
- `CCIPBridge.sol` (Avalanche side) — accepts bets, relays cross-chain
- `CaseCashGateway.sol` (Base side) — receives bets, settles with BettingPool
- `IBettingPool.sol` — interface for betting pool integration
- Bet placement + payout distribution across chains via Chainlink CCIP

### AI Agent System — `contracts/AgentRegistry.sol` (157 lines) + `scripts/agent-runner.ts` (416 lines)
- On-chain agent registration with staking
- 4 built-in strategies: conservative, aggressive, statistical, random
- Optional OpenAI integration for LLM-driven decisions
- Frontend dashboard at `/agents` with strategy editor + leaderboard

### Frontend — Next.js 16 / React 19 / wagmi v3
- `frontend/app/page.tsx` — main game UI
- `frontend/app/agents/page.tsx` — agent dashboard
- `frontend/lib/contracts.ts` — ABIs and contract config
- Auto network switch, auto fund for local dev

### Deploy & Scripts
- `deploy/00-deploy-mocks.ts` — MockPriceFeed, MockVRFCoordinator (Hardhat only)
- `deploy/01-deploy-game.ts` — DealOrNoDeal
- `deploy/03-deploy-registry.ts` — AgentRegistry
- `deploy/04-deploy-ccip.ts` — CCIPBridge + CaseCashGateway
- `scripts/auto-fulfill-vrf.ts` — local VRF auto-fulfiller
- `scripts/play-game.ts` — CLI game player

## What's Next: Schrödinger's Case Refactor

The big design change we're about to make to `DealOrNoDeal.sol`.

### Current Design (Fisher-Yates)
- VRF generates 12 random words → shuffle all values upfront
- All values exist in storage immediately (bit-packed but readable)
- Attacker with a bot contract could theoretically read storage

### New Design (Schrödinger's Case)
- VRF generates **1 seed** (cheaper gas)
- Values **don't exist** until a case is opened ("collapsed")
- `hash(vrfSeed, caseIndex, totalOpened, blockEntropy)` picks from remaining pool
- Opening ORDER matters — same seed, different order = different outcomes
- No values in storage to front-run. Provably fair by construction.

### Commit-Reveal Per Round (Bot Protection)
Without this, an attacker contract could precompute collapse outcomes and abort unfavorable TXs. Fix:

1. **Commit** — player submits `hash(caseIndices, salt)` — TX1
2. **Wait 1+ block** — blockhash isn't known yet
3. **Reveal** — player reveals choices — TX2, collapse uses `blockhash(commitBlock)` as entropy

The blockhash is unknown at commit time → can't precompute. The commitment is locked → can't change after seeing the blockhash.

**Tradeoff:** 2 TXs per round instead of 1. But we batch (commit to opening cases [3, 7, 2], reveal all three at once). And the wait becomes a UX feature — suspense builds, videos play.

### New Game Phases
```
WaitingForPlayer → WaitingForVRF → RevealCase → CommitRound → WaitingForReveal → BankerOffer → CommitFinal → WaitingForFinalReveal → GameOver
```

### Game Tiers (also adding)
- MICRO: $0.01 – $5.00
- STANDARD: $0.01 – $10.00
- HIGH: $0.10 – $50.00

### Key Contract Changes
- `Game` struct: add `vrfSeed`, `usedValuesBitmap`, `commitBlock`, `totalOpened`, `tier`
- Remove `casesOpenedThisRound` (replaced by `totalOpened`)
- `fulfillRandomWords`: stores seed only, no shuffle
- `openCase` → replaced by `commitRound` + `revealRound`
- `finalDecision` → replaced by `commitFinalDecision` + `revealFinalDecision`
- New `_collapseCase` internal function
- New `forfeitGame` for banker to reclaim if player abandons reveal window
- New `getBettingOutcome` view for betting integration

## Testing Philosophy

- **Mocks are for CI only** — `MockPriceFeed`, `MockVRFCoordinator`, `MockBettingPool` exist so Hardhat unit tests can run without external dependencies
- **Real testing happens in browser** — deploy to local Hardhat node or testnet fork, use MetaMask, test the actual UX
- Don't add mocks unless absolutely necessary for automated tests

## Project Structure

```
deal/
├── contracts/
│   ├── DealOrNoDeal.sol          ← core game (about to be refactored)
│   ├── AgentRegistry.sol         ← AI agent registration
│   ├── ccip/
│   │   ├── CCIPBridge.sol        ← Avalanche side
│   │   ├── CaseCashGateway.sol   ← Base side
│   │   └── IBettingPool.sol      ← interface
│   └── mocks/                    ← Hardhat test mocks only
├── test/
│   ├── DealOrNoDeal.test.ts      ← 41 tests
│   ├── AgentRegistry.test.ts     ← 27 tests
│   └── CCIPBridge.test.ts        ← 21 tests
├── deploy/
├── scripts/
├── frontend/
│   ├── app/page.tsx              ← main game
│   ├── app/agents/page.tsx       ← agent dashboard
│   └── lib/contracts.ts          ← ABIs
├── e2e/                          ← Playwright E2E tests
├── hardhat.config.ts
├── JUDGES.md                     ← hackathon pitch doc
└── SITUATION.md                  ← you are here
```

## Risks & Decisions

| Decision | Status | Notes |
|----------|--------|-------|
| Schrödinger's collapse mechanism | **Designed, not implemented** | Commit-reveal per round for bot protection |
| Betting pool contract | **Not built yet** | IBettingPool interface exists, needs implementation |
| Multi-chain deploy | **Contracts ready** | Need actual Base/Avalanche testnet deployment |
| Frontend update for new phases | **Not started** | CommitRound/WaitingForReveal UX needed |
| E2E tests | **Stale** | Will break after Schrödinger's refactor, need rewrite |
| JUDGES.md | **Stale** | Describes old Fisher-Yates design, needs update |
