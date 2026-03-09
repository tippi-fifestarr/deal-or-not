# Gap Analysis: PRD vs Development Plan vs Current State

**Date**: February 28, 2026
**Comparing**:
- PRD: https://github.com/rdobbeck/deal-or-not/blob/main/PRD.md
- Development Plan: `/Users/uni/deal-or-not/DEVELOPMENT_PLAN.md`
- Current State: `prototype/` branch `prototype-12boxupgrade-uni`

---

## March 2026 Update — Gaps Filled

Since Ryan wrote this analysis on Feb 28, many critical gaps have been filled. Here's the delta:

| Gap (Feb 28) | Status (Mar 3) | How |
|---|---|---|
| No progressive jackpot | **FILLED** | `SponsorJackpot.sol` + CRE sponsor-jackpot workflow |
| Missing 4/5 CRE workflows | **4 built** | confidential-reveal, sponsor-jackpot, game-timer, banker-ai |
| No Banker AI | **FILLED** | CRE banker-ai workflow + Gemini 2.5 Flash + BestOfBanker gallery |
| No Confidential Compute | **FILLED** | CRE Confidential Compute replaces commit-reveal for case values |
| No CCIP | **FILLED** | DealOrNotGateway (ETH Sepolia) + DealOrNotBridge (Base Sepolia) |
| 2/5 Chainlink products | **5/5 + Gemini** | VRF, Price Feeds, CRE, CCIP, Confidential Compute, + Google Gemini |
| No BriefcaseNFT | Still missing | Not yet integrated into prototype |
| No Factory pattern | Still missing | Prototype uses single contract, not clones |
| No World ID | Still missing | Not yet implemented |
| No lottery system | Still missing | Prototype is single-player |

**Bottom line:** The prototype now demonstrates all 5 Chainlink products working together with an AI-powered banker. The remaining gaps (NFTs, Factory, World ID, lottery) are UX/scale features, not core security or integration gaps.

**Deployed and tested E2E on Base Sepolia:**
- DealOrNotConfidential: `0xd9D4A974021055c46fD834049e36c21D7EE48137`
- SponsorJackpot: `0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95`
- BestOfBanker: `0x05EdC924f92aBCbbB91737479948509dC7E23bF9`
- DealOrNotGateway: `0xaB2995091CCE608d1F3f18f36F8e6615aB2fc124` (ETH Sepolia)
- DealOrNotBridge: `0xcF3B0d1575b30B53d8Db4EDe30Ebb47D51a2650a` (Base Sepolia)

---

## Executive Summary (Original Feb 28)

The current development plan is **focused on core gameplay MVP** (good for shipping), but **misses several PRD features** that are relevant for the Chainlink Convergence Hackathon. The PRD envisions a broader platform with live game show elements, while the plan focuses on building a solid game first.

**Critical Gaps** (if targeting hackathon):
1. No BriefcaseNFT implementation
2. No Factory pattern for game cloning
3. No World ID integration for sybil-resistant lottery
4. No progressive jackpot mechanism
5. No lottery/contestant selection system
6. Missing 4 out of 5 CRE workflows from PRD

**Status**: The prototype has a **working 5-case game** with VRF, commit-reveal, and Phase 2 auto-reveal. It's a strong foundation but diverges from the PRD's hackathon-optimized vision.

---

## 1. Game Design Differences

### PRD Vision
- **12 or 26 cases** (undecided in PRD, leaning toward 12)
- **Two play modes**: Solo (quick play) and Multiplayer (lottery-based)
- **Lottery system**: Commit-reveal for contestant selection
- **World ID integration**: One entry per human (sybil resistance)
- **Progressive jackpot**: Accumulates across games

### Current State (Prototype)
- **5 cases, 4 rounds** - Simplified for prototyping
- **Single-player only** - No lottery, no multiplayer
- **No World ID** - Not implemented
- **No jackpot** - Each game is independent

