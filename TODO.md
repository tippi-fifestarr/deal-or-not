# TODO — Pre-Submission Fixes

Audit findings from PR #15 review. Prioritized by judge impact.

## Already Merged (PR #19 → main, rebased into PR #15)

- [x] **Orchestrator: DealRejected event handler** — `agent-gameplay-orchestrator` was ignoring `DealRejected` events, breaking multi-round agent games after the first no-deal. Added `EVENT_DEAL_REJECTED` constant, `onDealRejected` handler, and switch case. Verified with game 14 (no-deal → round 2 chained correctly).
- [x] **agent-support.sh: VRF event lookup by game ID** — Script was finding stale VRF events from previous games. Added topic1 filtering (padded game ID) to `find_event_tx()`, switched to `--json` output + python3 parsing, newest-first scan (matching `cre-support.sh` pattern).
- [x] **Nav: removed "Banker Quotes" link** — Decluttered top nav. Best-of-banker is now linked from the landing page instead (THE BANKER section + below BestOfBanker component).
- [x] **Landing page: two paths to /best-of-banker** — "Greatest Hits" button in THE BANKER card, "See All Banker Quotes" button below the BestOfBanker component.

## Critical (Chainlink best-practice violations)

- [ ] **SharedPriceFeed: staleness check in `_getPrice()`** — Only `snapshotPriceWithStaleness()` checks freshness. The other 4 functions (`usdToWei`, `weiToUsd`, `getEthUsdPrice`, `snapshotPrice`) accept arbitrarily stale prices. Add a default staleness constant or require staleness on all reads.
- [ ] **SharedPriceFeed: validate `decimals()` in constructor** — Math assumes 8-decimal feeds. Add `require(AggregatorV3Interface(_priceFeed).decimals() == 8)` to prevent silent miscalculation.

## High (Judges will probe)

- [ ] **CrossChainJoin: fake CCIP delivery confirmation** — `setTimeout(() => setBridgeState("success"), 3000)` doesn't verify cross-chain delivery. Either poll CCIP Explorer API or show "pending" with a link instead of "confirmed."
- [ ] **CRE privacy angle undersold on landing page** — Lead CRE section copy with the privacy narrative ("the DON sees nothing, the blockchain sees nothing"). Confidential HTTP for Gemini + enclave case reveals is the most novel integration — sell it.
- [ ] **SharedPriceFeed: add fuzz tests** — All test values are hardcoded. Add `testFuzz_UsdToWei_Roundtrip(uint256 cents)` and `testFuzz_CentsToWeiSnapshot(uint256 cents, int256 price)` to demonstrate robustness.

## Medium (Code quality)

- [ ] **Web3Provider: remove unused imports** — `connectorsForWallets`, `getDefaultWallets`, `walletConnect` are imported but never used. Only `injected()` is configured, `projectId` is dead code.
- [ ] **Extract reopen-offer pill** — The "reopen banker offer" button markup is duplicated between `GameBoard.tsx` and `watch/[id]/page.tsx`. Extract to a shared component.
- [ ] **CCIP Explorer link format** — Verify `msg/${txHash}` is correct (should it be message ID, not source TX hash?).

## Low (Polish)

- [ ] **Gateway contract source** — `0xaB2995...` referenced in frontend but source not in this repo. Judges may ask to see it.
- [ ] **Landing page "absurd" repetition** — Both infrastructure and CRE sections use "absurdity" language. Vary the copy.
