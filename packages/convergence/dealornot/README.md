# Deal or NOT — Frontend

Next.js 16 frontend for Deal or NOT on Base Sepolia. Convergence edition.

## Quick Start

```bash
cd packages/convergence/dealornot
bun install
bun run dev
```

Open http://localhost:3000, connect MetaMask to Base Sepolia.

## Deployed Addresses (Base Sepolia 84532)

All addresses are hardcoded in `lib/config.ts` — no `.env` needed.

| Contract | Address |
|----------|---------|
| **DealOrNotQuickPlay** | `0x46B6b547A4683ac5533CAce6aDc4d399b50424A7` |
| **Bank** | `0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB` |
| **SponsorVault** | `0x14a26cb376d8e36c47261A46d6b203A7BaADaE53` |
| **BestOfBanker** | `0x55100EF4168d21631EEa6f2b73D6303Bb008F554` |
| **DealOrNotBridge** (CCIP) | `0xB233eFD1623f843151C97a1fB32f9115AaE6a875` |
| **AgentRegistry** | `0x2eDE9C65F4Ff33F4190aee798478bb579f248F52` |
| **SharedPriceFeed** | `0x9AB27e309E677c0ec488E37E8F3B193958D2bBc7` |
| VRF Coordinator | `0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE` |
| ETH/USD Price Feed | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` |
| CRE Keystone Forwarder | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` |

## Game Flow

1. **New Game** — calls `createGame()`, requests Chainlink VRF seed
2. **Pick Your Case** — choose 1 of 5 briefcases (value unknown — quantum superposition)
3. **Rounds 1-3** — CRE confidential case opening:
   - Select a case -> **Open Case** (1 TX — no commit-reveal needed)
   - CRE enclave computes the collapsed value using VRF seed + game secret
   - **Ring the Banker** -> on-chain offer calculated with EV + variance + psychology
   - **DEAL** (accept offer, game over) or **NO DEAL** (next round)
4. **Final Decision** — 2 cases remain: **KEEP** your case or **SWAP**
5. **Game Over** — all cases revealed, final payout shown + jackpot if sponsored

## Sponsor Jackpot (CRE Log Trigger)

A CRE log-trigger workflow adds to the jackpot on each case opening. The amount is drawn from the range between the 2nd-highest and highest remaining case values. If the player goes "no deal" all the way, they can claim the jackpot. Games have a 10-minute timer — if the game expires, the jackpot is returned to the sponsor.

## Tech Stack

- Next.js 16, React 19, TypeScript
- wagmi v2 + viem v2 + TanStack Query
- Tailwind CSS 4
- Chainlink VRF v2.5 + Price Feeds (ETH/USD)
- Chainlink CRE (Confidential Compute + Cron Workflows)

## Case Values

$0.01, $0.05, $0.10, $0.50, $1.00

## Watch Mode (Spectator UX)

No wallet needed. Spectate any game in real time.

- `/watch` — lobby with game ID input + "jump to latest" shortcut
- `/watch/[id]` — full spectator view with sidebar, rotating sponsor ads, event log
- Channel controls: ◀ Choose Game ▶ to navigate between games
- Ads are seeded by gameId for deterministic per-game shuffle order

## Sponsor Ads

Typed ad system in `lib/ads.ts` with `SponsorAd` interface. Unified `RotatingAd` component supports `sidebar` and `break` variants. Sponsor logos in `public/sponsors/`.

Current sponsors: Ceptor Club, Chainlink, letswritean.email, Wingbird Enterprises, CyberJam, ENS, Deal or NOT, Rick Roll University, The Banker's Therapy Fund.

**Future**: Refactor `SponsorJackpot` into separate `Sponsor` and `Jackpot` contracts. Sponsors write ads on-chain by sending funds — the Sponsor contract stores ad text/logo and forwards funds to the Jackpot. The frontend reads ads from the Sponsor contract instead of the static `lib/ads.ts` array.

### Running Tests

```bash
# E2E browser tests (Playwright)
bun run test:e2e              # headless
bun run test:e2e:headed       # with browser visible
bun run test:e2e:ui           # Playwright UI mode

# Unit tests
npx tsx --test lib/ads.test.ts
```

E2E specs in `e2e/`: homepage, watch lobby, watch game (spectator), agents, markets.

## Known Issues

### Banker Message Timing

The AI Banker's Gemini-generated message is written on-chain in two places:
1. **Game contract** — via `setBankerOfferWithMessage()` (writeReport #1, emits `BankerMessage` event) — **reliable**
2. **BestOfBanker gallery** — via `saveQuote()` (writeReport #2) — **sometimes fails** due to CRE nonce collision

The frontend reads from BestOfBanker (`useBankerMessage` hook), so when writeReport #2 fails, no message is found. The UI shows "The Banker is composing a message..." for up to 8 seconds, then falls back to a generic quote.

**TODO**: Read the message from the `BankerMessage` event log (always present in writeReport #1) instead of relying on BestOfBanker. The message is already on-chain — the frontend just needs to read from event logs.

### Progress Bar at GameOver

Fixed: progress bar now shows 4/4 (green) at GameOver and FinalRound phases.

## Key Files

| File | Purpose |
|------|---------|
| `lib/config.ts` | All contract addresses and chain config |
| `lib/abi.ts` | Contract ABI (from forge output) |
| `lib/ads.ts` | Sponsor ad data (typed `SponsorAd[]`) |
| `lib/ads.test.ts` | Tests for seeded shuffle + ad data validation |
| `hooks/useGameContract.ts` | All contract read/write hooks |
| `components/game/GameBoard.tsx` | Main game orchestrator (9 phases) |
| `components/game/CommitReveal.tsx` | CRE-powered 1-step case opening UX |
| `components/game/BankerOffer.tsx` | DEAL/NO DEAL modal with quality bar |
| `components/RotatingAd.tsx` | Unified rotating ad component (sidebar + break variants) |
| `app/watch/page.tsx` | Watch lobby page |
| `app/watch/[id]/page.tsx` | Spectator view for a specific game |
| `types/game.ts` | Phase enum, GameState, SponsorAd interfaces |
