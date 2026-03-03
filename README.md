# Deal or NOT!

**Onchain Deal or No Deal — provably fair via CRE Confidential Compute, AI Banker via Gemini, cross-chain via CCIP.**

Convergence: A Chainlink Hackathon (Feb 6 – Mar 8, 2026) — Built by Ryan & Tippi Fifestarr

## The Problem We Solved

On a blockchain, every storage slot is public. For a game like Deal or No Deal, that's fatal — if a player can read the case values, they can game the system. We [started this project at ETHDenver](https://devfolio.co/projects/deal-or-not-9c01) and tried three approaches before finding the right one:

1. **Fisher-Yates shuffle** — All values stored on-chain. Anyone can read them with `eth_getStorageAt`. Broken.
2. **ZK proofs (Groth16)** — Host commits a Merkle root, proves values with ZK. But we shipped with a `MockGroth16Verifier` that accepts everything. Broken.
3. **Quantum collapse (commit-reveal)** — Values "don't exist" until opened via `hash(vrfSeed, caseIndex, blockhash)`. Sounds good, but the player can simulate the outcome after the commit block is mined and simply not reveal if the result is bad. Cost of attack: ~$0.005 on Base. Broken.
4. **CRE Confidential Compute** — VRF seed on-chain for fairness + CRE-held secret for privacy + DON attestation for integrity. The player is missing a piece of the puzzle that only exists inside the CRE enclave. **This is the solution.**

The full technical journey is in [`Whitepaper.md`](Whitepaper.md) — it traces each approach, its attack vector, and why we ended up here.

## What We Built for Convergence

Five Chainlink products. Four CRE workflows. One game.

### Chainlink Products Used

| Product | Role | Key Files |
|---|---|---|
| **VRF v2.5** | Provably random seed at game creation — ensures fair case value derivation | [`DealOrNotConfidential.sol`](prototype/contracts/src/DealOrNotConfidential.sol) (`createGame` → VRF request) |
| **CRE Confidential Compute** | Case values derived from `hash(vrfSeed, caseIndex, CRE_SECRET, bitmap)` — player can't precompute | [`confidential-reveal/main.ts`](prototype/workflows/confidential-reveal/main.ts) |
| **CRE + Gemini AI** | AI Banker personality — computes EV-based offer, calls Gemini 2.5 Flash for snarky messages, dual writeReport | [`banker-ai/main.ts`](prototype/workflows/banker-ai/main.ts), [`gemini.ts`](prototype/workflows/banker-ai/gemini.ts) |
| **Price Feeds** | ETH/USD conversion for payouts, $0.02 upvotes on BestOfBanker gallery | [`DealOrNotConfidential.sol`](prototype/contracts/src/DealOrNotConfidential.sol), [`BestOfBanker.sol`](prototype/contracts/src/BestOfBanker.sol) |
| **CCIP** | Cross-chain play — start games from ETH Sepolia, execute on Base Sepolia | [`DealOrNotGateway.sol`](prototype/contracts/src/ccip/DealOrNotGateway.sol), [`DealOrNotBridge.sol`](prototype/contracts/src/ccip/DealOrNotBridge.sol) |

### CRE Workflows (4 total)

| Workflow | Trigger | What It Does | File |
|---|---|---|---|
| **confidential-reveal** | EVM Log: `CaseOpenRequested` | Reads VRF seed + game state from chain, derives case value with CRE secret, writes `fulfillCaseValue()` via Keystone Forwarder | [`main.ts`](prototype/workflows/confidential-reveal/main.ts) |
| **banker-ai** | EVM Log: `RoundComplete` | Computes EV-based banker offer (TypeScript mirror of `BankerAlgorithm.sol`), calls Gemini for personality message, dual writeReport to game contract + BestOfBanker gallery | [`main.ts`](prototype/workflows/banker-ai/main.ts) |
| **sponsor-jackpot** | EVM Log: `CaseOpenRequested` | Picks random jackpot amount from top 2 remaining case values, writes `addToJackpot()` on SponsorJackpot contract | [`main.ts`](prototype/workflows/sponsor-jackpot/main.ts) |
| **game-timer** | Cron (every 10 min) | Scans last 5 games, expires stale ones via `expireGame()`, clears jackpots via `clearExpiredJackpot()` — two writeReport calls to different receivers | [`main.ts`](prototype/workflows/game-timer/main.ts) |

### Smart Contracts

