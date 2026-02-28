# Deal or NOT — Frontend

Playable Deal or No Deal with quantum case collapse on Base Sepolia.

## Quick Start

```bash
cd prototype/frontend
npm install
npm run dev
```

Open http://localhost:3000, connect MetaMask to Base Sepolia.

## Before Playing

1. **Add contract as VRF consumer** on the Chainlink VRF subscription (requires the subscription owner wallet):
   - Go to https://vrf.chain.link on Base Sepolia
   - Find subscription `20136374336138753384898843390506225296052091906296406953567310616148092014984`
   - Add `0xaB2995091CCE608d1F3f18f36F8e6615aB2fc124` as a consumer
2. **Import a burner wallet** into MetaMask on Base Sepolia
   - Deployer PK: `0x671ea01f6ac1b2d53d49eea104c69e64680ddecc230e5faed864ecd055fbb6fd`
   - Player PK: `0x7bccdcecede835466aafe20ea5aa11bad825c5bea940473e4f865b8013fc2340`
   - Both have Base Sepolia ETH

## Deployed Addresses (Base Sepolia 84532)

All addresses are hardcoded in `lib/config.ts` — no `.env` needed.

| Contract | Address |
|----------|---------|
| **DealOrNot** (commit-reveal) | `0xaB2995091CCE608d1F3f18f36F8e6615aB2fc124` |
| VRF Coordinator | `0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE` |
| ETH/USD Price Feed | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` |
| LINK Token | `0xE4aB69C077896252FAFBD49EFD26B5D171A32410` |

| Wallet | Address |
|--------|---------|
| Deployer / Host | `0x75a32D24fd4EDB2C5895aCE905dA5Ee1fBD584A1` |
| Player | `0xC96Bcb1EACE35d09189a6e52758255b8951a7587` |

VRF Subscription ID: `20136374336138753384898843390506225296052091906296406953567310616148092014984`

## Game Flow

1. **New Game** — calls `createGame()`, requests Chainlink VRF seed
2. **Pick Your Case** — choose 1 of 5 briefcases (value unknown — quantum superposition)
3. **Rounds 1-3** — commit-reveal to open cases:
   - Select a case -> **Commit** (TX1: hash of choice + salt stored in localStorage)
   - Wait 1 block -> **Reveal** (TX2: case collapses with blockhash entropy)
   - **Ring the Banker** -> on-chain offer calculated with EV + variance + psychology
   - **DEAL** (accept offer, game over) or **NO DEAL** (next round)
4. **Final Decision** — 2 cases remain, commit-reveal: KEEP or SWAP
5. **Game Over** — all cases revealed, final payout shown

## Tech Stack

- Next.js 16, React 19, TypeScript
- wagmi v2 + viem v2 + TanStack Query
- Tailwind CSS 4
- Chainlink VRF v2.5 + Price Feeds (ETH/USD)

## Case Values

$0.01, $0.05, $0.10, $0.50, $1.00

## Key Files

| File | Purpose |
|------|---------|
| `lib/config.ts` | All contract addresses and chain config |
| `lib/abi.ts` | Contract ABI (from forge output) |
| `hooks/useGameContract.ts` | All contract read/write hooks |
| `hooks/useCommitReveal.ts` | Salt generation + localStorage persistence |
| `components/game/GameBoard.tsx` | Main game orchestrator (9 phases) |
| `components/game/CommitReveal.tsx` | Two-step commit -> reveal UX |
| `components/game/BankerOffer.tsx` | DEAL/NO DEAL modal with quality bar |
| `types/game.ts` | Phase enum + GameState interface |
