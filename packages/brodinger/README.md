# Cash Case — On-Chain Deal or No Deal

A fully on-chain implementation of Deal or No Deal built for ETHDenver 2026. Two real players, real stakes, provably fair randomness via Chainlink VRF, and USD-denominated values via Chainlink Price Feeds.

## 🎯 Overview

Cash Case is a genuine two-player game of strategy, psychology, and probability where the blockchain is the entire game engine. The banker isn't a house algorithm—it's another person who funded the prize pool and is watching their money ride on your decisions.

### Key Features

- **Provably Fair Shuffling** — Chainlink VRF v2.5 ensures fair case value assignment
- **Real USD Values** — Chainlink Price Feeds convert ETH to USD in real-time
- **Commit-Reveal Mechanics** — Prevents front-running and bot attacks
- **Multi-Chain Support** — Deploy on Base Sepolia, 0G Newton Testnet, and ADI Chain
- **AI Agent System** — Autonomous agents can play games with various strategies
- **Cross-Chain Betting** — CCIP bridge enables betting across chains
- **Game Tiers** — MICRO ($0.01–$5), STANDARD ($0.01–$10), HIGH ($0.10–$50)

## 🏗️ Architecture

```
┌──────────────────────────────────────────────┐
│           Next.js Frontend (wagmi)           │
│  Auto network switch · Auto fund · 2 roles   │
├──────────────────────────────────────────────┤
│         CashCase.sol (Solidity)               │
│  State machine · Commit-reveal · Escrow      │
├────────────────────┬─────────────────────────┤
│  Chainlink VRF v2.5 │  Chainlink Price Feed  │
│  Fair case shuffle   │  ETH/USD conversion    │
└────────────────────┴─────────────────────────┘
```

### Game Phases

```
WaitingForPlayer → WaitingForVRF → RevealCase → CommitRound → 
WaitingForReveal → BankerOffer → CommitFinal → WaitingForFinalReveal → GameOver
```

### Brodinger's Case Design

Values don't exist until observed. Each case opening uses commit-reveal with blockhash entropy to prevent precomputation attacks. The opening order matters—same seed, different order = different outcomes.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- MetaMask or compatible wallet
- Hardhat node (for local development)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd deal

# Install dependencies
npm install

# If you encounter dependency conflicts, try:
# npm install --legacy-peer-deps

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### Local Development

```bash
# Compile contracts
npx hardhat compile

# Run unit tests
npx hardhat test

# Start local Hardhat node
npx hardhat node

# In another terminal, deploy contracts
npx hardhat run deploy/02-deploy-cashcase.ts --network localhost

# Start auto-VRF fulfiller (replace addresses from deploy output)
VRF_COORDINATOR_ADDRESS=0x... GAME_ADDRESS=0x... \
  npx hardhat run scripts/auto-fulfill-vrf.ts --network localhost

# Start frontend (replace address from deploy output)
cd frontend
NEXT_PUBLIC_CONTRACT_ADDRESS=0x... npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and connect MetaMask. The app will auto-add the Hardhat network and auto-fund your account with 100 ETH for testing.

## 📁 Project Structure

```
deal/
├── contracts/
│   ├── CashCase.sol              # Main game contract (Brodinger's Case)
│   ├── DealOrNoDeal.sol          # Original game contract
│   ├── AgentRegistry.sol         # AI agent registration
│   ├── ccip/
│   │   ├── CCIPBridge.sol        # Cross-chain betting (Avalanche)
│   │   ├── CaseCashGateway.sol   # Cross-chain betting (Base)
│   │   └── IBettingPool.sol      # Betting pool interface
│   └── mocks/                    # Mock contracts for testing
├── test/
│   ├── CashCase.test.ts          # CashCase unit tests
│   ├── DealOrNoDeal.test.ts      # Original game tests
│   ├── AgentRegistry.test.ts     # Agent system tests
│   └── CCIPBridge.test.ts        # Cross-chain tests
├── deploy/
│   ├── 00-deploy-mocks.ts        # Deploy mock contracts
│   ├── 01-deploy-game.ts         # Deploy DealOrNoDeal
│   ├── 02-deploy-cashcase.ts     # Deploy CashCase
│   ├── 03-deploy-registry.ts     # Deploy AgentRegistry
│   └── 04-deploy-ccip.ts         # Deploy CCIP contracts
├── scripts/
│   ├── auto-fulfill-vrf.ts       # Auto-fulfill VRF requests
│   ├── agent-runner.ts           # Run AI agents
│   └── play-game.ts              # CLI game player
├── frontend/
│   ├── app/
│   │   ├── page.tsx              # Main game UI
│   │   └── agents/page.tsx      # Agent dashboard
│   └── lib/
│       └── contracts.ts          # Contract ABIs and config
├── e2e/                          # Playwright E2E tests
├── hardhat.config.ts             # Hardhat configuration
├── JUDGES.md                     # Hackathon pitch document
└── plans.md                      # Development roadmap
```

## 🧪 Testing

### Unit Tests

```bash
# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/CashCase.test.ts

