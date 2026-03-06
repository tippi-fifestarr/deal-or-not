# Scripts — Deal or NOT

Shell scripts for running the full game flow from the command line. Use these alongside the browser UI or for fully CLI-based testing.

## Prerequisites

Install these before running any scripts:

```bash
# 1. bash 4+ (macOS ships bash 3.2 which WILL NOT work)
brew install bash
bash --version   # should show 5.x

# 2. Foundry (for cast CLI)
curl -L https://foundry.paradigm.xyz | bash && foundryup

# 3. CRE CLI v1.2.0+
curl -sSL https://cre.chain.link/install.sh | bash

# 4. python3 (usually pre-installed on macOS)
python3 --version
```

## Setup

```bash
# 1. Ensure .env.example exists (testnet burner keys — already in repo)
cat prototype/.env.example

# 2. If using Alchemy RPC, create frontend/.env.local:
echo "NEXT_PUBLIC_ALCHEMY_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY" > prototype/frontend/.env.local

# 3. For AI Banker, add Gemini key:
echo "GEMINI_API_KEY=your-key" >> prototype/workflows/.env

# 4. Log in to CRE (creates account at cre.chain.link if needed)
cre login
```

## Quick Start

```bash
# Terminal 1: Auto-orchestrator (watches game, runs CRE workflows)
cd prototype
./scripts/cre-support.sh <GAME_ID> 5

# Terminal 2: Play the game
./scripts/play-game.sh create          # wait ~10s for VRF
./scripts/play-game.sh state <GID>     # check phase
./scripts/play-game.sh pick <GID> 2    # pick case #2
./scripts/play-game.sh open <GID> 0    # open case #0
# cre-support.sh handles reveal + banker automatically
./scripts/play-game.sh state <GID>     # see banker offer
./scripts/play-game.sh accept <GID>    # or: reject, keep, swap
```

## Script Reference

| Script | Purpose | Usage |
|--------|---------|-------|
| `env.sh` | Shared environment (keys, addresses, PATH) | `source scripts/env.sh` |
| `game-state.sh` | Display game state | `./scripts/game-state.sh <GID>` |
| `play-game.sh` | All player actions | `./scripts/play-game.sh <cmd> [args]` |
| `cre-support.sh` | Auto-orchestrator (polls + runs CRE) | `./scripts/cre-support.sh <GID> [poll_s]` |
| `cre-reveal.sh` | Run confidential-reveal workflow | `./scripts/cre-reveal.sh <TX_HASH>` |
| `cre-banker.sh` | Run AI banker workflow | `./scripts/cre-banker.sh <TX_HASH>` |
| `cre-jackpot.sh` | Run sponsor-jackpot workflow | `./scripts/cre-jackpot.sh <TX_HASH>` |
| `cre-timer.sh` | Run game-timer workflow (cron) | `./scripts/cre-timer.sh` |

### `play-game.sh` Commands

| Command | Description |
|---------|-------------|
| `create` | Create a new game (deployer pays) |
| `pick <GID> <CASE>` | Pick your case (0-4) |
| `open <GID> <CASE>` | Open a case (triggers CRE reveal) |
| `ring <GID>` | Manual banker offer (no AI message) |
| `accept <GID>` | Accept the deal |
| `reject <GID>` | Reject the deal |
| `keep <GID>` | Keep your case (final round) |
| `swap <GID>` | Swap your case (final round) |
| `state <GID>` | Show game state |

## Full Game Walkthrough

### Terminal 1 — CRE Auto-Orchestrator

```bash
cd prototype
./scripts/cre-support.sh 15 5
# Watches game #15, polls every 5 seconds
# Automatically runs cre-reveal, cre-banker, cre-jackpot as needed
```

### Terminal 2 — Player Actions

```bash
cd prototype

# Create game
./scripts/play-game.sh create
# Output: "Game created. Next ID: 16 (yours is 15)"
# Wait ~10 seconds for VRF callback

# Check state (should be "Created" after VRF)
./scripts/play-game.sh state 15

# Pick your case
./scripts/play-game.sh pick 15 2

# Open cases one by one (cre-support handles reveals)
./scripts/play-game.sh open 15 0
# Wait for cre-support to show "Phase: BankerOffer"

# Decide: deal or not
./scripts/play-game.sh reject 15   # keep playing
./scripts/play-game.sh open 15 1   # open another case

# Eventually: accept deal or reach final round
./scripts/play-game.sh accept 15   # take the money
# OR
./scripts/play-game.sh keep 15     # keep your case
./scripts/play-game.sh swap 15     # swap your case
```

## Manual Fallbacks

When `cre-support.sh` isn't running or fails to find events:

```bash
# 1. Open a case and capture the TX hash
./scripts/play-game.sh open 15 3
# Output: TX: 0xabc...

# 2. Run reveal manually
./scripts/cre-reveal.sh 0xabc...
# Output shows the reveal TX hash (e.g., 0xdef...)

# 3. Run banker manually (use the REVEAL tx, not the open tx)
./scripts/cre-banker.sh 0xdef...

# 4. If banker fails, use manual offer (no AI message)
./scripts/play-game.sh ring 15
```

## Timing Reference

| Step | Duration | Notes |
|------|----------|-------|
| VRF callback | ~10s | Chainlink VRF on Base Sepolia |
| CRE reveal | ~5s | Confidential enclave compute + on-chain write |
| CRE banker (with Gemini) | ~5-10s | Gemini 2.5 Flash API call + on-chain write |
| Full open→offer cycle | ~10-15s | reveal + banker back-to-back |

**Important**: When scripting or polling, keep all waits/sleeps to **10-12 seconds max**. The full pipeline (open case → reveal → banker offer) completes in under 15 seconds on Base Sepolia.

## Known Issues

### BestOfBanker Nonce Collision

The `cre-banker` workflow does two `writeReport` calls in the same simulation:
1. `writeReport` #1 → `setBankerOfferWithMessage()` on the game contract (**always works**)
2. `writeReport` #2 → `saveQuote()` on BestOfBanker gallery (**sometimes fails** — nonce collision)

Both writes use the same deployer key and the CRE simulate mode can assign the same nonce to both, causing "replacement transaction underpriced" on the second TX.

**Impact**: The game offer and Gemini message are written to the game contract (writeReport #1) and emitted as a `BankerMessage` event. But the BestOfBanker gallery contract may not receive the message. The frontend's `useBankerMessage` hook reads from BestOfBanker, so it may not find the message.

**Current mitigation**: The frontend shows "The Banker is composing a message..." for up to 8 seconds, then falls back to a generic banker quote.

**Proper fix (TODO)**: Read the banker message from the `BankerMessage` event log instead of (or in addition to) the BestOfBanker contract. The message is already on-chain in writeReport #1 — we just need the frontend to read it from event logs.

## Environment Variables

Set by `env.sh` (sourced by all other scripts):

| Variable | Source | Description |
|----------|--------|-------------|
| `CONTRACT` | Hardcoded | DealOrNotConfidential address |
| `BEST_OF_BANKER` | Hardcoded | BestOfBanker address |
| `RPC_URL` | `.env.local` or fallback | Base Sepolia RPC |
| `DEPLOYER_KEY` | `.env.example` | Testnet deployer private key |
| `PLAYER_KEY` | `.env.example` | Testnet player private key |
| `GEMINI_API_KEY` | `secrets.yaml` | For AI banker (optional) |
