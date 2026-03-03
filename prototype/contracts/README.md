# Deal or NOT — Prototype Contracts & Testing Guide

**5-case CRE Confidential prototype on Base Sepolia.**

7 contracts, 2 CCIP contracts, 4 CRE workflows. Playable now.

## Contract Addresses (Base Sepolia)

| Contract | Address |
|---|---|
| **DealOrNotConfidential** | [`0xd9D4A974021055c46fD834049e36c21D7EE48137`](https://sepolia.basescan.org/address/0xd9D4A974021055c46fD834049e36c21D7EE48137) |
| **SponsorJackpot** | [`0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95`](https://sepolia.basescan.org/address/0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95) |
| **BestOfBanker** | [`0x05EdC924f92aBCbbB91737479948509dC7E23bF9`](https://sepolia.basescan.org/address/0x05EdC924f92aBCbbB91737479948509dC7E23bF9) |
| **DealOrNotGateway** (ETH Sepolia) | [`0xaB2995091CCE608d1F3f18f36F8e6615aB2fc124`](https://sepolia.etherscan.io/address/0xaB2995091CCE608d1F3f18f36F8e6615aB2fc124) |
| **DealOrNotBridge** (Base Sepolia) | [`0xcF3B0d1575b30B53d8Db4EDe30Ebb47D51a2650a`](https://sepolia.basescan.org/address/0xcF3B0d1575b30B53d8Db4EDe30Ebb47D51a2650a) |
| CRE Keystone Forwarder | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` |
| ETH/USD Price Feed | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` |

## CRE Workflow Trigger Map

Every round of gameplay involves multiple CRE workflow runs. Here's what fires when:

```
Player: openCase(gameId, caseIndex)
  --> CaseOpenRequested event
    --> CRE #1: confidential-reveal   (writes case value)        cre-reveal.sh <TX>
    --> CRE #2: sponsor-jackpot       (adds jackpot amount)      cre-jackpot.sh <TX>  (optional)
  --> After reveal writes --> RoundComplete event
    --> CRE #3: banker-ai             (sets offer + Gemini msg)  cre-banker.sh <REVEAL_TX>

Player: rejectDeal() --> back to openCase
Player: acceptDeal() --> GameOver

FinalRound: keepCase() / swapCase()
  --> CaseOpenRequested for remaining cases
    --> CRE #1: confidential-reveal   (writes final values)      cre-reveal.sh <TX>
    --> NO banker-ai (skips FinalRound — phase != AwaitingOffer)
  --> GameOver

Independent (no player action needed):
  --> CRE #4: game-timer (cron every 10 min)                     cre-timer.sh  (optional)
      Expires stale games, clears their jackpots
```

**Key points:**
- `sponsor-jackpot` is optional — the game works without it, just no jackpot accumulates
- `game-timer` is optional — only matters for testing game expiry
- `banker-ai` triggers on the **reveal TX** (which contains `RoundComplete`), not the original `openCase` TX
- In FinalRound, the banker doesn't make an offer — the player just keeps or swaps

## Game Phases

| Phase | Name | What Happens |
|---|---|---|
| 0 | WaitingForVRF | Game created, waiting for VRF callback (~60s) |
| 1 | Created | VRF done, player can pick a case |
| 2 | Round | Player can open cases |
| 3 | WaitingCRE | Case opened, waiting for CRE reveal |
| 4 | AwaitingOffer | Cases revealed, waiting for banker AI |
| 5 | BankerOffer | Offer is set, player decides Deal or NOT |
| 6 | FinalRound | 2 cases left — keep or swap |
| 7 | WaitingFinalCRE | Final case opened, waiting for CRE reveal |
| 8 | GameOver | Game finished |

## Two Testing Modes

### CLI Mode (cast + scripts)

All actions via `play-game.sh`, all CRE via scripts. Good for Claude, automated testing, spectator demos.

**Who**: Claude, developers testing in terminal

**How it works**: You run every command yourself — player actions AND CRE simulates.

### Browser Mode (wallet + UI)

Player acts in the frontend at `localhost:3000`. Someone (Claude, you, Ryan) runs CRE simulates in a terminal when the game gets stuck in WaitingCRE or AwaitingOffer.

**Who**: Player in browser, helper in terminal

**How it works**: Player creates game / picks case / opens cases in the UI. When the UI shows "Waiting for CRE..." or "Waiting for Banker...", the terminal helper runs the appropriate `cre-*.sh` script.

## Scripts Reference

| Script | Purpose | Usage |
|---|---|---|
| `play-game.sh create` | Create a new game | No args |
| `play-game.sh state <GID>` | Show game state | Game ID |
| `play-game.sh pick <GID> <CASE>` | Pick your case (0-4) | Game ID, case index |
| `play-game.sh open <GID> <CASE>` | Open a case | Game ID, case index |
| `play-game.sh ring <GID>` | Manual banker (no Gemini) | Game ID |
| `play-game.sh accept <GID>` | Accept the deal | Game ID |
| `play-game.sh reject <GID>` | Reject the deal | Game ID |
| `play-game.sh keep <GID>` | Keep case (final round) | Game ID |
| `play-game.sh swap <GID>` | Swap case (final round) | Game ID |
| `cre-reveal.sh <TX>` | CRE confidential reveal | openCase TX hash |
| `cre-banker.sh <REVEAL_TX>` | AI Banker + Gemini | reveal TX hash |
| `cre-jackpot.sh <TX>` | Sponsor jackpot (optional) | openCase TX hash |
| `cre-timer.sh` | Game timer (optional) | No args |

## Full E2E Walkthrough (CLI Mode)

```bash
# 0. Setup
cd prototype
source scripts/env.sh

# 1. Create game
zsh scripts/play-game.sh create
# Wait ~60s for VRF callback

# 2. Check state — should be phase=Created (1)
zsh scripts/play-game.sh state <GID>

# 3. Pick your case
zsh scripts/play-game.sh pick <GID> 3

# === ROUND 1 ===

# 4. Open a case → get TX hash from output
zsh scripts/play-game.sh open <GID> 0

# 5. CRE reveal (writes case value)
zsh scripts/cre-reveal.sh <OPEN_TX>

# 6. (Optional) CRE jackpot
zsh scripts/cre-jackpot.sh <OPEN_TX>

# 7. Check state — should be phase=AwaitingOffer (4)
zsh scripts/play-game.sh state <GID>

# 8. AI Banker (pass the REVEAL tx, not the original open tx)
#    The reveal TX hash is printed at the end of cre-reveal.sh output
zsh scripts/cre-banker.sh <REVEAL_TX>

# 9. Check state — phase=BankerOffer (5), see offer + Gemini message
zsh scripts/play-game.sh state <GID>

# 10. Deal or NOT!
zsh scripts/play-game.sh reject <GID>    # NO DEAL!
# or
zsh scripts/play-game.sh accept <GID>    # DEAL!

# === ROUND 2 (repeat steps 4-10 with a different case) ===
# === ROUND 3 (same pattern) ===

# === FINAL ROUND ===
# After 3 rounds of normal play, 2 cases remain.
# Phase becomes FinalRound (6).
# Open remaining case(s), run CRE reveal (no banker), then:
zsh scripts/play-game.sh keep <GID>      # Keep your case
# or
zsh scripts/play-game.sh swap <GID>      # Swap your case
```

**Shortcut — manual banker (no Gemini):**
```bash
# Uses on-chain calculateBankerOffer() + setBankerOffer()
# Skips CRE entirely — no Gemini message, no BestOfBanker gallery entry
zsh scripts/play-game.sh ring <GID>
```

## Full E2E Walkthrough (Browser Mode)

```bash
# Terminal 1: Start frontend
cd prototype/frontend && npm run dev

# Browser: Connect wallet at localhost:3000
# Browser: Create game → wait for VRF (~60s)
# Browser: Pick case → open case

# Terminal 2: Run CRE when UI shows "Waiting..."
cd prototype
source scripts/env.sh

# When UI says "Waiting for CRE reveal..."
zsh scripts/cre-reveal.sh <TX_FROM_UI>

# When UI says "Waiting for Banker..."
zsh scripts/cre-banker.sh <REVEAL_TX>

# Back in browser → see banker offer + Gemini message → Deal or NOT!
```

**Tip:** The TX hash from `openCase` is visible in the browser's wallet confirmation or the terminal's transaction receipt. The reveal TX hash is printed at the end of `cre-reveal.sh` output.

## Gemini API Key

The AI Banker workflow uses Google Gemini 2.5 Flash for personality messages. The API key is loaded from `workflows/.env`:

```bash
# Create workflows/.env with your Gemini key
echo "GEMINI_API_KEY=your_key_here" > prototype/workflows/.env
```

`cre-banker.sh` reads this file, temporarily injects the key into `config.staging.json` for the CRE run, then removes it after (via trap cleanup).

Without a Gemini key, the banker-ai workflow still computes the offer but uses a fallback message.

## Post-Deploy Checklist

After redeploying contracts, update these files:
1. `scripts/env.sh` — CONTRACT, BEST_OF_BANKER addresses
2. `workflows/*/config.staging.json` — contract addresses
3. `frontend/lib/config.ts` — contract addresses
4. Root `README.md` — deployed contracts table
5. Set CRE forwarder on new contracts: `cast send <NEW_CONTRACT> "setForwarder(address)" 0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5`
6. Fund VRF subscription if needed

## Building Contracts

```bash
cd prototype/contracts
forge build
forge test
```

## Deploying

```bash
# Deploy DealOrNotConfidential
forge script script/DeployConfidential.s.sol --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_KEY

# Deploy SponsorJackpot
forge script script/DeploySponsorJackpot.s.sol --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_KEY

# Deploy BestOfBanker
forge script script/DeployBestOfBanker.s.sol --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_KEY
```
