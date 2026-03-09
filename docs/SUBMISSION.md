# Chainlink Convergence Hackathon — Submission Form (Pre-filled)

> **For Ryan to copy-paste into**: https://airtable.com/appgJctAaKPFkMKrW/pagPPG1kBRC0C54w6/form
>
> Fields marked with `*` are required. Fields marked `[RYAN]` need Ryan's input.

### Prize Tracks We're Applying To

| Track | 1st | 2nd | 3rd | Our Qualification |
|-------|-----|-----|-----|-------------------|
| **CRE and AI** | $17,000 | $10,500 | $6,500 | 4 CRE workflows + Gemini AI Banker |
| **Prediction Markets** | $16,000 | $10,000 | $6,000 | PredictionMarket.sol — 4 market types on agent outcomes |
| **Privacy** | $16,000 | $10,000 | $6,000 | CRE Confidential Compute for hidden case values |

Plus **Top 10 Projects** pays $1,500 each ($15k pool). And the **Moltbook Autonomous Agents** track ($5k/$3.5k/$1.5k) may have a separate submission — we qualify with AgentRegistry + AgentStaking + CRE orchestrator.

---

## Project name *

```
Deal or NOT
```

## 1 line project description (under ~80-100 characters) *

```
On-chain Deal or No Deal — AI Banker via CRE + Gemini, provably fair via VRF + CRE Confidential
```

## Full project description *

> Please explain what it is, how it works, and what problem it solves

```
Deal or NOT is an on-chain version of Deal or No Deal where case values are provably fair yet hidden from players — a problem that's fundamentally hard on a public blockchain.

The core problem: every storage slot on-chain is public. We tried three approaches (Fisher-Yates shuffle, ZK proofs, commit-reveal) and each one was broken — attackable for as little as $0.005 on Base. The solution is CRE Confidential Compute: case values are derived from hash(vrfSeed, caseIndex, CRE_SECRET, bitmap) where the VRF seed is on-chain for fairness and the CRE secret lives inside the enclave for privacy. Players can't precompute values because they're missing the secret. After the game, the secret is published for full auditability.

The AI Banker is a CRE workflow that computes an EV-based offer (mirroring an on-chain BankerAlgorithm library), then calls Gemini 2.5 Flash for a personality message — "I'm feeling generous today... or am I? 😏" — and writes both the offer and the quote on-chain via dual writeReport.

Four CRE workflows run the game autonomously:
1. confidential-reveal — derives case values using VRF seed + CRE secret
2. banker-ai — EV calculation + Gemini API for AI personality + dual write to game + BestOfBanker gallery
3. sponsor-jackpot — distributes sponsor-funded prizes per case opening
4. game-timer — cron that expires stale games and clears jackpots

Additional features: cross-chain play via CCIP (ETH Sepolia → Base Sepolia), BestOfBanker gallery where users upvote AI quotes for $0.02 via Price Feeds, autonomous agent gameplay with staking/leaderboards, and prediction markets on agent outcomes.

Five Chainlink products integrated: VRF v2.5, CRE Confidential Compute, CRE + Gemini AI, Price Feeds (ETH/USD), and CCIP.
```

## How is it built? *

```
Smart Contracts: Solidity 0.8.24 on Foundry — DealOrNotConfidential (game logic + VRF + CRE receiver), BankerAlgorithm (pure EV library), SponsorJackpot, BestOfBanker, CCIP Gateway/Bridge, plus agent infrastructure (AgentRegistry, AgentStaking, SeasonalLeaderboard, PredictionMarket). 204 Foundry tests passing.

CRE Workflows: 4 TypeScript workflows deployed to Chainlink CRE — confidential-reveal (EVM Log trigger → case value derivation with enclave secret), banker-ai (EVM Log trigger → EV calc + Gemini 2.5 Flash API → dual writeReport), sponsor-jackpot (EVM Log trigger → jackpot distribution), game-timer (Cron trigger → expire stale games). All use encryptOutput for CRE Confidential Compute.

Frontend: Next.js 16 (App Router) + RainbowKit + Wagmi + Viem + Tailwind/DaisyUI. Pages for game play, spectating, agent arena, prediction markets, BestOfBanker gallery. Deployed at https://dealornot.vercel.app

Architecture: Player creates game → VRF generates seed → player opens cases → CRE enclave derives values using secret from Vault DON → CRE AI Banker computes offer + calls Gemini → player accepts (DEAL) or rejects (NOT) → game resolves on-chain. Cross-chain: CCIP Gateway on ETH Sepolia sends message to Bridge on Base Sepolia.

Chain: Base Sepolia (primary) + ETH Sepolia (CCIP spoke). Started at ETHDenver, rebuilt for Convergence.
```

## What challenges did you run into? *