| Contract | Purpose | File |
|---|---|---|
| **DealOrNotConfidential** | Game logic — VRF, CRE case reveals, banker offers, `IReceiver` for Keystone Forwarder | [`src/DealOrNotConfidential.sol`](prototype/contracts/src/DealOrNotConfidential.sol) |
| **BankerAlgorithm** | Pure library — EV calculation, discount curves, VRF-seeded variance, context adjustments | [`src/BankerAlgorithm.sol`](prototype/contracts/src/BankerAlgorithm.sol) |
| **SponsorJackpot** | Sponsor deposits ETH, CRE distributes jackpot per case opening, player claims at game end | [`src/SponsorJackpot.sol`](prototype/contracts/src/SponsorJackpot.sol) |
| **BestOfBanker** | Gallery of AI Banker quotes — CRE writes via `onReport`, readers upvote for $0.02 | [`src/BestOfBanker.sol`](prototype/contracts/src/BestOfBanker.sol) |
| **DealOrNotGateway** | CCIP spoke on ETH Sepolia — accepts `createGame()` with entry fee, sends CCIP message to Base | [`src/ccip/DealOrNotGateway.sol`](prototype/contracts/src/ccip/DealOrNotGateway.sol) |
| **DealOrNotBridge** | CCIP hub on Base Sepolia — receives CCIP message, calls `createGame()` on game contract | [`src/ccip/DealOrNotBridge.sol`](prototype/contracts/src/ccip/DealOrNotBridge.sol) |

## Architecture

```
                              CHAINLINK DON
                    ┌─────────────────────────────────┐
                    │  CRE Workflows:                  │
                    │                                   │
                    │  confidential-reveal              │
                    │    VRF seed + CRE secret          │
                    │    → fulfillCaseValue()            │
                    │                                   │
                    │  banker-ai                        │
                    │    EV offer + Gemini 2.5 Flash     │
                    │    → setBankerOfferWithMessage()   │
                    │    → saveQuote() (BestOfBanker)    │
                    │                                   │
                    │  sponsor-jackpot                  │
                    │    → addToJackpot()                │
                    │                                   │
                    │  game-timer (cron)                │
                    │    → expireGame()                  │
                    │    → clearExpiredJackpot()         │
                    └──────────┬──────────────────────┘
                               │ writeReport via
                               │ Keystone Forwarder
                               ▼
  ETH Sepolia              BASE SEPOLIA
  ┌──────────────┐         ┌─────────────────────────────────┐
  │ Gateway      │  CCIP   │ DealOrNotConfidential           │
  │ (CCIP spoke) │ ──────→ │   + VRF v2.5 + Price Feeds      │
  └──────────────┘         │                                 │
                           │ SponsorJackpot · BestOfBanker   │
                           │ DealOrNotBridge (CCIP hub)      │
                           └─────────────────────────────────┘
                                          ▲
                                          │
                                   ┌──────┴──────┐
                                   │  Frontend   │
                                   │  Next.js    │
                                   └─────────────┘
```

