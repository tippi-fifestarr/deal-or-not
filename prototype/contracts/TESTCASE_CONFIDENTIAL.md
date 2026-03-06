# Testing DealOrNotConfidential — End-to-End with CRE

Full story of getting `cre simulate --broadcast` working, every gotcha we hit, and how to reproduce a clean E2E test from scratch.

## Prerequisites

1. **CRE CLI** installed (`cre --version` → 1.2.0+)
2. **Foundry** installed (`cast --version`)
3. **Bun** installed for workflow deps (`bun --version`)
4. **Gemini API key** — get one at https://aistudio.google.com/apikey

## One-Time Setup

```bash
cd prototype

# Install workflow dependencies (all 4 workflows)
for wf in workflows/confidential-reveal workflows/banker-ai workflows/sponsor-jackpot workflows/game-timer; do
  (cd "$wf" && bun install)
done

# Create workflows/.env with your Gemini key (gitignored)
cat > workflows/.env << 'EOF'
GEMINI_API_KEY_ALL=<your-gemini-key>
CRE_SECRET_ALL=deal-or-not-enclave-entropy-v1
EOF

# CRE login (one-time)
cre login
```

## Critical: Set CRE Forwarder After Every Deploy

**This is the #1 thing that silently breaks everything.**

After deploying or redeploying `DealOrNotConfidential`, you MUST set the CRE forwarder to the MockKeystoneForwarder:

```bash
source scripts/env.sh

# Set forwarder on game contract
cast send "$CONTRACT" "setCREForwarder(address)" 0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5 \
  --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL"

# Verify
cast call "$CONTRACT" "creForwarder()(address)" --rpc-url "$RPC_URL"
# Must return: 0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5
```

**What happens if you forget**: The MockKeystoneForwarder calls `onReport()` on your contract. Inside `onReport()`, `msg.sender` is the forwarder address. If `creForwarder` points to the deployer instead, the contract reverts with `NotCREForwarder()` (selector `0x1a20e753`). The forwarder TX shows `status: 1` but emits `result: false` in its event data. This looks like a replay protection issue but it's just a wrong address.

**The function is `setCREForwarder` (NOT `setForwarder`).**

**How to debug**: Run `cast run <forwarder-tx-hash> --rpc-url $RPC_URL` to see the internal trace and revert reason.

## Full E2E Test (CLI Mode)

```bash
cd prototype
source scripts/env.sh

# 1. Create game
zsh scripts/play-game.sh create
# Wait ~10s for VRF callback

# 2. Check state — should be Created (1)
zsh scripts/play-game.sh state <GID>

# 3. Pick your case
zsh scripts/play-game.sh pick <GID> 3

# 4. Launch CRE auto-support (runs in background)
zsh scripts/cre-support.sh <GID> &

# 5. Open cases, reject offers, repeat
zsh scripts/play-game.sh open <GID> 0
# Wait ~30s for CRE reveal + Gemini banker
zsh scripts/play-game.sh state <GID>    # Should be BankerOffer (5)
zsh scripts/play-game.sh reject <GID>

zsh scripts/play-game.sh open <GID> 1
# Wait ~30s
zsh scripts/play-game.sh reject <GID>

zsh scripts/play-game.sh open <GID> 2
# Wait ~30s — goes to FinalRound (6)

# 6. Final round — keep or swap
zsh scripts/play-game.sh keep <GID>
# Wait ~20s — CRE reveals remaining cases, GameOver

# 7. Check final state
zsh scripts/play-game.sh state <GID>    # Should be GameOver (8) with payout
```

## Full E2E Test (Browser Mode)

```bash
# Terminal 1: Frontend
cd prototype/frontend && npm run dev

# Terminal 2: CRE Support
cd prototype && source scripts/env.sh
# Create game in browser at localhost:3000, then:
zsh scripts/cre-support.sh <GID>
# Play in browser — script auto-handles everything
```

**Important**: Games created via `cast send` (deployer key) can only be played via `cast send`. Games created in the browser (MetaMask) can only be played in the browser. The addresses are different.

## What Gets Tested

| Feature | Verified By |
|---|---|
| VRF seed generation | Game advances from WaitingForVRF → Created |
| Confidential HTTP entropy | `cre-reveal.sh` logs "CRE entropy fetched" |
| Case value written on-chain | Game state shows `Collapsed: N` incrementing |
| Gemini AI Banker personality | `cre-banker.sh` logs "Gemini returned: ..." |
| BestOfBanker gallery save | `cre-banker.sh` logs "BestOfBanker saved: tx=..." |
| Banker offer on-chain | Game state shows non-zero Banker Offer |
| Final round event index | `keepCase`/`swapCase` → CRE reveal succeeds (event index 1) |
| Game completion | Phase reaches GameOver (8) with final payout |