```
1. Hiding values on a public blockchain — our first three approaches (Fisher-Yates shuffle, ZK proofs with MockGroth16Verifier, commit-reveal quantum collapse) were all broken. The commit-reveal pattern was attackable for ~$0.005 — player simulates the hash after the commit block and aborts if the result is bad. CRE Confidential Compute was the only solution that actually works: the player is missing a piece of the puzzle that only exists inside the enclave.

2. Dual writeReport in CRE — the banker-ai workflow needs to write to two different contracts (game contract for the offer + BestOfBanker for the gallery quote). Getting CRE to do two writeReport calls in a single workflow execution required careful nonce management to avoid collisions.

3. CRE encryptOutput — without encryptOutput: true on ConfidentialHTTPClient calls, the Gemini API responses and entropy values aren't AES-GCM encrypted inside the enclave, meaning DON nodes could potentially see them. This was a subtle security fix we almost missed.

4. Cross-chain timing — CCIP messages from ETH Sepolia to Base Sepolia take ~20 minutes. Combined with VRF callback time (~60s), game creation from the spoke chain requires patience and good UX to communicate the wait.

5. Foundry + ZK — we wanted Groth16 verification on-chain but Foundry doesn't have zkSNARK libraries. We shipped ETHDenver with a MockGroth16Verifier that accepts everything. CRE Confidential turned out to be a better solution anyway — same privacy guarantees without the ZK circuit complexity.
```

## Link to project repo *

```
https://github.com/rdobbeck/deal-or-not
```

## Chainlink Usage *

> Please share the repo link to the specific piece of code that shows how you're using Chainlink in your project

```
VRF v2.5 — game creation + random seed:
https://github.com/rdobbeck/deal-or-not/blob/main/prototype/contracts/src/DealOrNotConfidential.sol

CRE Confidential Compute — case value derivation with enclave secret:
https://github.com/rdobbeck/deal-or-not/blob/main/prototype/workflows/confidential-reveal/main.ts

CRE + Gemini AI — AI Banker personality + EV-based offers:
https://github.com/rdobbeck/deal-or-not/blob/main/prototype/workflows/banker-ai/main.ts
https://github.com/rdobbeck/deal-or-not/blob/main/prototype/workflows/banker-ai/gemini.ts

Price Feeds — ETH/USD for payouts and $0.02 upvotes:
https://github.com/rdobbeck/deal-or-not/blob/main/prototype/contracts/src/BestOfBanker.sol

CCIP — cross-chain game creation (ETH Sepolia → Base Sepolia):
https://github.com/rdobbeck/deal-or-not/blob/main/prototype/contracts/src/ccip/DealOrNotGateway.sol
https://github.com/rdobbeck/deal-or-not/blob/main/prototype/contracts/src/ccip/DealOrNotBridge.sol

CRE Sponsor Jackpot:
https://github.com/rdobbeck/deal-or-not/blob/main/prototype/workflows/sponsor-jackpot/main.ts

CRE Game Timer (cron):
https://github.com/rdobbeck/deal-or-not/blob/main/prototype/workflows/game-timer/main.ts
```

## Project Demo *

> A link to the video demo is mandatory and the video needs to be less than five minutes

```
[RYAN] — Record and upload a 3-5 minute demo video. Suggested flow:

1. Landing page at https://dealornot.vercel.app (~15s)
2. Connect wallet via RainbowKit (~15s)
3. Create a game → show VRF seed arriving (~60s wait, can fast-forward)
4. Pick a case, open cases → show CRE confidential reveal in real-time (~60s)
5. Banker offer arrives with Gemini AI message → show the snarky quote (~30s)
6. Accept or reject deal → show game resolution (~30s)
7. Visit BestOfBanker gallery → upvote a quote (~15s)
8. Show /agents page — agent arena, staking UI (~15s)
9. Briefly show cross-chain CCIP flow if time permits (~15s)

Upload to YouTube (unlisted) or Loom. Paste link here.
```

## Which Chainlink prize track(s) are you applying to? *

```
[x] CRE and AI
[x] Prediction Markets
[x] Privacy
```

## Which sponsor track(s) are you applying to?

```
None — the sponsor tracks are World ID, World Mini Apps, Tenderly, and thirdweb.
We don't use any of these. Skip this field.
```

> **Note on Autonomous Agents**: The $5k/$3.5k/$1.5k agent track is a **Moltbook** prize,
> not a Chainlink prize track dropdown option. It may be judged separately — check if there's
> a separate Moltbook submission or if selecting it happens elsewhere.

## Submitter name *

```
[RYAN] — Ryan Dobbeck (or team name if preferred)
```

## Submitter email *

```
[RYAN]
```

## Are you participating in a team or individually? *

```
Team — Ryan Dobbeck & Tippi Fifestarr
```

---

## Pre-Submission Checklist

- [x] Project description covers use case and stack/architecture
- [ ] 3-5 minute video demo — **[RYAN] needs to record**
- [x] Public repo: https://github.com/rdobbeck/deal-or-not
- [x] README links to all Chainlink usage files
- [x] CRE Workflow built + simulated (4 workflows, all passing `cre simulate`)
- [x] Workflow integrates blockchain with external API (Gemini 2.5 Flash via CRE HTTP consensus)
- [x] Live deployment on Base Sepolia with real CRE workflows
- [x] Frontend deployed: https://dealornot.vercel.app

## Key Links for Ryan

| What | URL |
|------|-----|
| Submission form | https://airtable.com/appgJctAaKPFkMKrW/pagPPG1kBRC0C54w6/form |
| Live frontend | https://dealornot.vercel.app |
| GitHub repo | https://github.com/rdobbeck/deal-or-not |
| Whitepaper | https://github.com/rdobbeck/deal-or-not/blob/main/Whitepaper.md |
| Game contract (Basescan) | https://sepolia.basescan.org/address/0xd9D4A974021055c46fD834049e36c21D7EE48137 |
| ETHDenver origin | https://devfolio.co/projects/deal-or-not-9c01 |
