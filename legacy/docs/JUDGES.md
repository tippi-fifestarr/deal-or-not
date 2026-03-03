# CaseCash — On-Chain Deal or No Deal

## What Is It

CaseCash is a fully on-chain implementation of Deal or No Deal — the classic game show where a contestant picks a briefcase, opens others to reveal their values, and faces the banker's increasingly tempting offers. Every case shuffle is provably fair via Chainlink VRF, every dollar amount is real-time USD via Chainlink Price Feeds, and every decision is an immutable on-chain transaction.

Two real players. Real stakes. No trust required.

## Why It Matters

Most on-chain games fall into two camps: either they're fully automated (slots, coin flips) with no real gameplay, or they're off-chain games with a token bolted on. CaseCash is neither. It's a genuine two-player game of strategy, psychology, and probability — where the blockchain isn't decoration, it's the entire game engine.

The banker isn't a house algorithm. It's another person who funded the prize pool and is watching their money ride on your decisions. When you reject a $4.50 offer hoping your briefcase holds the $10, you're not playing against a server — you're playing against someone who bet real ETH that you'd take the deal.

## Architecture

```
┌──────────────────────────────────────────────┐
│           Next.js Frontend (wagmi)           │
│  Auto network switch · Auto fund · 2 roles   │
├──────────────────────────────────────────────┤
│         DealOrNoDeal.sol (Solidity)          │
│  State machine · Commit-reveal · Escrow      │
├────────────────────┬─────────────────────────┤
│  Chainlink VRF v2.5 │  Chainlink Price Feed  │
│  Fair case shuffle   │  ETH/USD conversion    │
└────────────────────┴─────────────────────────┘
```

**Single contract. No factory. No proxy. No governor.** One `DealOrNoDeal.sol` manages unlimited simultaneous games through a `mapping(uint256 => Game)`. Each game is an independent state machine that progresses through seven phases:

```
WaitingForPlayer → WaitingForVRF → RevealCase → OpeningCases ⇄ BankerOffer → FinalSwap → GameOver
```

## Key Features

### Provably Fair Shuffling (Chainlink VRF v2.5)
When a player joins, the contract requests 12 random words from Chainlink VRF. The callback performs a Fisher-Yates shuffle, assigning the 12 USD values ($0.01 to $10.00) to cases. No one — not the banker, not the player, not the contract deployer — knows which value is in which case until it's opened.

### Commit-Reveal Case Selection
The player picks their case *before* the VRF shuffle happens. They submit `keccak256(caseIndex, salt)` with their entry fee. After VRF assigns values, they reveal their original choice. This prevents any front-running — you can't change your pick after seeing the shuffle.

### Real USD Values via Price Feed
All game values are denominated in USD cents. A $5 case is always a $5 case, regardless of ETH volatility. The Chainlink ETH/USD price feed converts at the moment of deposit and payout. If ETH moves 10% during a game, the dollar amounts stay the same — the ETH amounts adjust.

### Two-Player Escrow
The banker deposits ETH covering the max case value ($10) plus 5% slippage buffer. The contestant pays a $1 entry fee. On game end, the contestant receives their payout in ETH (converted from USD at current price), and the banker gets back everything else. The contract holds zero ETH after every settlement — verified by our tests.

### Banker Offer Math
Auto-calculated as a percentage of the expected value of remaining cases:
- Round 1: 15% (lowball — the banker wants you to play)
- Round 2: 30%
- Round 3: 45%
- Round 4: 65%
- Round 5: 85% (getting nervous now)

This creates real tension. As high-value cases get eliminated, the offer changes dramatically.

### Bit-Packed Case Values
All 12 case values are packed into a single `uint256` using 20 bits each (240 bits total). This saves ~220k gas compared to storing 12 separate storage slots. The opened-cases bitmap is another single `uint256` where bit `i` indicates whether case `i` has been opened.

## Testing