### Development Plan
- **Phase 4: Multi-Player Mode** - Includes competitive/cooperative modes
  - ✅ Recognizes need for multi-player
  - ❌ Missing lottery system specifically
  - ❌ Missing World ID integration
  - ❌ Missing progressive jackpot

**Gap**: Plan should explicitly include:
- Lottery contestant selection (commit-reveal)
- World ID for sybil resistance
- Progressive jackpot contract mechanism
- Upgrade from 5 cases to 12 cases

---

## 2. Smart Contracts

### PRD Smart Contracts

| Contract | Purpose | Current State | Plan Status |
|----------|---------|---------------|-------------|
| **DealOrNot.sol** (unified) | Main game logic | ✅ Exists (5-case version) | ✅ In Phase 1 |
| **DealOrNoDealFactory.sol** | EIP-1167 clone factory, progressive jackpot | ❌ Not in prototype | ❌ Not in plan |
| **BriefcaseNFT.sol** | On-chain SVG ERC-721, tier-based coloring | ❌ Not in prototype | ❌ Not in plan |
| **AgentRegistry.sol** | Agent registration, leaderboard | ❌ Not in prototype | 🔶 Stretch goal only |
| **PredictionMarket.sol** | Betting on game outcomes | ❌ Not in prototype | 🔶 Stretch goal only |
| **CCIP Bridge contracts** | Cross-chain play | ❌ Not in prototype | ✅ Phase 7 (planned) |

**Missing from Plan**:
1. **Factory Pattern** (EIP-1167 clones)
   - Multiple concurrent games
   - Gas-efficient game creation
   - Progressive jackpot pooling

2. **BriefcaseNFT**
   - Tokenized game assets
   - On-chain SVG generation
   - Tier-based visual rarity
   - Secondary market potential

**Why These Matter**:
- **Factory**: PRD assumes multiple games running concurrently. Current prototype = 1 game at a time.
- **NFTs**: PRD targets DeFi & Tokenization track ($20K/$12K/$8K prizes). No NFTs = can't compete in that track.

---

## 3. CRE Workflows

### PRD Workflows (5 Total)

| Workflow | Purpose | PRD Priority | Current State | Plan Status |
|----------|---------|--------------|---------------|-------------|
| **1. Banker AI** | AI-generated offers with LLM | Primary (main demo) | ❌ Not built | ❌ Excluded (intentionally) |
| **2. Case Value Oracle** | Confidential Compute for hidden values | High | ❌ Not built | ✅ Phase 3 (planned) |
| **3. Market Settlement** | Settle prediction markets on game events | Medium | ❌ Not built | 🔶 Stretch goal only |
| **4. Agent Gateway** | x402-authenticated agent API | Medium | ❌ Not built | 🔶 Stretch goal only |
| **5. Cross-Chain Sync** | CCIP message orchestration | Medium | ❌ Not built | ✅ Phase 7 (planned) |

**Currently Built**:
- **Auto-Reveal Workflow** (Phase 2) - Not in PRD, but useful UX improvement

**Gap**: The PRD has **5 CRE workflows** for the hackathon. The plan has **1 workflow built** (auto-reveal) and plans **1 more** (Confidential Compute). Missing:
- Prediction market settlement
- Agent gateway
- Cross-chain orchestration

**Note**: The PRD identifies "Banker AI Workflow" as the **primary demo** for the hackathon, but the plan explicitly excludes AI Banker. This is a **strategic divergence** - PRD optimized for hackathon judging, plan optimized for shipping a real product.

---

## 4. Chainlink Product Integration

### PRD Integration Map

| Product | PRD Role | Current State | Plan Status |
|---------|----------|---------------|-------------|
| **VRF v2.5** | Seed randomness for case assignment + lottery | ✅ Implemented (game seed) | ✅ Phase 1 |
| **Price Feeds** | ETH/USD conversion | ✅ Implemented | ✅ Phase 1 |
| **CRE** | 5 workflows (banker, oracle, settlement, agent, sync) | 🟡 1 of 5 built | 🟡 Partial (2 of 5 planned) |
| **CCIP** | Cross-chain play | ❌ Not built | ✅ Phase 7 (planned) |
| **Confidential Compute** | Hidden case values | ❌ Not built | ✅ Phase 3 (planned) |