## Gotchas We Hit (and their fixes)

### 1. `NotCREForwarder` revert (the big one)

**Symptom**: `cre simulate --broadcast` succeeds (simulation logs look perfect), but game state doesn't change. Forwarder TX has `status: 1` but `result: false`.

**Root cause**: `creForwarder` on contract set to deployer address, not MockKeystoneForwarder.

**Fix**: `cast send "$CONTRACT" "setCREForwarder(address)" 0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5`

### 2. `{{.geminiApiKey}}` template not resolved in simulate mode

**Symptom**: Gemini returns "API key not valid" — the literal string `{{.geminiApiKey}}` was sent as the header.

**Root cause**: ConfidentialHTTPClient template syntax is only resolved inside the real CRE enclave, not in simulate mode.

**Fix**: `cre-banker.sh` temporarily injects the API key from `GEMINI_API_KEY_ALL` env var into `config.staging.json`, then restores it after the run. `gemini.ts` uses `runtime.config.geminiApiKey || "{{.geminiApiKey}}"` — config for simulate, template for production.

### 3. Final round `invalid bigint literal`

**Symptom**: CRE reveal fails with "invalid bigint literal" when processing `keepCase`/`swapCase` TX.

**Root cause**: `keepCase()` emits `CaseKept` at log index 0 and `CaseOpenRequested` at log index 1. The script was passing event index 0 (correct for `openCase`, wrong for `keepCase`).

**Fix**: `cre-support.sh` passes `EVENT_IDX=1` for WaitingFinalCRE (phase 7).

### 4. `replacement transaction underpriced` on BestOfBanker

**Symptom**: Second `writeReport` in banker-ai workflow fails with nonce collision.

**Root cause**: Two rapid `writeReport` calls in the same workflow (game contract + BestOfBanker) — the CRE simulate mode sometimes reuses the same nonce.

**Status**: Non-critical — the game offer still goes through. BestOfBanker save is in a try/catch. Sometimes works, sometimes doesn't. Asking Chainlink devrel about patterns for multiple writes.

### 5. Static WorkflowExecutionID (potential future issue)

**Symptom**: After many games, `cre simulate --broadcast` may silently fail — forwarder rejects the report.

**Root cause**: MockKeystoneForwarder tracks `(receiver, executionId, reportId)` tuples for replay protection. The `executionId` is static per workflow in simulate mode.

**Workaround per Thomas (Chainlink devrel)**: Redeploy receiver contract. He's providing feedback to the team about static executionIds.

### 6. mathjs.org scientific notation

**Symptom**: `BigInt()` throws "invalid bigint literal" when mathjs returns `4.43e+5`.

**Fix**: Already handled in `confidential-reveal/main.ts` with `BigInt(Math.floor(Number(entropyText.trim())))`.

## Event Index Reference

| TX Source | Log 0 | Log 1 | Log 2 |
|---|---|---|---|
| `openCase()` | CaseOpenRequested | — | — |
| `keepCase()` | CaseKept | CaseOpenRequested | — |
| `swapCase()` | CaseSwapped | CaseOpenRequested | — |
| CRE reveal TX | CaseRevealed | RoundComplete | ForwarderEvent |

## Contract Addresses (Base Sepolia)

| Contract | Address | Forwarder Set? |
|---|---|---|
| DealOrNotConfidential | `0xd9D4A974021055c46fD834049e36c21D7EE48137` | Yes (2026-03-06) |
| BestOfBanker | `0x05EdC924f92aBCbbB91737479948509dC7E23bF9` | Yes |
| SponsorJackpot | `0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95` | Check |
| MockKeystoneForwarder | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` | N/A |

## CRE Workflow Architecture

```
Player: openCase(gameId, caseIndex)
  → CaseOpenRequested event (log index 0)
    → CRE #1: confidential-reveal
        Confidential HTTP → mathjs.org randomInt (entropy)
        hash(vrfSeed, caseIndex, usedBitmap, creEntropy) → value
        writeReport → fulfillCaseValue()
    → CRE #2: sponsor-jackpot (optional, needs sponsor registered)
  → CaseRevealed + RoundComplete events
    → CRE #3: banker-ai
        Read game state → compute EV offer
        Confidential HTTP → Gemini 2.5 Flash (snarky message)
        writeReport #1 → setBankerOfferWithMessage() (game contract)
        writeReport #2 → saveQuote() (BestOfBanker gallery)

Player: keepCase() / swapCase()
  → CaseKept/CaseSwapped (log 0) + CaseOpenRequested (log 1)
    → CRE #1: confidential-reveal (event index 1, not 0!)
    → No banker in FinalRound
  → GameOver
```
