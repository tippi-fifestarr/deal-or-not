# Deal or NOT v2 — Product Requirements Document

**Project:** Deal or NOT — Provably Fair On-Chain Game Show, Powered by CRE
**Hackathon:** Convergence: A Chainlink Hackathon (Feb 6 – Mar 8, 2026)
**Team:** Tippi + Ryan
**Repo:** https://github.com/rdobbeck/deal-or-not

---

## Table of Contents

1. [Vision](#1-vision)
2. [Current State (Honest Assessment)](#2-current-state)
3. [Target Tracks](#3-target-tracks)
4. [Unified Game Design](#4-unified-game-design)
5. [Architecture](#5-architecture)
6. [Chainlink Integration Map](#6-chainlink-integration-map)
7. [Smart Contracts](#7-smart-contracts)
8. [CRE Workflows](#8-cre-workflows)
9. [Frontend & UX Flow](#9-frontend--ux-flow)
10. [Prediction Market](#10-prediction-market)
11. [AI Agent System](#11-ai-agent-system)
12. [Cross-Chain Play via CCIP](#12-cross-chain-play-via-ccip)
13. [Implementation Phases](#13-implementation-phases)
14. [Submission Checklist](#14-submission-checklist)
15. [Resources](#15-resources)
16. [Work Split (Decide Saturday)](#16-work-split-decide-saturday)

---

## 1. Vision

Deal or NOT is the game show everyone knows — rebuilt as an on-chain, provably fair, multi-player experience where humans and AI agents compete as both case crackers and bankers, with side-bet prediction markets on every game. The Banker is a CRE workflow running on the Chainlink DON — not a single server, not an on-chain algorithm, but decentralized off-chain computation with consensus. Case values are determined by VRF and hidden via Confidential Compute. Games are playable from any chain via CCIP. Every game is a betting event.

One game. Five Chainlink products. Zero trust assumptions.

| Chainlink Product | Role in Deal or NOT |
|---|---|
| **CRE** | Banker AI, case value oracle, game orchestration, prediction market settlement, agent gateway |
| **VRF v2.5** | Seed randomness for case assignment + lottery contestant selection |
| **Price Feeds** | Real-time ETH/USD conversion for USD-denominated prizes |
| **CCIP** | Cross-chain play — bet and play from any supported chain |
| **Confidential Compute** | Hidden case values — the DON knows, no single node does, and nobody on-chain can peek |

---

## 2. Current State

We built two separate games at ETHDenver and merged late. Here is what exists, what works, and what is broken. Claude and Ryan — read this section carefully before touching anything.

### What Exists (Reference Code — Do NOT Assume Any of This Works On-Chain)

**IMPORTANT FOR CLAUDE AND RYAN:** Tests passing in Hardhat/Foundry does NOT mean these contracts work on a live chain. CashCase was deployed and the VRF subscriber was funded, but we never completed a full end-to-end game on-chain. The foundry side deployed a factory but Bug #003 blocks the game flow. Treat everything below as **reference implementations and design patterns to learn from**, not working code to build on top of.

| Component | Location | What It Is | Actual Status |
|---|---|---|---|
| **CashCase.sol** | `packages/brodinger/contracts/CashCase.sol` | 12-case game, VRF v2.5, Price Feeds, quantum collapse, commit-reveal | Hardhat tests pass (89 total across brodinger package). Deployed to Base Sepolia. VRF subscriber funded. **Never completed a full game on-chain.** Unknown if the full flow actually works end-to-end. |
| **DealOrNoDeal.sol** (foundry) | `packages/foundry/contracts/DealOrNoDeal.sol` | 26-case game, ZK proofs, commit-reveal lottery | Foundry tests pass (45/46) but ZK proofs are mocked. **Bug #003 blocks briefcase selection.** Core gameplay broken. |
| **BankerAlgorithm.sol** | `packages/foundry/contracts/BankerAlgorithm.sol` | Show-accurate EV-based offers with variance + psychology. Pure library. | Tests pass. **This is a pure library with no external dependencies — high confidence it works as designed.** Good reference for CRE Banker workflow logic. |
| **BriefcaseNFT.sol** | `packages/foundry/contracts/BriefcaseNFT.sol` | On-chain SVG ERC-721, tier-based coloring | Tests pass. Deployed as implementation contract on Base Sepolia. Never minted in a real game. |
| **DealOrNoDealFactory.sol** | `packages/foundry/contracts/DealOrNoDealFactory.sol` | EIP-1167 clone factory with progressive jackpot | Deployed to Base Sepolia. Creates clones. But since the underlying DealOrNoDeal.sol has Bug #003, cloned games don't work either. |
| **GameTypes.sol** | `packages/foundry/contracts/GameTypes.sol` | 26-case show-accurate prize distribution, types, constants, events | **Solid reference.** Pure types/constants, no runtime behavior to break. Use this as the canonical game spec. |
| **AgentRegistry.sol** | `packages/brodinger/contracts/AgentRegistry.sol` | Agent registration, funding, leaderboard | 27 Hardhat tests pass. Never deployed or tested on-chain. |
| **CCIP Bridge contracts** | `packages/brodinger/contracts/ccip/` | CCIPBridge.sol + CaseCashGateway.sol | 21 Hardhat tests pass with mocked CCIP router. **IBettingPool interface has no implementation.** Never tested with real CCIP. |
| **ZK circuit pipeline** | `packages/circuits/` | Poseidon Merkle tree, Groth16 verifier, snarkjs proof generation | Circuit compiles. Test proofs generate. **Never used in a real game** — on-chain verifier is mocked. |
| **API ZK service** | `packages/api/src/zk-service.js` | Builds Merkle trees, generates proofs | Falls back to mock proofs if circuit artifacts are missing. |
| **Base Sepolia deployment** | `packages/foundry/deployments/84532.json` | Factory + verifiers + implementations | Deployed but untested. The foundry game has Bug #003. |

**Bottom line:** We have ~2500 lines of Solidity with good ideas but nothing that has been proven to work end-to-end on a live chain. The v2 unified contract should be written fresh, using the existing code as design reference — especially GameTypes.sol (game spec), BankerAlgorithm.sol (offer logic), and CashCase.sol (VRF/Price Feed integration patterns).

### What Is Broken (Fix or Replace)

| Problem | Detail | v2 Plan |
|---|---|---|
| **ZK proofs are mocked** | `MockGroth16Verifier` returns true for everything. Frontend sends zero-filled proofs. | **Replace with Confidential Compute.** The DON holds case assignments in encrypted state. No ZK circuits needed — Confidential Compute provides the same guarantee (no single party knows values) without the complexity. |
| **Two incompatible game contracts** | Foundry `DealOrNoDeal.sol` (26-case, ZK) vs Brodinger `CashCase.sol` (12-case, VRF quantum collapse). Different architectures, different case counts, different everything. | **Unify into one contract.** 26 cases (show-accurate). VRF for seed. Confidential Compute for hidden values. CRE for the banker. |
| **OpenZeppelin dependency conflict** | `@chainlink/contracts` needs OZ 4.9.6, `@chainlink/contracts-ccip` needs OZ 5.0.2. | **Isolate CCIP into its own compilation unit** or use Foundry remappings to resolve. |
| **Bug #003 — briefcase selection** | Error `0x8ef7077e` on the foundry DealOrNoDeal. Core flow broken. | **Moot — we are rewriting the game contract.** But investigate the root cause for learning. |
| **IBettingPool never implemented** | CCIP bridge calls an interface with no implementation. | **Implement it** — the bridge points to the unified game contract's betting pool. |
| **Two frontends, zero shared components** | `/game/*` and `/cashcase/*` are completely separate UIs with separate hooks and ABIs. | **One frontend.** One game. One flow. |
| **ChainlinkVRFLottery.sol is dead code** | Exists in foundry but DealOrNoDeal.sol never inherits it. | **Delete.** VRF integration happens through the unified contract. |
| **Fisher-Yates on-chain vulnerability** | `CaseCheat.sol` proves all values readable from storage in the old brodinger DealOrNoDeal. | **Solved by Confidential Compute.** Values never exist on-chain until revealed. |

---

## 3. Target Tracks

We are competing in multiple tracks simultaneously. Every feature should pull weight across tracks.

### Primary Tracks

| Track | Prize | Our Angle |
|---|---|---|
| **Prediction Markets** | $16K / $10K / $6K | Every game IS a prediction market. Side bets on: deal/no-deal outcome, banker offer ranges, which cases hold top values, final payout over/under. CRE workflow settles markets using on-chain game events. |
| **CRE & AI** | $17K / $10.5K / $6.5K | AI banker as a CRE workflow. AI agents playing via x402-authenticated CRE HTTP triggers. Agent-vs-agent gameplay. CRE orchestrates the entire game loop. |
| **Privacy** | $16K / $10K / $6K | Confidential Compute hides case values. Confidential HTTP for API credentials in banker AI logic. Sealed-bid banker offers (banker submits offer privately, player sees it only when making deal/no-deal decision). |

### Secondary Tracks

| Track | Prize | Our Angle |
|---|---|---|
| **Top 10 Projects** | $1.5K each | Baseline — ship quality work, we're in. |
| **DeFi & Tokenization** | $20K / $12K / $8K | BriefcaseNFTs as tokenized game assets. Progressive jackpot as a DeFi primitive. Prediction market liquidity. |
| **Autonomous Agents** | $5K / $3.5K / $1.5K | Agent-played games end-to-end. CRE workflows as the agent brain. |
| **Best use of World ID with CRE** | $5K / $3K / $1.5K | Sybil-resistant lottery entry — one entry per human via World ID proof. Prevents bot farming of the contestant selection. |
| **Tenderly Virtual TestNets** | $5K / $2.5K / $1.75K | Deploy and demo on Tenderly with mainnet state sync. |

### Track Submission Requirements (Universal)

All tracks require:
- CRE Workflow integrating at least one blockchain with an external API/data source/LLM/AI agent
- Successful `cre workflow simulate` or live CRE network deployment
- 3–5 minute publicly viewable video demonstrating workflow execution
- Public GitHub repo with README linking all Chainlink-related files

---

## 4. Unified Game Design

### Core Game: 26-Case Deal or No Deal

Show-accurate rules. 26 briefcases, 10 rounds, escalating banker offers.

#### Two Play Modes

**Solo Mode (Quick Play)**
- Player vs. the CRE Banker (AI)
- No lottery — jump straight in
- Player picks a case, opens cases each round, gets banker offers
- Show-accurate prize distribution from GameTypes.sol
- Good for: learning the game, quick sessions, agent testing

**Multiplayer Mode (The Main Event)**
- Full game show experience with audience participation
- Lottery to select the contestant (commit-reveal + optional World ID for sybil resistance)
- CRE Banker makes offers based on game theory + market data + player psychology
- Prediction markets open for every game — audience bets on outcomes
- Cross-chain play via CCIP — enter the lottery or place bets from any chain
- BriefcaseNFTs minted for every game

#### Round Structure (Show-Accurate)

| Round | Cases to Open | Banker Discount (base) |
|---|---|---|
| 1 | 6 | 27% of EV |
| 2 | 5 | 37% |
| 3 | 4 | 46% |
| 4 | 3 | 56% |
| 5 | 2 | 65% |
| 6 | 1 | 75% |
| 7 | 1 | 80% |
| 8 | 1 | 84% |
| 9 | 1 | 89% |
| 10 | 1 (swap decision) | 95% |

After each round: banker offer. Player says DEAL or NO DEAL.
After round 10: player can swap their case with the one remaining case.

#### Case Opening: Commit-Reveal Flow

Each case opening uses commit-reveal to add drama and prevent front-running:

1. Player commits to opening a specific case (sends hash)
2. Short video clip plays during the reveal window (2-8 seconds, funny/dramatic clips — think "what's in the box" memes, dramatic music stings)
3. Player reveals, case value is exposed
4. CRE workflow verifies the reveal and emits the case value (sourced from Confidential Compute)

The video interstitials are key to the UX. They make the blockchain wait times feel intentional and fun rather than annoying. Pre-load a library of short clips categorized by drama level (low value reveal = funny, high value reveal = dramatic gasp).

---

## 5. Architecture

```
                                    CHAINLINK DON
                          ┌──────────────────────────────┐
                          │                              │
                          │   CRE Workflows:             │
                          │   ┌─────────────────────┐    │
                          │   │  Banker AI Workflow  │    │   Confidential
                          │   │  (log trigger →      │    │   Compute
                          │   │   calculate offer →  │    │   ┌──────────┐
                          │   │   write on-chain)    │    │   │ Case     │
                          │   └─────────────────────┘    │   │ Values   │
                          │   ┌─────────────────────┐    │   │ (hidden) │
                          │   │  Market Settlement   │    │   └──────────┘
                          │   │  Workflow             │    │
                          │   └─────────────────────┘    │       VRF v2.5
                          │   ┌─────────────────────┐    │   ┌──────────┐
                          │   │  Agent Gateway       │    │   │ Random   │
                          │   │  (HTTP trigger +     │    │   │ Seed     │
                          │   │   x402 payments)     │    │   └──────────┘
                          │   └─────────────────────┘    │
                          └──────────┬───────────────────┘
                                     │
                          writes via KeystoneForwarder
                                     │
                                     ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                     BASE SEPOLIA                            │
    │                                                             │
    │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
    │  │ DealOrNot.sol│  │ PredMarket   │  │ BriefcaseNFT    │   │
    │  │ (unified     │  │ .sol         │  │ .sol            │   │
    │  │  game)       │  │              │  │                 │   │
    │  └──────┬───────┘  └──────────────┘  └─────────────────┘   │
    │         │                                                   │
    │  ┌──────┴───────┐  ┌──────────────┐  ┌─────────────────┐   │
    │  │ Factory.sol  │  │ AgentReg     │  │ Price Feed      │   │
    │  │ (clones +    │  │ .sol         │  │ (ETH/USD)       │   │
    │  │  jackpot)    │  │              │  │                 │   │
    │  └──────────────┘  └──────────────┘  └─────────────────┘   │
    │                                                             │
    │  ┌──────────────────────────────────────────────────────┐   │
    │  │              CCIP Router                              │   │
    │  │  ← messages from other chains (lottery, bets)         │   │
    │  └──────────────────────────────────────────────────────┘   │
    └─────────────────────────────────────────────────────────────┘
                                     ▲
                                     │
                              ┌──────┴──────┐
                              │  Frontend   │
                              │  Next.js    │
                              │  (unified)  │
                              └─────────────┘
```

---

## 6. Chainlink Integration Map

### CRE Workflows (5 workflows)

| Workflow | Trigger | What It Does | Capabilities Used |
|---|---|---|---|
| **Banker AI** | EVM Log (CaseOpened event) | Calculates banker offer using BankerAlgorithm logic + market data + player history. Writes offer on-chain via KeystoneForwarder. | EVM Read, HTTP Fetch, Confidential HTTP, EVM Write |
| **Case Value Oracle** | EVM Log (CaseRevealRequested event) | Retrieves hidden case value from Confidential Compute state, returns it on-chain. | Confidential Compute, EVM Write |
| **Market Settlement** | EVM Log (GameResolved event) | Reads game outcome, settles all prediction market positions, distributes payouts. | EVM Read, EVM Write |
| **Agent Gateway** | HTTP Trigger (x402 authenticated) | AI agents send game moves via HTTP. Workflow validates, executes on-chain. Agents pay per move via x402. | HTTP Trigger, EVM Read, EVM Write |
| **Cross-Chain Sync** | EVM Log (CCIP MessageReceived) | Processes incoming cross-chain lottery entries and bets, forwards to game/market contracts. | EVM Read, EVM Write |

### VRF v2.5

- **Lottery contestant selection** — request N random words after commit-reveal, use to select winner
- **Case assignment seed** — single random word seeds the case-to-value mapping (combined with Confidential Compute to keep it hidden)

### Price Feeds

- **ETH/USD** — all prizes denominated in USD cents, converted at game start and settlement
- Existing integration from CashCase.sol carries over directly

### CCIP

- **Inbound messages** — lottery entries and prediction market bets from spoke chains
- **Outbound messages** — payout distributions back to spoke chains
- Existing CCIPBridge.sol + CaseCashGateway.sol architecture, with IBettingPool finally implemented

### Confidential Compute

- **Case value storage** — the DON holds the mapping of case index → prize value, encrypted via threshold encryption. No single node knows all values. No on-chain storage to peek at.
- **Sealed banker offers** — banker offer computed in Confidential Compute, revealed to player only at decision time
- **Confidential HTTP** — if banker AI calls external APIs (LLM for player psychology, market data), credentials stay private

---

## 7. Smart Contracts

### New: Unified `DealOrNot.sol`

Combines the best of both existing contracts:

**From CashCase.sol (Brodinger):**
- VRF v2.5 integration (proven, tested)
- Bit-packed case state (gas efficient)
- Commit-reveal per round
- Price Feed integration
- Game tiers (MICRO / STANDARD / HIGH)

**From Foundry DealOrNoDeal.sol (Ryan):**
- 26-case show-accurate design
- 10-round structure with casesPerRound()
- GameTypes.sol prize distribution
- Lottery contestant selection (commit-reveal)
- Host/contestant roles

**New in v2:**
- `IReceiver` interface — accepts CRE workflow reports via KeystoneForwarder (banker offers, case reveals, market settlements)
- Solo mode (no lottery, player vs. CRE banker)
- Prediction market hooks — emits events that the market contract listens to
- CCIP-aware — accepts cross-chain entries via the bridge

**Remove:**
- ZK proof verification (replaced by Confidential Compute)
- On-chain BankerAlgorithm calls (replaced by CRE Banker workflow)
- Fisher-Yates on-chain shuffle (values never stored on-chain)

### Keep: `DealOrNoDealFactory.sol`

EIP-1167 clone factory with progressive jackpot. Works as-is. May need minor updates for the new game contract interface.

### Keep: `BriefcaseNFT.sol`

On-chain SVG, tier-based coloring. Update to work with 26-case unified contract. Reveal happens when CRE Case Value Oracle writes the value.

### Keep: `AgentRegistry.sol`

Agent registration and leaderboard. Add a `strategyType` field to distinguish CRE-powered agents from external agents.

### New: `PredictionMarket.sol`

Simple binary outcome markets per game:

| Market Type | Question | Resolution Source |
|---|---|---|
| Deal/No Deal | Will the player take the deal? | GameResolved event |
| High Case | Is the player's case above median? | FinalCaseRevealed event |
| Banker Offer Range | Will round N offer be above X? | BankerOfferMade event |
| Payout Over/Under | Will final payout exceed X? | GameResolved event |

Resolution: CRE Market Settlement workflow reads events, calls `resolveMarket()` with the outcome.

### Update: CCIP Contracts

- Implement `IBettingPool` — receives cross-chain bets, creates prediction market positions
- Update `CCIPBridge.sol` to forward to both game contract (lottery entries) and PredictionMarket (bets)

---

## 8. CRE Workflows

### 8.1 Banker AI Workflow (Primary — This Is the Demo)

```
Trigger: EVM Log — CaseOpened(gameId, caseIndex, value)

Logic:
1. Read game state (remaining cases, current round, player history)
2. Calculate base offer using BankerAlgorithm logic (ported to TypeScript)
3. Fetch market data via HTTP (ETH price, game prediction market odds)
4. Apply "banker psychology" adjustments:
   - If prediction market says 80% chance player takes deal → lower the offer
   - If player has rejected 3 offers in a row → raise it slightly (respect)
   - Late rounds: approach fair value (show-accurate escalation)
5. Reach DON consensus on the offer amount
6. Write offer on-chain via KeystoneForwarder → game.receiveBankerOffer()

Config:
  schedule: triggered by events (not cron)
  targetChain: base-sepolia (84532)
  gameFactoryAddress: "0x0B9C8d4211720B73A445eCa6D9DE95263f60D2A9"
```

### 8.2 Case Value Oracle Workflow

```
Trigger: EVM Log — CaseRevealRequested(gameId, caseIndex)

Logic:
1. Look up game's VRF seed from contract state
2. Derive case-to-value mapping from seed (deterministic but hidden)
3. Return the specific case's value via consensus
4. Write value on-chain → game.receiveCaseValue()

This is where Confidential Compute shines:
- The mapping derivation happens inside the enclave
- No single node learns the full mapping
- The value is only revealed for the specific case being opened
- Remaining case values stay hidden
```

### 8.3 Market Settlement Workflow

```
Trigger: EVM Log — GameResolved(gameId, outcome, payout)

Logic:
1. Read all open prediction markets for this gameId
2. Determine outcomes (deal taken? case high? offer range?)
3. Call resolveMarket() for each market with the outcome
4. Emit settlement events for frontend updates
```

### 8.4 Agent Gateway Workflow

```
Trigger: HTTP (x402 authenticated)

Logic:
1. Validate x402 payment (agent pays per API call)
2. Parse agent's move (open_case, deal, no_deal, place_bet)
3. Validate move against current game state
4. Execute on-chain via EVM Write
5. Return updated game state to agent

This makes every CRE workflow monetizable:
- Agents pay to play
- The workflow creator earns revenue
- x402 handles payments natively over HTTP
```

### 8.5 Cross-Chain Sync Workflow

```
Trigger: EVM Log — CCIP MessageReceived on Base Sepolia

Logic:
1. Decode incoming CCIP message (lottery entry or bet)
2. If lottery entry: call game.enterLottery() on behalf of cross-chain player
3. If bet: call predictionMarket.placeBet() on behalf of cross-chain bettor
4. If payout: send CCIP message back to spoke chain with winnings
```

---

## 9. Frontend & UX Flow

**One app. One flow. No mode selector.**

Tech: Next.js + wagmi + Scaffold-ETH hooks + Tailwind

### 9.1 Home — The Lobby

- Hero: "DEAL OR NOT" with animated briefcase
- **Quick Play** button → Solo mode (no lottery, immediate game start vs CRE Banker)
- **Live Games** feed — games currently in progress with live prediction market odds
- **Create Game** → starts a new multiplayer game (you're the host)
- **Leaderboard** — top agents and players from AgentRegistry
- **Your NFTs** — gallery of BriefcaseNFTs you've collected

### 9.2 Game Creation (Host)

1. Choose tier (MICRO $5 / STANDARD $10 / HIGH $50 entry)
2. Set lottery duration
3. Game deploys via Factory (clone)
4. VRF request fires for case assignment seed
5. Confidential Compute receives seed, generates hidden case mapping
6. Share game link — lottery is open

### 9.3 Lottery Entry

1. Players connect wallet (or World ID for sybil resistance)
2. Pay entry fee → commit hash
3. Waiting room UI — see other entrants, chat, early prediction markets open
4. Cross-chain players enter via CCIP gateway on their home chain
5. Reveal phase → VRF selects contestant
6. Non-selected players get refunded (minus small fee to jackpot pool)

### 9.4 The Game (Core Loop)

**The Briefcase Wall:**
- 26 briefcases displayed in a 2-row arc (show-accurate layout)
- Remaining prize values shown on a prize board (left side)
- Player's selected case highlighted at center top
- Banker phone icon pulses when offer is incoming

**Opening Cases:**
1. Player taps a briefcase to open
2. **Commit**: Transaction sent (briefcase starts "rattling" animation)
3. **Video Interstitial**: Short clip plays during reveal window
   - Low-drama clips for early rounds (funny reactions, memes)
   - High-drama clips for late rounds (dramatic music, gasps)
   - Library of ~20-30 clips, randomized, 3-8 seconds each
4. **Reveal**: Case opens with animation, value strikes through on prize board
5. Repeat for all cases in the round

**Banker Offer:**
1. Phone rings animation
2. CRE Banker workflow calculates offer (1-3 second DON consensus)
3. Offer appears with dramatic reveal
4. Stats overlay: EV, offer as % of EV, deal quality rating
5. **DEAL** or **NO DEAL** buttons
6. If DEAL: confetti + payout
7. If NO DEAL: briefcase wall updates, next round begins

**Final Round (Swap Decision):**
1. Two cases remain — player's case and one other
2. "Would you like to SWAP?" prompt
3. Both cases revealed regardless
4. Final payout

### 9.5 Prediction Market Sidebar

Visible throughout gameplay as a collapsible sidebar:

- **Active Markets** for the current game:
  - "Will they take the deal?" (YES/NO with odds)
  - "Player's case value: Over/Under $X?"
  - "Next banker offer: Above/Below $Y?"
  - "Final payout: Top 5 / Bottom 5?"
- One-click betting with wallet
- Live odds update as cases open
- Cross-chain bets via CCIP
- Settlement happens automatically via CRE workflow when game resolves

### 9.6 Game Over

- Dramatic reveal of player's case
- Final stats: payout, EV comparison, deal quality
- BriefcaseNFT minted and shown (on-chain SVG)
- Prediction market settlements displayed
- "Play Again" / "Watch Next Game" / "Share" buttons

### 9.7 Agent Dashboard

- Register as an agent (banker, player, or both)
- Fund agent wallet
- View strategy performance over time
- Leaderboard with profit/loss, games played, win rate
- Link to CRE Agent Gateway workflow for API access

---

## 10. Prediction Market

### Design

Each multiplayer game automatically creates a set of binary outcome markets.

**Market Lifecycle:**
1. **Open** — when game enters lottery phase. Anyone can buy YES/NO shares.
2. **Locked** — when relevant event approaches (e.g., banker offer market locks after cases opened)
3. **Resolved** — CRE Market Settlement workflow reads game events, calls `resolveMarket()`
4. **Claimable** — winners claim payouts

**Market Types:**

| Market | Opens | Locks | Resolves On |
|---|---|---|---|
| Deal or No Deal? | Lottery | Round 3 starts | `GameResolved` event |
| Player case > median? | Case selection | Round 5 starts | `FinalCaseRevealed` event |
| Round N offer > $X? | Each round start | Cases opened for round | `BankerOfferMade` event |
| Final payout > $X? | Lottery | Round 7 starts | `GameResolved` event |

**Pricing:** Simple constant-product AMM (x * y = k). No complex order books.

**Cross-chain:** CCIP gateway accepts bets from other chains. CRE Cross-Chain Sync workflow processes them.

---

## 11. AI Agent System

### Roles

**Agent as Player (Case Cracker):**
- Enters lottery (or plays solo mode)
- Opens cases strategically (if order matters for prediction market positions)
- Makes deal/no-deal decisions based on EV analysis
- Can place prediction market bets on their own games

**Agent as Banker (Multiplayer variant):**
- Alternative to CRE Banker — a registered agent can bid to be the banker
- Stakes ETH as the prize pool (banker escrow, like CashCase.sol's model)
- Sets offer strategy via `strategyURI` in AgentRegistry
- Profits if player takes a below-EV deal

**Agent as Bettor:**
- Watches live games
- Places prediction market bets via CRE Agent Gateway
- Pays per API call via x402

### CRE Agent Gateway

Agents interact via authenticated HTTP:

```
POST /agent/move
Authorization: x402 (USDC micropayment)
{
  "gameId": 42,
  "action": "open_case",
  "caseIndex": 15
}

Response:
{
  "success": true,
  "caseValue": 50000,
  "remainingCases": 18,
  "currentEV": 131567,
  "nextAction": "open_case | await_banker_offer"
}
```

---

## 12. Cross-Chain Play via CCIP

### Flow

1. **Spoke chain** (Arbitrum, Optimism, etc.) has `CaseCashGateway.sol` deployed
2. Player calls `enterLottery()` or `placeBet()` on their local gateway
3. Gateway encodes message + sends via CCIP router to Base Sepolia
4. `CCIPBridge.sol` on Base Sepolia receives message
5. CRE Cross-Chain Sync workflow processes the action
6. On game resolution, payouts sent back via CCIP to spoke chain

### Why This Matters for Judging

Cross-chain play via CCIP means:
- Players don't need to bridge to Base Sepolia
- Prediction market bettors can bet from any chain
- The game show becomes a multi-chain event
- Demonstrates CCIP + CRE working together (rare and impressive)

---

## 13. Implementation Phases

### Phase 1: Core Game + CRE Banker (MUST HAVE — Days 1-4)

**Goal:** One playable game with CRE Banker that passes `cre workflow simulate`

- [ ] Write unified `DealOrNot.sol` — 26 cases, VRF seed, IReceiver for CRE reports
- [ ] Port BankerAlgorithm logic to TypeScript CRE workflow
- [ ] Implement Banker AI workflow (log trigger → calculate → write offer)
- [ ] Implement Case Value Oracle workflow (or simplify: CRE Banker also serves case values)
- [ ] `cre workflow simulate` passes for both workflows
- [ ] Solo mode frontend — one page, one game, briefcase wall + banker offers
- [ ] Deploy to Base Sepolia

### Phase 2: Prediction Market + Settlement (HIGH VALUE — Days 5-7)

**Goal:** Side bets on every game, auto-settled by CRE

- [ ] Write `PredictionMarket.sol` — binary outcome markets with simple AMM
- [ ] Market Settlement CRE workflow (log trigger → resolve markets)
- [ ] Frontend sidebar for placing bets and viewing odds
- [ ] `cre workflow simulate` passes for settlement workflow

### Phase 3: Multiplayer + Lottery + NFTs (SHOW STOPPER — Days 8-10)

**Goal:** Full game show experience

- [ ] Lottery system in unified contract (commit-reveal + VRF selection)
- [ ] Multiplayer frontend flow (lobby → lottery → game)
- [ ] BriefcaseNFT integration
- [ ] Video interstitials during case reveals
- [ ] Progressive jackpot via Factory

### Phase 4: Privacy Track (BONUS — Days 10-12)

**Goal:** Confidential Compute for hidden case values

- [ ] Integrate Confidential Compute for case value storage/reveal
- [ ] Confidential HTTP for banker API calls
- [ ] Sealed banker offers (encrypted until player decision)

### Phase 5: Cross-Chain + Agents (BONUS — Days 12-14)

**Goal:** CCIP play + AI agent API

- [ ] Implement IBettingPool in CCIPBridge
- [ ] Deploy CaseCashGateway to second testnet
- [ ] Agent Gateway CRE workflow with x402
- [ ] Cross-Chain Sync CRE workflow
- [ ] Agent dashboard in frontend

### Phase 6: Polish + Video (FINAL — Days 14-16)

**Goal:** Submission-ready

- [ ] Record 3-5 minute demo video showing all CRE workflows executing
- [ ] README with links to every Chainlink-related file
- [ ] Clean up repo, remove dead code from v1
- [ ] Test all flows end-to-end on Base Sepolia
- [ ] Optional: World ID integration for sybil-resistant lottery
- [ ] Optional: Tenderly Virtual TestNet deployment

---

## 14. Submission Checklist

Per hackathon requirements — every track needs:

- [ ] **CRE Workflow** that integrates blockchain + external API/data/LLM/agent
- [ ] **Simulation** — `cre workflow simulate` succeeds, or live CRE deployment
- [ ] **Video** — 3-5 min, publicly viewable, shows workflow execution
- [ ] **Public GitHub repo** with source code
- [ ] **README** with explicit links to all Chainlink-related files:
  - CRE workflow files (`main.ts`, `workflow.yaml`, `config.json`)
  - Smart contracts using VRF, Price Feeds, CCIP
  - Confidential Compute integration
  - Frontend components interacting with Chainlink services
- [ ] **Not a resubmission** — this is a substantial update to the ETHDenver project

### README Link Map (Draft)

```
## Chainlink Integration

### CRE Workflows
- Banker AI: `cre/banker-ai/main.ts`
- Case Value Oracle: `cre/case-oracle/main.ts`
- Market Settlement: `cre/market-settlement/main.ts`
- Agent Gateway: `cre/agent-gateway/main.ts`
- Cross-Chain Sync: `cre/cross-chain/main.ts`

### Smart Contracts
- VRF v2.5: `contracts/DealOrNot.sol` (requestRandomWords, fulfillRandomWords)
- Price Feeds: `contracts/DealOrNot.sol` (AggregatorV3Interface)
- CCIP: `contracts/ccip/CCIPBridge.sol`, `contracts/ccip/CaseCashGateway.sol`
- IReceiver (CRE): `contracts/DealOrNot.sol` (onReport function)

### Confidential Compute
- Case value derivation: `cre/case-oracle/main.ts`
- Sealed banker offers: `cre/banker-ai/main.ts`
```

---

## 15. Resources

### Chainlink Docs
- CRE Documentation: https://docs.chain.link/cre
- CRE TypeScript SDK (full LLM reference): https://docs.chain.link/cre/llms-full-ts.txt
- VRF v2.5: https://docs.chain.link/vrf
- Price Feeds: https://docs.chain.link/data-feeds
- CCIP: https://docs.chain.link/ccip
- Confidential Compute: https://blog.chain.link/chainlink-confidential-compute/

### Ethereum Development
- **ethskills.com** — Modular Ethereum skill guides for AI agents and developers. Use this as a reference for gas optimization, security patterns, deployment checklists, and DeFi integration patterns. When working with Claude, feed relevant ethskills guides for context on Ethereum best practices.

### Hackathon
- Prize tracks: https://chain.link/hackathon/prizes
- FAQ: https://chain.link/hackathon/faq
- Schedule: https://chain.link/hackathon/schedule
- x402 + CRE: https://www.coinbase.com/developer-platform/discover/launches/chainlink-cre-x402

### Our Existing Code
- Repo: https://github.com/rdobbeck/deal-or-not
- Base Sepolia Factory: `0x0B9C8d4211720B73A445eCa6D9DE95263f60D2A9`
- Base Sepolia ZKVerifier: `0x818eb96a58772618af646750764fBA39BAa807D2`
- Base Sepolia CaseRevealVerifier: `0x358b9e0Cf9C92B50841DFf5bA6CAd0C709707738`

---

## 16. Work Split (Decide Saturday)

This section outlines the proposed work split for the Saturday meeting. Nothing here is locked in — we need to discuss and decide together.

### The Two Workstreams

The project naturally splits into **contracts** and **CRE + frontend**. These can run in parallel once we agree on the interface contract between them.

**Workstream A: Contracts & On-Chain**
- Unified `DealOrNot.sol` (new, 26-case, from scratch using existing code as reference)
- `IReceiver` implementation — the `onReport()` function that accepts CRE workflow outputs via KeystoneForwarder
- Factory updates for new game contract
- BriefcaseNFT updates for 26-case unified contract
- `PredictionMarket.sol` (new)
- IBettingPool implementation for CCIP bridge
- VRF v2.5 integration (request + fulfill)
- Price Feed integration
- All Foundry tests
- Base Sepolia deployment

**Workstream B: CRE Workflows + Frontend + Integrations**
- All 5 CRE workflows (Banker AI, Case Oracle, Market Settlement, Agent Gateway, Cross-Chain Sync)
- Port BankerAlgorithm.sol logic to TypeScript for CRE Banker
- Unified Next.js frontend (one game, one flow)
- Prediction market sidebar UI
- Video interstitials during commit-reveal
- AgentRegistry updates + agent dashboard UI
- CCIP gateway contract updates
- Confidential Compute integration
- `cre workflow simulate` for all workflows

### The Handshake: Interface Contract

**This is the thing we MUST agree on Saturday before splitting up.** Both workstreams depend on this shared interface:

```solidity
// === Events the contracts emit (CRE workflows listen to these) ===
event CaseRevealRequested(uint256 indexed gameId, uint256 caseIndex);
event CaseOpened(uint256 indexed gameId, uint256 caseIndex, uint256 value);
event RoundComplete(uint256 indexed gameId, uint256 round);
event BankerOfferMade(uint256 indexed gameId, uint256 round, uint256 offer);
event DealAccepted(uint256 indexed gameId, uint256 offer);
event DealRejected(uint256 indexed gameId, uint256 round);
event GameResolved(uint256 indexed gameId, GameOutcome outcome, uint256 payout);
event FinalCaseRevealed(uint256 indexed gameId, uint256 caseIndex, uint256 value);

// === Functions CRE workflows call (via KeystoneForwarder → IReceiver) ===
function onReport(bytes calldata report) external;  // IReceiver interface
// report types: BANKER_OFFER | CASE_VALUE | MARKET_SETTLEMENT

// === View functions CRE workflows read ===
function getGameState(uint256 gameId) external view returns (...);
function getRemainingValues(uint256 gameId) external view returns (uint256[] memory);
function getCurrentRound(uint256 gameId) external view returns (uint256);
```

### Questions for Saturday

1. **Who takes which workstream?** Natural split based on v1: Ryan → A (contracts), Tippi → B (CRE/frontend). But maybe Ryan wants to touch CRE, or Tippi wants to co-own the unified contract. Discuss.

2. **Do we start fresh or fork?** The PRD says write `DealOrNot.sol` from scratch using v1 as reference. Do we agree? Or does Ryan want to evolve the existing foundry `DealOrNoDeal.sol`?

3. **Solo mode first or multiplayer first?** Phase 1 says solo mode (no lottery, player vs CRE Banker). This is simpler and gets us to a `cre workflow simulate` demo faster. But if Ryan is excited about the lottery/multiplayer flow, we could flip the order.

4. **How do we handle the OZ dependency conflict?** Options: (a) Foundry remappings to isolate CCIP, (b) separate compilation units, (c) skip CCIP until Phase 5. Need to decide before anyone writes imports.

5. **26 cases or 12?** PRD says 26 (show-accurate). But 12 is simpler, CashCase already has the pattern, and for a hackathon demo 12 cases plays faster. The banker algorithm and prize distribution work with either. Trade-off: authenticity vs. shipping speed.

6. **Repo structure for v2?** Do we reorganize (e.g., `contracts/`, `cre/`, `frontend/`) or keep the existing package structure and add to it?

---

## Working Agreements

- **One source of truth for game logic:** `DealOrNot.sol`. No duplicate contracts.
- **CRE workflows are TypeScript.** Use `@chainlink/cre-sdk`.
- **Frontend is one Next.js app.** No mode splits. One game, one flow.
- **Test everything:** `cre workflow simulate` for CRE. Foundry tests for contracts.
- **Base Sepolia is home chain.** CCIP spoke chains are stretch goals.
- **Don't over-engineer.** Ship Phase 1 first. Everything else is bonus.
- **Commit often.** Tag milestones. The video needs to show progression.