**Current Integration**: 2 of 5 Chainlink products (VRF, Price Feeds)
**Planned Integration**: 5 of 5 products (adding CRE, CCIP, Confidential Compute)

**Gap**: Confidential Compute and CCIP are planned but not yet scoped in detail. The plan needs:
- Specific Confidential Compute implementation steps
- CCIP contract architecture
- CRE workflow code (beyond auto-reveal)

---

## 5. Frontend & UX

### PRD UX Flow

| Feature | PRD Section | Current State | Plan Status |
|---------|-------------|---------------|-------------|
| **Home/Lobby** | 9.1 | ❌ Single game only | ✅ Phase 4 (multi-player lobby) |
| **Game Creation (Host)** | 9.2 | ✅ Basic version | ✅ Exists |
| **Lottery Entry** | 9.3 | ❌ Not built | ❌ Not in plan |
| **Game Loop** | 9.4 | ✅ Working | ✅ Phase 1 |
| **Prediction Market Sidebar** | 9.5 | ❌ Not built | 🔶 Stretch goal |
| **Game Over** | 9.6 | ✅ Basic | ✅ Exists |
| **Agent Dashboard** | 9.7 | ❌ Not built | 🔶 Stretch goal |

**Missing from Plan**:
- Lottery entry system (commit-reveal + World ID)
- Multi-game lobby (browse active games)
- Spectator mode (watch live games)
- Real-time prediction market UI

**Frontend Polish (Phase 5)** covers animations/sound but doesn't address the structural UX features from PRD.

---

## 6. Hackathon-Specific Features

The PRD is optimized for **Chainlink Convergence Hackathon** (Feb 6 – Mar 8, 2026). The development plan doesn't mention the hackathon context.

### PRD Track Targets

| Track | Prize | PRD Strategy | Plan Addresses? |
|-------|-------|--------------|-----------------|
| **Prediction Markets** | $16K/$10K/$6K | Every game is a betting event | 🔶 Stretch goal only |
| **CRE & AI** | $17K/$10.5K/$6.5K | 5 CRE workflows + AI banker | 🟡 Partial (auto-reveal built, banker excluded) |
| **Privacy** | $16K/$10K/$6K | Confidential Compute for case values | ✅ Phase 3 (planned) |
| **DeFi & Tokenization** | $20K/$12K/$8K | BriefcaseNFTs + jackpot primitive | ❌ Not in plan |
| **Autonomous Agents** | $5K/$3.5K/$1.5K | CRE-powered agent brains | 🔶 Stretch goal only |
| **World ID + CRE** | $5K/$3K/$1.5K | Sybil-resistant lottery | ❌ Not in plan |

**If targeting hackathon**, the plan is **underoptimized** for:
- DeFi & Tokenization (missing NFTs entirely)
- Prediction Markets (stretch goal, not core)
- Autonomous Agents (stretch goal)
- World ID (not mentioned)

**If not targeting hackathon**, the plan is **well-optimized** for shipping a real product incrementally.

---

## 7. Scale: Single Game vs Multi-Game Platform

### PRD Assumption
- **Multiple concurrent games** via Factory pattern
- **Spectators watch live games** and bet on outcomes
- **Progressive jackpot** grows across all games
- **Leaderboards** track player/agent performance

### Current Prototype
- **One game at a time** - `createGame()` creates a single game in the contract
- **No spectator mode** - Only the player sees the game
- **No jackpot accumulation** - Each game is independent
- **No leaderboards** - No persistent player data

### Development Plan
- **Phase 4: Multi-Player Mode** mentions "Lobby system (join games)" but doesn't specify Factory pattern
- **Phase 5: Frontend Polish** mentions "Game history leaderboard"
- No mention of progressive jackpot

**Gap**: The plan needs to explicitly add:
- Factory pattern for concurrent games (Phase 3.5 or 6.5)
- Spectator mode and game browsing (Phase 5 or separate phase)
- Progressive jackpot mechanism (Phase 6 or separate)