## Deployed Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| **DealOrNotConfidential** | [`0xd9D4A974021055c46fD834049e36c21D7EE48137`](https://sepolia.basescan.org/address/0xd9D4A974021055c46fD834049e36c21D7EE48137) |
| **SponsorJackpot** | [`0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95`](https://sepolia.basescan.org/address/0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95) |
| **BestOfBanker** | [`0x05EdC924f92aBCbbB91737479948509dC7E23bF9`](https://sepolia.basescan.org/address/0x05EdC924f92aBCbbB91737479948509dC7E23bF9) |
| **DealOrNotGateway** (ETH Sepolia) | [`0xaB2995091CCE608d1F3f18f36F8e6615aB2fc124`](https://sepolia.etherscan.io/address/0xaB2995091CCE608d1F3f18f36F8e6615aB2fc124) |
| **DealOrNotBridge** (Base Sepolia) | [`0xcF3B0d1575b30B53d8Db4EDe30Ebb47D51a2650a`](https://sepolia.basescan.org/address/0xcF3B0d1575b30B53d8Db4EDe30Ebb47D51a2650a) |

VRF Coordinator: `0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE` · Price Feed (ETH/USD): `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` · Keystone Forwarder: `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5`

## Game Flow

```
createGame() ──→ VRF generates seed (~60s)
pickCase()   ──→ Choose your case (0-4)
openCase()   ──→ Emits CaseOpenRequested ──→ CRE reveals value
                                           ──→ CRE adds jackpot
             ──→ After reveal: RoundComplete ──→ CRE AI Banker
                   Gemini generates snarky message
                   Offer appears on-chain

Player decides: DEAL (acceptDeal) or NOT (rejectDeal)
  NOT → next round → openCase → CRE reveal → CRE banker → repeat
  DEAL → game over, payout settled

Final Round: 2 cases left → keepCase() or swapCase()
  CRE reveals remaining values → game over
```

## Quick Start

### Run the Frontend

```bash
cd prototype/frontend
npm install
npm run dev
# Visit http://localhost:3000
```

### Play via CLI (with CRE simulates)

```bash
cd prototype
source scripts/env.sh

zsh scripts/play-game.sh create           # Create game (wait ~60s for VRF)
zsh scripts/play-game.sh pick <GID> 3     # Pick case #3
zsh scripts/play-game.sh open <GID> 0     # Open case #0 → get TX hash
zsh scripts/cre-reveal.sh <TX>            # CRE reveals case value
zsh scripts/cre-banker.sh <REVEAL_TX>     # AI Banker + Gemini message
zsh scripts/play-game.sh reject <GID>     # NO DEAL!
```

**Full E2E walkthrough and CRE trigger map:** see [`prototype/contracts/README.md`](prototype/contracts/README.md)

### Build Contracts

```bash
cd prototype/contracts
forge build
forge test
```

## Project Structure

```
deal-or-not/
├── prototype/                 # Active development — CRE Confidential prototype
│   ├── contracts/             # Foundry — DealOrNotConfidential, SponsorJackpot, BestOfBanker, CCIP
│   ├── frontend/              # Next.js — game UI, BestOfBanker gallery
│   ├── workflows/             # CRE workflows (4 total)
│   │   ├── confidential-reveal/   # Case value reveals
│   │   ├── banker-ai/             # AI Banker + Gemini
│   │   ├── sponsor-jackpot/       # Jackpot distribution
│   │   └── game-timer/            # Game expiry cron
│   └── scripts/               # Testing scripts (play-game, cre-reveal, cre-banker, etc.)
│
├── Whitepaper.md              # Technical deep dive — 4 approaches to hiding case values
├── PRD.md                     # Product requirements for Convergence hackathon
├── GAP_ANALYSIS.md            # PRD vs current state
│
├── packages/                  # ETHDenver legacy — ZK Mode + Scaffold-ETH 2
│   ├── foundry/               # 26-case game with ZK proofs (MockGroth16Verifier)
│   ├── circuits/              # Circom ZK circuits
│   └── nextjs/                # Original frontend
│
└── deal/                      # ETHDenver legacy — Brodinger's Case (Hardhat)
    ├── contracts/              # CashCase.sol — quantum collapse (vulnerable to selective reveal)
    └── test/                   # Hardhat tests
```

## Origin: ETHDenver 2026

We [built the first version at ETHDenver](https://devfolio.co/projects/deal-or-not-9c01) in a couple of days. We had two separate game contracts (ZK Mode and Brodinger's Case), a working frontend, and good ideas — but neither approach was actually secure:

- **ZK Mode** shipped with `MockGroth16Verifier` that accepts any proof
- **Brodinger's Case** had a selective reveal vulnerability — the player can simulate `hash(vrfSeed, caseIndex, blockhash)` after the commit block is mined and abort if the result is bad (~$0.005 per attempt on Base)

The Chainlink Convergence hackathon gave us the right tool to fix this: **CRE Confidential Compute**. Values are derived from a combination of a public VRF seed and a private CRE-held secret, making them simultaneously provably fair and computationally private. One transaction per round. No commit-reveal. No trusted scripts.

See the legacy code in `packages/` and `deal/` for the historical approaches, and [`Whitepaper.md`](Whitepaper.md) for the full technical analysis.

## Sponsor Technologies

- **Chainlink** — VRF v2.5 (fairness), CRE Confidential Compute (privacy), CRE HTTP consensus + Gemini (AI Banker), Price Feeds (USD conversion), CCIP (cross-chain play)
- **Google Gemini** — Gemini 2.5 Flash for AI Banker personality messages via CRE HTTP consensus
- **Base** — Primary deployment chain (Base Sepolia)
- **Scaffold-ETH 2** — Development framework and UI components

## License

MIT