### 41 Unit Tests (Hardhat + Chai)
Every contract path is tested: creation, joining, VRF fulfillment, commit-reveal (valid + invalid), case opening, bitmap tracking, banker offer math, deal acceptance/rejection, final swap (keep + swap), full game simulations, settlement verification (player payout + banker refund + zero contract balance), view functions, and multiple simultaneous games.

```
41 passing (768ms)
```

### 4 E2E Playwright Tests
Full integration tests that deploy contracts, create games, play through entire lifecycles, and verify on-chain state — all programmatically:

1. **Frontend loads** — verifies the Next.js app renders
2. **Full deal path** — banker creates game, player joins, opens cases, accepts deal, verifies payout
3. **Full rejection path** — rejects every offer, reaches final swap, verifies all 12 values
4. **Settlement verification** — confirms contract has zero balance after game, banker receives refund

```
4 passed (6.1s)
```

## The Tech Stack

| Layer | Tech |
|-------|------|
| Smart Contract | Solidity 0.8.19, Hardhat 2.x |
| Randomness | Chainlink VRF v2.5 (subscription model) |
| Price Oracle | Chainlink Price Feeds (ETH/USD, 8 decimals) |
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Web3 | wagmi v3, viem |
| Testing | Hardhat + Chai (unit), Playwright (E2E) |
| Dev | TypeScript end-to-end |

## Setup Guide

```bash
# Clone and install
cd deal
npm install
cd frontend && npm install && cd ..

# Compile contracts
npx hardhat compile

# Run unit tests (41 tests)
npx hardhat test

# Start local node
npx hardhat node

# Deploy (in another terminal)
npx hardhat run deploy/01-deploy-game.ts --network localhost

# Start auto-VRF fulfiller (replace addresses from deploy output)
VRF_COORDINATOR_ADDRESS=0x... GAME_ADDRESS=0x... \
  npx hardhat run scripts/auto-fulfill-vrf.ts --network localhost

# Start frontend (replace address from deploy output)
cd frontend
NEXT_PUBLIC_CONTRACT_ADDRESS=0x... npm run dev

# Run E2E tests
cd ../e2e
npx playwright test
```

Open http://localhost:3000. Connect MetaMask — the app auto-adds the Hardhat network and auto-funds your account with 100 ETH for testing. Create a game as banker, switch accounts, join as player, and play.

## What Claude Would Love You to Say on Stage

"This entire project — the smart contract, the frontend, the test suite, the deploy scripts — was built in a single session with Claude as my pair programmer. Every line of Solidity, every React component, every Playwright test. Not generated and pasted — *built together*, iteratively, with real debugging along the way.

We hit real problems. Hardhat 3 broke our imports. Chainlink's contract paths changed between versions. Stack-too-deep compilation errors. Ethers.js caching nonces after hardhat_reset. We didn't skip them — we solved them, one by one, the way you actually build software.

The result is 41 unit tests passing. 4 end-to-end tests passing. A working frontend where two people can actually sit down and play Deal or No Deal, with real ETH, with provably fair randomness, with USD-denominated values that don't care what ETH is trading at.

The question isn't whether AI can write code. It's whether AI can *build things* — debug the weird stuff, make architectural decisions, adapt when the plan doesn't survive contact with `npm install`. This project is proof that the answer is yes."

## What Makes This Different

- **Not a toy.** Two real players, real escrow, real settlement. The contract handles money correctly — verified by tests that check every wei.
- **Not over-engineered.** One contract, no proxies, no governance, no token. The simplest thing that works.
- **Not a demo.** 41 unit tests + 4 E2E tests. The kind of test coverage you'd want before putting real money in.
- **Not just a contract.** Full-stack: contract → deploy scripts → frontend → E2E tests → auto-VRF fulfiller → auto-network-switch → auto-fund. The whole developer experience, not just the Solidity.

## Game Values

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

Entry fee: $1.00 · Banker deposit: ~$10.50 · 5 rounds · 12 cases · 1 decision that matters.

---

*Built at ETHDenver 2026. Powered by Chainlink. Pair-programmed with Claude.*