---

## 8. Architecture Mismatches

### PRD Architecture (Section 5)
```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Game UI      │  │ Pred Market  │  │ Agent Dash   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                 ┌────────┴────────┐
                 │                 │
          ┌──────▼──────┐   ┌─────▼────────┐
          │   Factory   │   │ CCIP Bridge  │
          │   .sol      │   │   Contracts  │
          └──────┬──────┘   └──────────────┘
                 │
       ┌─────────┼──────────────┐
       │         │              │
   ┌───▼───┐ ┌──▼──────┐ ┌─────▼──────┐
   │ Game  │ │Briefcase│ │Prediction  │
   │ .sol  │ │NFT.sol  │ │Market.sol  │
   └───┬───┘ └─────────┘ └────────────┘
       │
   Chainlink DON
   ├── VRF v2.5
   ├── Price Feeds
   ├── CRE (5 workflows)
   ├── CCIP
   └── Confidential Compute
```

### Current Prototype Architecture
```
┌─────────────────────────────────┐
│    Frontend (Next.js)           │
│  ┌──────────────┐               │
│  │ Game UI only │               │
│  └──────────────┘               │
└─────────────────────────────────┘
              │
       ┌──────▼──────┐
       │ DealOrNot   │ (single game, no factory)
       │   .sol      │
       └──────┬──────┘
              │
       ┌──────▼──────────────┐
       │  Chainlink (2 of 5) │
       │  - VRF v2.5         │
       │  - Price Feeds      │
       └─────────────────────┘
```

**Gaps**:
- No Factory
- No NFTs
- No Prediction Markets
- No CCIP
- No Confidential Compute (yet)
- 1 CRE workflow instead of 5

---

## 9. What's Actually Missing from the Plan

### Critical (Core Gameplay)
1. ✅ **Scale from 5 → 12 cases** - Mentioned but not scoped
2. ❌ **Factory pattern for concurrent games** - Not in plan
3. ❌ **Lottery contestant selection** - Not in plan
4. ❌ **World ID integration** - Not in plan
5. ❌ **Progressive jackpot** - Not in plan

### Important (Tokenization & Monetization)
6. ❌ **BriefcaseNFT contract and minting** - Not in plan
7. ❌ **NFT metadata and SVG generation** - Not in plan
8. 🔶 **Prediction markets** - Stretch goal, should be Phase 6 or 7

### Nice-to-Have (But in PRD)
9. 🔶 **Agent gameplay** - Stretch goal (appropriate)
10. 🔶 **x402 payments** - Stretch goal (appropriate)
11. ❌ **Spectator mode** - Not mentioned
12. ❌ **Multi-game lobby** - Partial (Phase 4 mentions "join games")

### Documentation & Deployment
13. ❌ **Hackathon submission video** - Not in plan
14. ❌ **Tenderly Virtual TestNets deployment** - Not in plan
15. ❌ **Live game show format** (stream, sponsors) - Not in plan (appropriate for post-MVP)

---

## 10. Recommendations

### If Targeting Hackathon (March 8, 2026 deadline)
**Priority additions to the plan:**

1. **Phase 2.5: NFT Integration** (before or parallel to Phase 3)
   - Implement BriefcaseNFT.sol
   - Mint NFTs on game completion
   - On-chain SVG generation
   - Targets DeFi & Tokenization track

2. **Phase 3.5: Factory Pattern** (before multi-player)
   - DealOrNoDealFactory.sol
   - EIP-1167 minimal proxy clones
   - Progressive jackpot accumulation
   - Multiple concurrent games

3. **Phase 4: Multi-Player Lottery** (expand existing Phase 4)
   - Lottery contestant selection (commit-reveal)
   - World ID integration (sybil resistance)
   - Spectator mode
   - Targets World ID + CRE track

4. **Phase 6: Prediction Markets** (move from stretch goals)
   - GamePredictionMarket.sol
   - CRE settlement workflow
   - Real-time betting UI
   - Targets Prediction Markets track ($16K)