# Run with gas reporting
REPORT_GAS=true npx hardhat test
```

### End-to-End Tests

```bash
# Run Playwright E2E tests
cd e2e
npx playwright test
```

### Test Coverage

- **89 unit tests** covering all contract paths
- **4 E2E tests** for full game lifecycle
- Settlement verification (zero contract balance after games)
- Multi-game support testing

## 🌐 Multi-Chain Deployment

### Supported Networks

| Chain | Chain ID | RPC | Chainlink Support |
|-------|----------|-----|-------------------|
| Base Sepolia | 84532 | https://sepolia.base.org | Yes (VRF v2.5 + Price Feeds) |
| 0G Newton Testnet | 16602 | https://evmrpc-testnet.0g.ai | No (use mocks) |
| ADI Chain | 36900 | https://rpc.adifoundation.ai/ | No (use mocks) |
| Localhost | 31337 | http://127.0.0.1:8545 | No (use mocks) |

### Deployment Steps

#### Base Sepolia (Real Chainlink)

1. Create VRF subscription at [vrf.chain.link](https://vrf.chain.link) for Base Sepolia
2. Fund subscription with LINK from [faucets.chain.link](https://faucets.chain.link)
3. Get VRF Coordinator address and key hash from [Chainlink docs](https://docs.chain.link/vrf/v2-5/supported-networks)
4. Deploy CashCase via Remix or Hardhat with real Chainlink params
5. Add contract as VRF consumer in subscription dashboard
6. Deploy AgentRegistry (no constructor args)

#### 0G Newton Testnet (Mock Chainlink)

1. Get testnet A0GI from 0G faucet (0.1/day limit)
2. Deploy MockV3Aggregator + VRFCoordinatorV2_5Mock
3. Create subscription + fund it on mock coordinator
4. Deploy CashCase with mock addresses
5. Deploy AgentRegistry
6. Run `auto-fulfill-vrf.ts` pointed at 0G RPC

#### ADI Chain (Mock Chainlink)

1. Bridge ADI/ETH via [bridge.adifoundation.ai](https://bridge.adifoundation.ai)
2. Same mock deployment flow as 0G
3. Run `auto-fulfill-vrf.ts` pointed at ADI RPC

### Environment Variables

Create a `.env` file:

```bash
PRIVATE_KEY=your_private_key_here
BASE_SEPOLIA_RPC=https://sepolia.base.org
ARB_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc
```

## 🎮 Game Mechanics

### Game Values (Standard Tier)

| Case | USD Value |
|------|-----------|
| 1 | $0.01 |
| 2 | $0.05 |
| 3 | $0.10 |
| 4 | $0.25 |
| 5 | $0.50 |
| 6 | $1.00 |
| 7 | $2.00 |
| 8 | $3.00 |
| 9 | $4.00 |
| 10 | $5.00 |
| 11 | $7.50 |
| 12 | $10.00 |

- **Entry fee:** $1.00
- **Banker deposit:** ~$10.50 (max case value + 5% slippage)
- **Rounds:** 5 rounds
- **Cases per round:** 4, 3, 2, 1, 1
- **Banker offer percentages:** 15%, 30%, 45%, 65%, 85%

### Commit-Reveal Flow

1. **Commit** — Player submits `hash(caseIndices, salt)` (TX1)
2. **Wait 1+ block** — Blockhash isn't known yet
3. **Reveal** — Player reveals choices (TX2), collapse uses `blockhash(commitBlock)` as entropy

This prevents bots from precomputing outcomes and aborting unfavorable transactions.

## 🤖 AI Agent System

The AgentRegistry allows autonomous agents to play games with various strategies:

- **Conservative** — Takes deals early
- **Aggressive** — Rejects most offers
- **Statistical** — Calculates expected value
- **Random** — Random decisions
- **LLM-driven** — Optional OpenAI integration

Access the agent dashboard at `/agents` in the frontend.

## 🔗 Cross-Chain Betting

CCIP bridge enables betting on games across chains:

- Place bets on Avalanche
- Settle on Base
- Automatic payout distribution

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contracts | Solidity 0.8.19/0.8.24, Hardhat 2.x |
| Randomness | Chainlink VRF v2.5 (subscription model) |
| Price Oracle | Chainlink Price Feeds (ETH/USD, 8 decimals) |
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Web3 | wagmi v3, viem |
| Testing | Hardhat + Chai (unit), Playwright (E2E) |
| Language | TypeScript end-to-end |

## 📝 Documentation

- [JUDGES.md](./JUDGES.md) — Hackathon pitch and architecture details
- [SITUATION.md](./SITUATION.md) — Current project status and roadmap
- [plans.md](./plans.md) — Detailed development plan

## 🐛 Troubleshooting

### VRF Not Fulfilling

On localhost or chains without Chainlink, run the auto-fulfiller:

```bash
VRF_COORDINATOR_ADDRESS=0x... GAME_ADDRESS=0x... \
  npx hardhat run scripts/auto-fulfill-vrf.ts --network localhost
```

### Frontend Can't Connect

1. Ensure MetaMask is connected to the correct network
2. Check `NEXT_PUBLIC_CONTRACT_ADDRESS` matches deployed contract
3. Verify network is added to wagmi config

### Tests Failing

```bash
# Clear cache and recompile
npx hardhat clean
npx hardhat compile
npx hardhat test
```

## 📄 License

MIT

## 🙏 Acknowledgments

- Built at ETHDenver 2026
- Powered by Chainlink VRF and Price Feeds
- Pair-programmed with Claude

---

**Note:** This project is built for hackathon demonstration. For production use, additional security audits and testing are recommended.
