# 💼 Deal or NOT! — Cash Case

**Fully onchain Deal or No Deal with two cryptographic game modes.**

ETHDenver 2026 Hackathon — Built by ryan & tippi fifestarr

## What is this?

Deal or NOT! is an onchain recreation of the classic game show "Deal or No Deal" — but with cryptographic guarantees that make the game provably fair. Players enter a commit-reveal lottery, the winner picks a briefcase, opens cases round by round, and faces the banker's offer: **Deal… or NOT!**

The twist: you get to **choose your cryptography**.

### 🔐 ZK Mode (Groth16 Proofs)

The host pre-assigns all 26 case values and commits a **Merkle root** onchain. When a case is opened, a **Groth16 ZK proof** proves the value was committed at game creation — without revealing the host's salt or other case values.

- Circom circuit: `leaf = Poseidon(caseIndex, value, salt)`
- Merkle tree depth 5 (32 leaves, 26 used)
- Onchain verification via `ZKGameVerifier.sol`
- Trust model: *"I committed to this beforehand"*

### 🐱 Brodinger's Case (Quantum Collapse)

Values **don't exist** until a case is opened. Chainlink VRF provides a seed at game start, and each case "collapses" into a value using **commit-reveal + blockhash entropy**. The player commits which cases to open, waits a block, then reveals — the blockhash from the commit block becomes the entropy.

- `value = hash(vrfSeed, caseIndex, totalOpened, blockhash) % remaining`
- Commit-reveal prevents MEV/bot precomputation
- Chainlink Price Feed converts values to real USD
- 12 briefcases with 3 tiers (Micro / Standard / High)
- AI-generated video interstitials during commit-reveal waits
- Trust model: *"No one could have known"*