5. **Phase 9: Hackathon Submission**
   - 3-5 min demo video
   - Deploy to Tenderly Virtual TestNets
   - Public GitHub repo polish
   - README with all Chainlink integrations

### If Not Targeting Hackathon (Product Focus)
**Current plan is good** - incremental, focused on core gameplay. But still add:

1. **Factory pattern** somewhere (Phase 6 or separate)
   - Needed for production scale
   - Multiple games is core to "game show" experience

2. **NFTs** at some point
   - Collectibles add engagement
   - Secondary market = revenue stream
   - Not urgent for MVP

3. **Explicitly document decision to exclude Banker AI**
   - PRD calls it "primary demo"
   - Plan excludes it (good choice for product)
   - Should document the tradeoff

---

## 11. PRD Features by Plan Phase

Here's where PRD features **would** fit in the current plan structure:

### Phase 1 ✅
- 5-case game
- VRF v2.5
- Price Feeds
- Basic commit-reveal

### Phase 2 ✅
- CRE auto-reveal workflow

### **Phase 2.5** ❌ (Missing)
- BriefcaseNFT.sol
- NFT minting on game completion
- On-chain SVG generation

### Phase 3 ✅ (Planned)
- Confidential Compute
- Threshold encryption
- TEE enclaves

### **Phase 3.5** ❌ (Missing)
- DealOrNoDealFactory.sol
- EIP-1167 clone pattern
- Progressive jackpot
- Concurrent games

### Phase 4 🟡 (Partial)
- ✅ Multi-player mode
- ❌ Lottery system
- ❌ World ID integration
- ❌ Spectator mode

### Phase 5 ✅
- Frontend polish (animations, sound, etc.)

### Phase 6 ✅
- Prize pools & monetization
- Entry fees

### **Phase 6.5** ❌ (Missing)
- Prediction markets (move from stretch goals)
- CRE settlement workflow
- Betting UI

### Phase 7 ✅
- CCIP cross-chain

### Phase 8 ✅
- Deployment & launch

### **Phase 9** ❌ (Missing)
- Hackathon-specific
- Demo video
- Tenderly deployment
- Submission materials

---

## 12. Bottom Line

### What the Plan Does Well
- ✅ Focuses on core gameplay MVP
- ✅ Incremental phases with clear goals
- ✅ Recognizes Confidential Compute importance
- ✅ Plans for CCIP integration
- ✅ Separates stretch goals clearly

### What the Plan Misses
- ❌ Factory pattern for concurrent games
- ❌ BriefcaseNFT contract
- ❌ Lottery system + World ID
- ❌ Progressive jackpot
- ❌ Prediction markets as core (not stretch goal)
- ❌ Hackathon context entirely
- ❌ Scale assumptions (1 game vs many games)

### Strategic Question
**Is this project for the hackathon or for production?**

- **If hackathon**: Add Phases 2.5, 3.5, 6.5, 9. Move prediction markets to core. Target tracks explicitly.
- **If production**: Current plan is good. Add Factory (Phase 6 or 7) and NFTs (Phase 8 or separate) when ready.

The PRD is hackathon-optimized. The plan is product-optimized. **Pick one strategy and commit.**

---

## 13. Next Actions

1. **Decide: Hackathon or Product?**
   - Hackathon deadline: March 8, 2026
   - If hackathon: Revise plan with missing phases
   - If product: Document why PRD features are deferred

2. **Add to Plan (Either Way)**:
   - Factory pattern (needed for multi-game scale)
   - BriefcaseNFT (if targeting DeFi track or want tokenization)
   - Lottery system (if multi-player is priority)

3. **Update Development Plan**:
   - Add missing phases or explicitly exclude them
   - Clarify 5-case vs 12-case decision
   - Document relationship to PRD

4. **Sync with Team** (if hackathon team exists):
   - PRD was written for "Tippi + Ryan"
   - Current work appears to be solo
   - Clarify if hackathon is still the goal
