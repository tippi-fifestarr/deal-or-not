# Aptos Port Summary

## What Was Done

### Move Contracts (packages/aptos/)
14 Move modules ported from 16 Solidity contracts. All compile, 41 tests pass.

| # | Move Module | From Solidity | Status |
|---|-------------|---------------|--------|
| 1 | game_math | GameMath.sol | Complete, 6 tests |
| 2 | banker_algorithm | BankerAlgorithm.sol | Complete, 14 tests |
| 3 | price_feed_helper | PriceFeedHelper.sol + SharedPriceFeed.sol | Complete (mock price feed), 5 tests |
| 4 | bank | Bank.sol | Complete, 2 tests |
| 5 | deal_or_not_quickplay | DealOrNotQuickPlay.sol + VRFManager.sol | Complete, 0 tests (needs randomness mock infra) |
| 6 | agent_registry | AgentRegistry.sol | Complete, 3 tests |
| 7 | agent_staking | AgentStaking.sol | Complete, 1 test |
| 8 | deal_or_not_agents | DealOrNotAgents.sol | Complete, 2 tests |
| 9 | seasonal_leaderboard | SeasonalLeaderboard.sol | Complete, 2 tests |
| 10 | prediction_market | PredictionMarket.sol | Complete, 2 tests |
| 11 | best_of_banker | BestOfBanker.sol | Complete, 1 test |
| 12 | sponsor_vault | SponsorVault.sol | Complete, 1 test |
| 13 | ccip_gateway | DealOrNotGateway.sol | Stub (emits event, no real CCIP), 1 test |
| 14 | ccip_bridge | DealOrNotBridge.sol | Stub (no real CCIP), 1 test |

### Frontend Integration (packages/convergence/dealornot/)

**New files created:**
- `lib/aptos/config.ts` — Module address, network, phase constants (7 phases vs EVM's 9), APT decimals
- `components/aptos/AptosWalletProvider.tsx` — Wraps AptosWalletAdapterProvider
- `hooks/aptos/useAptosGame.ts` — `useAptosGameState`, `useAptosEntryFee`, `useAptosGameWrite` hooks
- `contexts/ChainContext.tsx` — Determines `activeChain: "evm" | "aptos" | "none"` based on which wallet is connected
- `e2e/aptos.spec.ts` — 6 Playwright tests for Aptos UI elements

**Modified files:**
- `components/providers/ClientProviders.tsx` — Added AptosWalletProvider + ChainProvider wrapping
- `components/Nav.tsx` — Added standalone APT connect button (NOTE: user wants this inside RainbowKit connect experience instead)
- `app/play/page.tsx` — Aptos game creation flow when Aptos wallet connected
- `app/play/[gameId]/page.tsx` — Full Aptos game board (all 7 phases)
- `package.json` — Added `@aptos-labs/ts-sdk`, `@aptos-labs/wallet-adapter-react`, `@aptos-labs/wallet-adapter-core`

**Build:** Clean, 0 type errors. 6/6 new Playwright tests pass.

### Supporting Files
- `packages/aptos/LEARNING_JOURNAL.md` — Detailed decisions, struggles, and docs recommendations
- `packages/aptos/Move.toml` — Package config with dependencies

---

## What Didn't Change

### EVM Contracts (packages/convergence/contracts/)
Zero changes. All 16 Solidity contracts untouched. 244 Forge tests unaffected.

### Existing Frontend Pages
All existing EVM game flows work exactly as before. The Aptos integration only activates when an Aptos wallet is detected via ChainContext. EVM wallet users see no difference.

### Other Packages
- `prototype/` — Untouched
- `legacy/` — Untouched
- `docs/` — Untouched
- `agent-server/` — Untouched
- CRE workflows — Untouched

---

## What's Not Production-Ready

### Move Contracts
1. **Price Feed**: Uses a mock `PriceFeedState` — needs real Chainlink `data_feeds::router::get_benchmarks()` calls
2. **CCIP**: Gateway and bridge are stubs — need real Chainlink CCIP Aptos package imports
3. **Resolver Service**: No off-chain service exists yet to submit `#[randomness]` TX2 transactions (the two-TX pattern requires this)
4. **Banker AI**: No Gemini integration on Aptos side — needs off-chain service calling `set_banker_offer`
5. **quickplay tests**: No tests due to randomness mocking complexity

### Frontend
1. **Aptos wallet connect UX**: Currently a separate "APT" button — should be integrated into the main connect modal experience
2. **Game ID routing**: `aptos-latest` route doesn't exist — need a way to discover the player's latest Aptos game ID
3. **No Aptos game events**: EventLog component only reads EVM events — Aptos events not wired up
4. **No Aptos balance display**: Play page doesn't show APT balance
5. **No spectator mode for Aptos games**: Watch pages only support EVM
6. **Agent/Market pages**: Not wired to Aptos contracts

---

## Architecture Decisions

### Why Two-TX Randomness (not CRE)
Aptos has no CRE equivalent. Aptos native `#[randomness]` prevents validator bias but not player precomputation. The two-TX pattern (TX1: player records intent, TX2: resolver generates randomness) ensures fairness without requiring a confidential compute layer. See LEARNING_JOURNAL.md for full analysis.

### Why 7 Phases Instead of 9
EVM has WaitingForVRF and WaitingForCRE phases because VRF and CRE are async callbacks. On Aptos, VRF is replaced by instant randomness and CRE by the two-TX pattern, so only WaitingForReveal remains as an async phase.

### Why Separate Wallet Buttons (Current)
RainbowKit only supports EVM wallets. Aptos uses a completely different wallet adapter (`@aptos-labs/wallet-adapter-react`). Merging them into one connect experience requires a custom modal that wraps both — not a trivial change. The current separate button works but the UX should be unified.