## Deployed Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| DealOrNoDealFactory | [`0x78da752e9dbd73a9b0c0f5ddd15e854d2b879524`](https://sepolia.basescan.org/address/0x78da752e9dbd73a9b0c0f5ddd15e854d2b879524) |
| DealOrNoDeal (impl) | [`0xb98e0fb673e5a0c6e15f1d0a9f36e7da954a0d5e`](https://sepolia.basescan.org/address/0xb98e0fb673e5a0c6e15f1d0a9f36e7da954a0d5e) |
| BriefcaseNFT (impl) | [`0xd2bd10d3f2e3a057f0040663b1eebf4d1874feab`](https://sepolia.basescan.org/address/0xd2bd10d3f2e3a057f0040663b1eebf4d1874feab) |
| ZKGameVerifier | [`0xc36e784e1dff616bdae4eac7b310f0934faf04a4`](https://sepolia.basescan.org/address/0xc36e784e1dff616bdae4eac7b310f0934faf04a4) |
| MockGroth16Verifier | [`0xff196f1e3a895404d073b8611252cf97388773a7`](https://sepolia.basescan.org/address/0xff196f1e3a895404d073b8611252cf97388773a7) |
| CashCase (Brodinger's) | [`0x2Db0a160BE59Aea46f33F900651FE819699beb52`](https://sepolia.basescan.org/address/0x2Db0a160BE59Aea46f33F900651FE819699beb52) |
| **DealOrNot (5-case commit-reveal)** | [`0xaB2995091CCE608d1F3f18f36F8e6615aB2fc124`](https://sepolia.basescan.org/address/0xaB2995091CCE608d1F3f18f36F8e6615aB2fc124) |

**CashCase VRF Config (Base Sepolia):**
- VRF Coordinator: `0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE`
- Key Hash: `0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71`
- Subscription ID: `20136374336138753384898843390506225296052091906296406953567310616148092014984`
- Price Feed (ETH/USD): `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1`

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                 │
│  Scaffold-ETH 2 · wagmi · viem · RainbowKit          │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────┐    ┌─────────────────────────────┐ │
│  │  ZK Mode     │    │  Schrödinger's Case Mode    │ │
│  │  (Circom)    │    │  (Chainlink VRF + blockhash)│ │
│  └──────┬───────┘    └──────────┬──────────────────┘ │
│         │                       │                    │
├─────────┴───────────────────────┴────────────────────┤
│                Smart Contracts (Solidity)             │
│                                                      │
│  DealOrNoDealFactory ─── creates game clones (1167)  │
│  DealOrNoDeal ────────── game logic, lottery, banker  │
│  BankerAlgorithm ─────── EV-based offer calculation  │
│  BriefcaseNFT ────────── ERC-721 with onchain SVG    │
│  ZKGameVerifier ──────── Groth16 proof wrapper        │
│  CashCase.sol ────────── Schrödinger's Case variant   │
│                                                      │
├──────────────────────────────────────────────────────┤
│                   Base Sepolia (L2)                   │
└──────────────────────────────────────────────────────┘
```

## Game Flow

```
1. Create Game ─── Host deploys a game clone via factory
2. Open Lottery ── Commit-reveal lottery for fair contestant selection
3. Enter Lottery ─ Players commit hash(secret), pay entry fee
4. Reveal Secrets ─ Players reveal, combined entropy selects winner
5. Select Case ─── Winner picks 1 of 26 briefcases
6. Play Rounds ─── Open cases each round (6, 5, 4, 3, 2, 1, 1, 1, 1, 1)
7. Banker Offer ── Algorithm offers based on EV + variance + context
8. DEAL or NOT! ── Accept the offer or keep playing
9. Final Reveal ── Last two cases opened, payout settled
```

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= v20
- [Yarn](https://yarnpkg.com/) v4+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for ZK Mode contracts)
- [Hardhat](https://hardhat.org/) (for Schrödinger's Case contracts — in `deal/`)

### Environment Setup

```bash
cp .env.example .env.local
```

The `.env.example` includes a **burner wallet** for Claude (Player 3) that can enter the lottery via CLI. Send it some Base Sepolia ETH and it's ready to go.

### Run Locally (Foundry / Scaffold-ETH 2)

```bash
# Clone and install
git clone <repo-url>
cd deal-or-not
yarn install

# Terminal 1: Start local chain
yarn chain

# Terminal 2: Deploy contracts
yarn deploy

# Terminal 3: Start frontend
yarn start
```

Visit `http://localhost:3000`

### Demo with 3 Players (ZK Mode)

ZK Mode requires a lottery with at least 2 players + 1 host. For the demo:

1. **Ryan (browser)** — Creates game, opens lottery
2. **Tippi (incognito browser)** — Enters lottery via frontend
3. **Claude (terminal)** — Enters lottery via CLI script:

```bash
# Source the burner key from .env
source .env.local

# Auto-enter + auto-reveal (polls and waits)
PRIVATE_KEY=$CLAUDE_PRIVATE_KEY ./scripts/claude-auto-player.sh <game-address> 0.0001

# Or step-by-step:
PRIVATE_KEY=$CLAUDE_PRIVATE_KEY ./scripts/claude-player3.sh <game-address> 0.0001
# ... wait for lottery to close ...
PRIVATE_KEY=$CLAUDE_PRIVATE_KEY ./scripts/claude-reveal.sh <game-address>
```

> ⚠️ The Claude wallet is a **burner** — testnet only, never put real funds in it.
> Address: `0xC96Bcb1EACE35d09189a6e52758255b8951a7587`

### Run Tests (Foundry)

```bash
cd packages/foundry
forge test -vvv
```

### Run Tests (Hardhat — Schrödinger's Case)

The Schrödinger's Case contracts live in the `deal/` directory and use Hardhat:

```bash
cd deal
npm install
npx hardhat compile
npx hardhat test
```

Key test files:
- `deal/test/CashCase.test.ts` — Full game flow with VRF
- `deal/test/BrodingerCase.test.ts` — Quantum collapse mechanics
- `deal/test/BrodingerCheatProof.test.ts` — Cheat resistance proofs

### Build ZK Circuits

```bash
cd packages/circuits
npm install
npm run build    # Compiles Circom → WASM + R1CS
npm run setup    # Generates proving/verification keys
```

## Key Contracts

### `DealOrNoDeal.sol` (ZK Mode)
The main game contract. Uses EIP-1167 minimal proxy clones for gas-efficient game creation. Each game is its own contract instance with:
- Commit-reveal lottery system
- 26 briefcases with ZK-verified values
- Sophisticated banker algorithm (EV + variance + context adjustments)
- Progressive jackpot integration
- BriefcaseNFT minting on case reveals

### `CashCase.sol` (Schrödinger's Case)
Alternative game contract where case values don't exist until opened:
- Chainlink VRF v2.5 for seed randomness
- Chainlink Price Feed for USD-denominated values
- Commit-reveal per round (commit cases → wait block → reveal with blockhash)
- Game tiers: Micro ($0.01-$5), Standard ($0.01-$10), High ($0.10-$50)
- AI agent integration support

### `BankerAlgorithm.sol`
Pure library implementing the banker's offer logic:
- Expected value calculation from remaining cases
- Discount curve that increases as rounds progress
- Random variance to make offers less predictable
- Context adjustments (streak detection, endgame psychology)

### `BriefcaseNFT.sol`
ERC-721 NFTs minted for each briefcase:
- Onchain SVG metadata
- Sealed/revealed states
- Transferable collectibles from each game

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, Tailwind CSS, DaisyUI |
| Web3 | wagmi v2, viem, RainbowKit |
| Scaffold | Scaffold-ETH 2 |
| Smart Contracts | Solidity 0.8.x |
| ZK Proofs | Circom 2.1, snarkjs, Groth16 |
| Randomness | Chainlink VRF v2.5 |
| Price Feed | Chainlink ETH/USD |
| Contract Framework | Foundry (ZK Mode), Hardhat (Schrödinger's) |
| Chain | Base Sepolia (primary), localhost |
| NFTs | ERC-721 with onchain SVG |
| Deployment | EIP-1167 Minimal Proxy Clones |

## Project Structure

```
deal-or-not/
├── packages/
│   ├── foundry/           # ZK Mode smart contracts
│   │   ├── contracts/
│   │   │   ├── DealOrNoDeal.sol
│   │   │   ├── DealOrNoDealFactory.sol
│   │   │   ├── BankerAlgorithm.sol
│   │   │   ├── BriefcaseNFT.sol
│   │   │   ├── ZKGameVerifier.sol
│   │   │   └── GameTypes.sol
│   │   ├── script/         # Deployment scripts
│   │   └── test/           # Foundry tests
│   ├── circuits/           # ZK circuits (Circom)
│   │   ├── src/
│   │   │   ├── case_reveal.circom
│   │   │   └── merkle_tree.circom
│   │   └── build/          # Compiled artifacts
│   ├── nextjs/             # Frontend
│   │   ├── app/
│   │   │   ├── page.tsx        # Landing page
│   │   │   ├── game/           # Game lobby + game pages
│   │   │   └── browse/         # Browse all games
│   │   ├── components/game/    # Game UI components
│   │   ├── contracts/          # ABI definitions
│   │   └── hooks/              # Custom wagmi hooks
│   └── api/                # Backend API
│
├── prototype/              # 5-case quantum prototype (playable now!)
│   ├── contracts/          # Foundry — DealOrNot.sol + BankerAlgorithm.sol
│   └── frontend/           # Next.js 16 — npm install && npm run dev
│
deal/                       # Schrödinger's Case contracts (Hardhat)
├── contracts/
│   ├── CashCase.sol
│   └── DealOrNoDeal.sol
├── test/                   # Hardhat tests
├── scripts/                # Deployment + AI agent runner
└── frontend/               # Original Schrödinger's Case frontend
```

## Sponsor Technologies

- **Base** — Primary deployment chain (Base Sepolia)
- **Chainlink** — VRF v2.5 for provably fair randomness, Price Feeds for USD values
- **Scaffold-ETH 2** — Development framework and UI components

## License

MIT

