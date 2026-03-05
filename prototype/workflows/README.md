# CRE Workflows — Deal or NOT

Chainlink Runtime Environment (CRE) workflows that automate game mechanics. Each workflow runs as a WASM module inside the DON (Decentralized Oracle Network) with Keystone Forwarder consensus.

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **confidential-reveal** | `CaseOpenRequested` event | Computes case value from VRF seed + deterministic entropy, writes result via Keystone Forwarder |
| **banker-ai** | `RoundComplete` event | Calculates banker offer (EV-based algorithm), calls Gemini LLM for a snarky message, writes offer on-chain |
| **sponsor-jackpot** | `CaseOpenRequested` event | Adds a deterministic random amount to the game's jackpot pool (optional) |
| **game-timer** | Cron (every 10 min) | Scans last 5 games, expires stale ones, clears jackpots for expired sponsored games |
| **agent-gameplay-orchestrator** | Multiple game events | WIP: Calls registered agent APIs to make automated gameplay decisions |

## Prerequisites

1. **CRE CLI v1.2.0+** — install from [CRE docs](https://docs.chain.link/cre/getting-started/cli-installation/linux)
2. **Foundry** (`cast`) — install via `curl -L https://foundry.paradigm.xyz | bash && foundryup`
3. **python3** — for JSON parsing in scripts
4. **bash 4+** — scripts use `readarray`

## Setup

```bash
# 1. Log in to CRE (token expires every 15 min — re-run before each session)
cre login

# 2. Copy environment file
cp .env.example .env
# Edit .env if you need to override contract addresses

# 3. For AI Banker: add Gemini key to .env
echo "GEMINI_API_KEY=your-key-here" >> .env
```

## Quick Start

The fastest way to run the full game flow:

```bash
# Terminal 1: Start CRE auto-orchestrator (watches game state, runs workflows automatically)
cd prototype
./scripts/cre-support.sh <GAME_ID> 5

# Terminal 2: Play via CLI or open the browser UI at localhost:3000
./scripts/play-game.sh create        # creates game, wait ~10s for VRF
./scripts/play-game.sh state <GID>   # check state
./scripts/play-game.sh pick <GID> 2  # pick case #2
./scripts/play-game.sh open <GID> 0  # open case #0 -> cre-support handles the rest
```

## Running Workflows Manually

If `cre-support.sh` isn't running, trigger each workflow by hand:

```bash
# 1. Reveal a case (after player calls openCase)
./scripts/cre-reveal.sh <OPEN_CASE_TX_HASH>

# 2. Get banker offer (after reveal emits RoundComplete)
./scripts/cre-banker.sh <REVEAL_TX_HASH>

# 3. Add to jackpot (optional, same TX as reveal)
./scripts/cre-jackpot.sh <OPEN_CASE_TX_HASH>

# 4. Expire stale games (no TX needed)
./scripts/cre-timer.sh
```

## Game Flow

```
Player: createGame()
  |
  v
[WaitingForVRF] --- Chainlink VRF callback (~10s) ---> [Created]
  |
  v
Player: pickCase(gameId, caseIndex)
  |
  v
[Round] --- Player: openCase(gameId, caseIndex) ---> [WaitingForCRE]
  |                                                       |
  |                              CRE: confidential-reveal |
  |                              CRE: sponsor-jackpot     |
  |                                                       v
  |                                                 [AwaitingOffer]
  |                                                       |
  |                                          CRE: banker-ai
  |                                                       v
  |                                                 [BankerOffer]
  |                                                   /       \
  |                                          accept  /         \ reject
  |                                                 v           v
  |                                          [GameOver]    [Round] (loop)
  |
  +--- After all cases opened ---> [FinalRound]
                                      |
                                   keep / swap
                                      v
                                   [WaitingFinalCRE] ---> [GameOver]
```

## Configuration

Each workflow has:
- `workflow.yaml` — CRE deployment targets (staging/production)
- `config.staging.json` — Contract addresses, chain selector, gas limits
- `config.production.json` — Production overrides
- `secrets.yaml` — Secret declarations (if needed)

The shared `project.yaml` defines RPC endpoints used across all workflows.

### Contract Addresses (Base Sepolia)

| Contract | Address |
|----------|---------|
| DealOrNotConfidential | `0xd9D4A974021055c46fD834049e36c21D7EE48137` |
| SponsorJackpot | `0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95` |
| BestOfBanker | `0x05EdC924f92aBCbbB91737479948509dC7E23bF9` |
| MockKeystoneForwarder (sim) | `0x82300bd7c3958625581cc2f77bc6464dcecdf3e5` |
| KeystoneForwarder (prod) | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |

## Troubleshooting

### "no project settings file found"
You're running `cre workflow simulate` from outside the `workflows/` directory. `cd prototype/workflows` first — the CLI walks up the directory tree looking for `project.yaml`.

### "unauthorized" or token expired
CRE auth tokens expire every 15 minutes. Run `cre login` again.

### Alchemy rate limiting
The scripts scan for events in 10-block windows to stay within Alchemy's free tier. If you still hit limits, increase the poll interval: `./scripts/cre-support.sh <GID> 10`

### Banker has no Gemini message
Add `GEMINI_API_KEY=...` to `workflows/.env`. The `cre-banker.sh` script injects it into `config.staging.json` for the run and removes it after.

### CRE simulate succeeds but no on-chain effect
Make sure you passed `--broadcast`. Without it, the simulate runs in dry-run mode.

## Resources

- [CRE Documentation](https://docs.chain.link/cre)
- [CRE CLI Reference](https://docs.chain.link/cre/reference/cli-reference)
- [CRE TypeScript SDK](https://docs.chain.link/cre/reference/sdk/core-ts)
- [Forwarder Directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts)
