# TODO — Pre-Submission Fixes

Audit findings from PR #15 review. Prioritized by judge impact.

## Already Merged (PR #19 → main, rebased into PR #15)

- [x] **Orchestrator: DealRejected event handler** — `agent-gameplay-orchestrator` was ignoring `DealRejected` events, breaking multi-round agent games after the first no-deal. Added `EVENT_DEAL_REJECTED` constant, `onDealRejected` handler, and switch case. Verified with game 14 (no-deal → round 2 chained correctly).
- [x] **agent-support.sh: VRF event lookup by game ID** — Script was finding stale VRF events from previous games. Added topic1 filtering (padded game ID) to `find_event_tx()`, switched to `--json` output + python3 parsing, newest-first scan (matching `cre-support.sh` pattern).
- [x] **Nav: removed "Banker Quotes" link** — Decluttered top nav. Best-of-banker is now linked from the landing page instead (THE BANKER section + below BestOfBanker component).
- [x] **Landing page: two paths to /best-of-banker** — "Greatest Hits" button in THE BANKER card, "See All Banker Quotes" button below the BestOfBanker component.

## Critical (Chainlink best-practice violations)

- [x] **SharedPriceFeed: staleness check in `_getPrice()`** — Added `DEFAULT_MAX_STALENESS = 3600` constant, all reads now check freshness. *(fix/pr15-audit-fixes)*
- [x] **SharedPriceFeed: validate `decimals()` in constructor** — Added `if (feed.decimals() != 8) revert UnexpectedDecimals()`. *(fix/pr15-audit-fixes)*

## High (Judges will probe)

- [x] **CrossChainJoin: fake CCIP delivery confirmation** — Replaced `setTimeout` with `useWaitForTransactionReceipt` hook. Shows real TX status. *(fix/pr15-audit-fixes)*
- [ ] **CRE privacy angle undersold on landing page** — Lead CRE section copy with the privacy narrative ("the DON sees nothing, the blockchain sees nothing"). Confidential HTTP for Gemini + enclave case reveals is the most novel integration — sell it.
- [x] **SharedPriceFeed: add fuzz tests** — Added `testFuzz_UsdToWei_Roundtrip` and `testFuzz_CentsToWeiSnapshot`. *(fix/pr15-audit-fixes)*

## Medium (Code quality)

- [x] **Web3Provider: remove unused imports** — Removed `connectorsForWallets`, `getDefaultWallets`, `walletConnect`, dead `projectId`. *(fix/pr15-audit-fixes)*
- [ ] **Extract reopen-offer pill** — The "reopen banker offer" button markup is duplicated between `GameBoard.tsx` and `watch/[id]/page.tsx`. Extract to a shared component.
- [x] **CCIP Explorer link format** — Fixed to `#/side-drawer/msg/${txHash}`. *(fix/pr15-audit-fixes)*

## Low (Polish)

- [ ] **Gateway contract source** — `0xaB2995...` referenced in frontend but source not in this repo. Judges may ask to see it.
- [ ] **Landing page "absurd" repetition** — Both infrastructure and CRE sections use "absurdity" language. Vary the copy.
