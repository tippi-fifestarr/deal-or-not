# Scripts — Deal or NOT

Shell scripts for running the full game flow from the command line. Use these alongside the browser UI or for fully CLI-based testing.

## Prerequisites

- **bash 4+** (macOS ships bash 3 — use `brew install bash`)
- **Foundry** (`cast`) — `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- **CRE CLI v1.2.0+** — [install guide](https://docs.chain.link/cre/getting-started/cli-installation/linux)
- **python3** — for JSON parsing
- **CRE login** — run `cre login` before each session (token expires every 15 min)

## Setup

```bash
# 1. Ensure .env.example exists (testnet burner keys — already in repo)
cat prototype/.env.example

# 2. If using Alchemy RPC, create frontend/.env.local:
echo "NEXT_PUBLIC_ALCHEMY_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY" > prototype/frontend/.env.local

# 3. For AI Banker, add Gemini key:
echo "GEMINI_API_KEY=your-key" >> prototype/workflows/.env

# 4. Log in to CRE
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
