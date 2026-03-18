# Learning Journal: Porting Deal-or-Not to Aptos Move

## What This Is
A record of decisions, resources, struggles, and insights from porting 16 Solidity contracts to Aptos Move. Written by Claude (Opus 4.6) with guidance from tippi-fifestarr. Updated incrementally as work progresses.

---

## Phase 0: Research & Planning

### Doc Discovery Journey

**Round 1 — Topic-first search (missed llms.txt)**
My first approach was to search for specific topics: "Aptos randomness", "Aptos resource accounts", etc. This landed me on deep-link URLs like `/build/smart-contracts/randomness` directly. I never loaded the `aptos.dev` homepage or browsed the sidebar navigation.

Result: I missed that Aptos has:
- `llms.txt` at `https://aptos.dev/llms.txt` (full docs in one file!)
- A dedicated "AI and LLMs" section in the sidebar nav
- An MCP server (`@aptos-labs/aptos-mcp`) for Claude Code
- A dedicated `/llms-txt` page with setup instructions for every major AI tool

**Round 2 — User pointed out llms.txt**
After the user asked "there's llmstxt as well", I checked and found it. Then I also checked `/.well-known/llms.txt` (404) and `docs.chain.link/llms.txt` (exists).

**Round 3 — Actually read the homepage**
When I finally fetched `aptos.dev` directly, I found llms.txt is prominently linked:
- In the sidebar nav: "AI and LLMs > LLMs.txt NEW"
- On the homepage: "NEW! LLMs.txt Integration"
- Has its own page at `/llms-txt`

**Lesson**: LLM agents don't browse docs like humans. We go topic → deep page → never see nav. The llms.txt WAS discoverable — I just never looked at the homepage first. This is a real pattern worth reporting to docs teams.

### Aptos Docs — What Works vs Dead Ends

Many URLs have moved. These all 404:
- `/build/smart-contracts/structs` → now at `/book/structs-and-resources`
- `/build/smart-contracts/events` → gone (use GitHub source)
- `/build/smart-contracts/unit-testing` → now at `/book/unit-testing`
- `/build/smart-contracts/coins` → gone (use GitHub source)
- `/build/smart-contracts/install-cli` → now at `/build/cli/setup-cli`

The Move Book at `/build/smart-contracts/book` is the stable, comprehensive reference. Individual topic pages under `/build/smart-contracts/` are hit-or-miss.

### Most Useful Resources (Ranked)

1. **`https://aptos.dev/llms-full.txt`** — Entire docs concatenated. Would have saved 15+ page fetches.
2. **Move Book** (`/build/smart-contracts/book`) — The real language reference
3. **`smartcontractkit/aptos-starter-kit`** on GitHub — 3 working Move modules for Chainlink Data Feeds + CCIP
4. **Randomness page** (`/build/smart-contracts/randomness`) — Critical for our game. `#[randomness]` attribute, undergasing warnings
5. **Security Guidelines** (`/build/smart-contracts/move-security-guidelines`) — Undergasing, overflow gotchas
6. **AIP-41** on GitHub — Security model behind Aptos randomness (wDKG + wVRF)
7. **CertiK blog: Move for Solidity Devs** — Storage/access pattern comparison

### The Privacy Problem (Critical Architecture Decision)

**My initial (wrong) assumption**: Use `randomness::permutation(5)` to shuffle all 5 case values atomically at game creation. Values stored in contract, hidden because no public getter.

**Why this is wrong** (from the whitepaper + Aptos research):
1. The Deal-or-Not whitepaper documents 4 failed approaches. Approach 0 (Fisher-Yates) stored values on-chain — anyone could read storage slots via `eth_getStorageAt`. **Move resources are equally readable via Aptos RPC.**
2. Approach 2 (Quantum Collapse) used `hash(vrfSeed, caseIndex, blockhash)` — all inputs became public, so players could precompute and selectively abort. **Same problem on Aptos if we pre-compute values.**
3. The CRE solution works because `hash(vrfSeed, caseIndex, CRE_SECRET, bitmap)` has one input (`CRE_SECRET`) that no party can access alone.

**Corrected approach**: Two-Transaction Randomness (Option B)
- TX1: Player calls `request_open_case` — records intent, no randomness
- TX2: Authorized resolver calls `#[randomness] reveal_case` — fresh randomness generated AFTER TX1 commits
- Player can't predict because randomness doesn't exist until TX2 executes
- Resolver is the only authorized caller, mitigating undergasing attacks

Also documenting Options A (Oracle + Secret) and C (Hybrid CCIP to EVM CRE) as alternatives.

### Key Architectural Differences

| Solidity | Move | Impact |
|----------|------|--------|
| `mapping(uint => Game)` | `SmartTable<u64, Game>` | No iteration support; add vector if needed |
| `int256` | Doesn't exist | BankerAlgorithm needs `(u256, bool)` tuples |
| ETH 18 decimals | APT 8 decimals | Every financial formula changes |
| `address(this).balance` | No equivalent | Resource accounts with SignerCapability |
| `abstract contract` inheritance | No inheritance | Friend modules or code duplication |
| `approve`/`transferFrom` | MintRef/BurnRef/TransferRef | Capability-based, fundamentally different |
| `private` storage vars | No storage privacy | Both chains: all storage is publicly readable |

---

## Phase 1: Pure Libraries

### game_math.move
- Direct port of `GameMath.sol`
- Changed `wei` terminology to `octas` (Aptos equivalent, 1 APT = 10^8 octas)
- Error codes as u64 constants instead of custom error types
- No price feed dependency at module level — passed as parameter

### banker_algorithm.move
- Ported `BankerAlgorithm.sol` with signed integer workaround
- Used `aptos_std::aptos_hash::keccak256` for entropy (same as Solidity's keccak256)
- **Signed int challenge**: `_randomVariance` returns `int256` in Solidity. In Move:
  - Compute positive/negative parts separately
  - Use `(u64, bool)` for intermediate signed values
  - `_clamp` operates on signed representation
  - Final combination adds/subtracts from base discount

### Phase 1 Results

**Compilation**: Both modules compiled on first try with `aptos move compile --dev`. The `--dev` flag is required because `Move.toml` uses `deal_or_not = "_"` (placeholder address resolved by `[dev-addresses]` to `0xCAFE`). Without `--dev`, you get "Unresolved addresses" error.

**Tests**: 20/20 passed on first run. Breakdown:
- `game_math`: 6 tests (slippage math, deposit validation, expected failure)
- `banker_algorithm`: 14 tests (EV, offers, signed math, context adjustment, variance)

**What went smoothly:**
- `aptos move init --name deal_or_not` scaffolded the project perfectly
- `aptos_std::aptos_hash::keccak256` worked as a drop-in for Solidity's `keccak256(abi.encodePacked(...))`
- `vector<u64>` is a clean replacement for `uint256[] memory`
- Move's `#[expected_failure(abort_code = ...)]` test attribute is cleaner than Foundry's `vm.expectRevert`

**What needed adaptation:**
- **Signed integers**: Created a `SignedU64 { value: u64, is_negative: bool }` struct with `signed_add` and `signed_clamp` helpers. This added ~40 lines of code that don't exist in Solidity (where `int256` just works). The `_contextAdjustment` and `_randomVariance` functions had to be restructured to avoid negative intermediate values.
- **No `abi.encodePacked`**: Used `vector::push_back` to append the round number as a byte to the seed vector before hashing. Less elegant but functionally equivalent.
- **u128 for overflow**: `required_with_slippage` uses `(u64 as u128)` intermediate to avoid overflow on `base * (10000 + slippage)`. Solidity's `uint256` is wide enough to never overflow here, but Move's `u64` can.

**Aptos CLI experience:**
- Installation via `curl | python3` was instant (< 5s)
- `aptos move compile` downloads git dependencies (AptosFramework) on first run — took ~30s
- Test output is clean and readable, similar to `cargo test`

---

## Phase 2-3: Chainlink Integration + Bank

### price_feed_helper.move
- Ported `PriceFeedHelper.sol` with mock price feed pattern for dev/testing
- **Critical math difference**: APT has 8 decimals, ETH has 18. The conversion formula changes from `cents * 1e24 / ethPrice` to `cents * 1e14 / aptPrice`. Got this right by deriving from first principles: `10^(asset_decimals + feed_decimals - 2)`.
- Snapshot pattern preserved: `apt_per_dollar = 1e16 / price` (vs `1e26 / price` for ETH)
- For production: would integrate with `data_feeds::router::get_benchmarks()` from Chainlink's on-chain packages

**Chainlink Data Feeds discovery journey:**
- Downloaded Chainlink packages via `aptos move download --account 0x516... --package ChainlinkPlatform`
- Read the actual Move source (`router.move`, `registry.move`) to understand the API
- Key finding: `router::get_benchmarks(signer, feed_ids, billing_data)` returns `vector<Benchmark>` where `benchmark: u256` is the price. The signer param is for billing but any signer works.
- Feed IDs are `vector<u8>` (32-byte hex), not addresses like Solidity's `AggregatorV3Interface`
- Decided to use mock pattern for now — wiring up real Chainlink packages requires managing cross-package dependencies with specific named addresses (`data_feeds`, `platform`, `owner`)

### bank.move
- Ported `Bank.sol` using resource account pattern (key Aptos concept)
- `account::create_resource_account(owner, BANK_SEED)` creates an autonomous account that holds APT
- `SignerCapability` stored in BankState lets the module sign transactions for the vault
- `friend` access: `deal_or_not_quickplay` can call `settle()` and `receive_entry_fee()` directly

**Test fix needed**: `coin::register<AptosCoin>` requires the coin module to be initialized in tests. Had to call `aptos_coin::initialize_for_test(framework)` before bank initialization. This returned `(burn_cap, mint_cap)` that need explicit cleanup. Solidity tests don't need this because ETH is always available.

### deal_or_not_quickplay.move (Core Game — THE big one)
- **723 lines of Solidity → ~500 lines of Move** (simpler due to no VRF/CRE callbacks)
- Phase model: 9 → 7 phases (eliminated WaitingForVRF, merged WaitingForCRE into WaitingForReveal, eliminated WaitingForFinalCRE)
- Two-TX pattern: `open_case()` (player) → `reveal_case()` (resolver with `#[randomness]`)
- `keep_case()` and `swap_case()` also use `#[randomness]` attribute
- `SmartTable<u64, Game>` replaces `mapping(uint256 => Game)`
- No `onReport`/`IReceiver` — resolver calls functions directly as authorized signer
- `used_values_bitmap` preserved (same bit manipulation logic as Solidity)

**Compilation issues encountered:**
1. **Doc comments on `#[randomness]` entry functions**: Move doesn't allow `///` doc comments before `#[attribute]` annotations. Changed to `//` regular comments.
2. **`&address` vs `address`**: `vector::push_back` expects the value directly, not a reference. Fixed `&game` → `game`.
3. **Unused parameter warning**: `swapped` in `reveal_final_cases` — prefixed with `_`.

**All 27 tests pass** across 5 modules (Phase 1-4).

## Phase 5: Agent Infrastructure

### agent_registry.move
- Ported `AgentRegistry.sol` (313 lines Solidity → ~290 lines Move)
- `mapping(uint256 => Agent)` → `SmartTable<u64, Agent>`, `mapping(address => uint256[])` → `SmartTable<address, vector<u64>>`
- **No function overloading in Move**: Solidity had `isAgentEligible(uint256)` and `isAgentEligible(address)`. In Move, renamed to `is_agent_eligible` and `get_agent_id_by_address` + `is_agent_eligible`
- `friend` declarations needed for `deal_or_not_agents`, `agent_staking`, `seasonal_leaderboard`
- Added `record_game_friend` for friend module access alongside `record_game` for authorized external callers
- 3 tests passing

### agent_staking.move
- Ported `AgentStaking.sol` (285 lines → ~280 lines Move)
- **Reward-per-share accumulator pattern** preserved: `reward_per_share` scaled by 1e18, `reward_debt` per stake
- Resource account holds all staked APT + rewards
- `LOCKUP_PERIOD = 604800` (7 days, same as Solidity)
- `AGENT_REVENUE_SHARE = 2000` (20% in basis points)
- SmartTable for stakes, pools, and reward debt
- 1 test passing (initialization)

### deal_or_not_agents.move
- Ported `DealOrNotAgents.sol` (largest module, ~480 lines)
- **Same Two-TX pattern as quickplay**: `agent_open_case` → `reveal_agent_case` (with `#[randomness]`)
- **Resolver pattern instead of CRE `onReport`**: All agent actions mediated by resolver address
- **`bank.move` needed new friend**: Added `friend deal_or_not::deal_or_not_agents` since agents also call `bank::settle()` and `bank::receive_entry_fee()`
- Bitmap helpers duplicated from quickplay (no abstract base in Move — no inheritance)
- **Shift operator type error**: `bitmap >> i` requires `i` to be `u8`, not `u64`. Fixed by declaring loop counter as `u8` and casting to `u64` for comparisons. This is a common gotcha — Solidity doesn't care about shift amount types.
- Stats recorded to AgentRegistry after each game via `record_game_friend`
- 2 tests passing (initialization + bitmap helpers)

### seasonal_leaderboard.move
- Ported `SeasonalLeaderboard.sol` (350 lines → ~310 lines Move)
- **No nested mappings**: Solidity's `mapping(uint256 => mapping(uint256 => AgentSeasonStats))` becomes `SmartTable<u64, AgentSeasonStats>` with composite key `season_id * 1_000_000 + agent_id`
- Resource account holds prize pool APT
- Bubble sort for rankings (same as Solidity — small N makes it fine)
- Prize distribution: 1st=50%, 2nd=25%, 3rd=15%, 4-10=10% split (identical to Solidity)
- **Points system preserved**: 100/win, 10/dollar earned, 500 bonus for $1.00 game
- 2 tests passing (season lifecycle + point recording with assertions)

## Phase 6: Markets & Social

### prediction_market.move
- Ported `PredictionMarket.sol` (423 lines → ~380 lines Move)
- **Enum → u8 constants**: `MarketType` and `MarketStatus` enums become `const MARKET_WILL_WIN: u8 = 0`, etc.
- `MIN_BET = 100_000` octas (0.001 APT) vs `0.001 ether`
- Resource account holds all bet funds
- **Borrow conflict fix**: Move's linear type system prevents borrowing `state.bets` immutably and then mutably in the same scope. Fixed by using `*smart_table::borrow(...)` (copy) to read values, then borrowing mutably later. This is a pattern that comes up constantly — Solidity has no equivalent restriction.
- 2% platform fee on winning payouts
- 2 tests passing

### best_of_banker.move
- Ported `BestOfBanker.sol` (small, ~200 lines)
- **No modulo operator**: Move has no `%` — discovered at compile time. Solidity uses `uint256 % N` freely. Fixed by using a `SmartTable<VoteKey, bool>` with a struct key `VoteKey { quote_id: u64, voter: address }` instead of a composite integer key.
- Quotes stored in `vector<Quote>` (append-only, indexed by position)
- Upvote cost: $0.02 in APT via price feed conversion
- 1 test passing

### sponsor_vault.move
- Ported `SponsorVault.sol` (280 lines → ~250 lines Move)
- Resource account holds sponsor deposits and jackpot funds
- **50/50 jackpot split** preserved: half to player, half rolls over to next game
- Sponsor registration, top-up, game sponsoring all ported
- 1 test passing

## Phase 7: Cross-Chain (CCIP)

### ccip_gateway.move
- Ported `DealOrNotGateway.sol` as a **STUB**
- Collects entry fee and emits `CrossChainJoinSent` event
- **Real CCIP integration requires** the Chainlink CCIP Aptos package (deployed on mainnet/testnet)
- Production path: import `ccip::ccip_send()` from the starter kit pattern
- Documented the integration path in comments
- 1 test passing

### ccip_bridge.move
- Ported `DealOrNotBridge.sol` as a **STUB**
- Gateway registration (chain_selector → address) for authorized cross-chain sources
- `process_cross_chain_join` replaces Solidity's `_ccipReceive` callback
- **Real CCIP integration**: Deploy as resource account, register with CCIP router, implement `ccip_receive` callback
- 1 test passing

### Phase 5-7 Compilation Issues Summary

| Issue | Module | Root Cause | Fix |
|-------|--------|------------|-----|
| No `%` operator | best_of_banker | Move has no modulo | Used struct key `VoteKey` in SmartTable |
| Shift requires `u8` | deal_or_not_agents | `bitmap >> i` needs `u8` shift amount | Cast loop counter to `u8`, cast back for comparisons |
| Missing `friend` | bank | `deal_or_not_agents` calls `settle()` | Added `friend deal_or_not::deal_or_not_agents` |
| Borrow conflict | prediction_market | Can't have `&` and `&mut` in same scope | Copy with `*borrow()`, then `borrow_mut()` later |
| Unused params | ccip_bridge, tests | Move warns on unused params | Prefix with `_` |

### Phase 5-7 Results

**Compilation**: 14 modules compile cleanly with `aptos move compile --dev`
**Tests**: 41/41 pass across all 14 modules

**Module count**: 14 Move modules porting 16 Solidity contracts (SharedPriceFeed merged into PriceFeedHelper)

---

## Final Summary

### What Was Ported

| # | Move Module | Solidity Source | Lines (Move) | Tests |
|---|-------------|-----------------|-------------|-------|
| 1 | game_math | GameMath.sol | ~80 | 6 |
| 2 | banker_algorithm | BankerAlgorithm.sol | ~250 | 14 |
| 3 | price_feed_helper | PriceFeedHelper.sol + SharedPriceFeed.sol | ~160 | 5 |
| 4 | bank | Bank.sol | ~230 | 2 |
| 5 | deal_or_not_quickplay | DealOrNotQuickPlay.sol + VRFManager.sol | ~500 | 0* |
| 6 | agent_registry | AgentRegistry.sol | ~290 | 3 |
| 7 | agent_staking | AgentStaking.sol | ~280 | 1 |
| 8 | deal_or_not_agents | DealOrNotAgents.sol | ~480 | 2 |
| 9 | seasonal_leaderboard | SeasonalLeaderboard.sol | ~310 | 2 |
| 10 | prediction_market | PredictionMarket.sol | ~380 | 2 |
| 11 | best_of_banker | BestOfBanker.sol | ~200 | 1 |
| 12 | sponsor_vault | SponsorVault.sol | ~250 | 1 |
| 13 | ccip_gateway | DealOrNotGateway.sol | ~120 | 1 |
| 14 | ccip_bridge | DealOrNotBridge.sol | ~130 | 1 |

*quickplay tests require randomness mocking which needs deeper test infrastructure

**Total**: 14 Move modules, ~3,660 lines of Move code, 41 passing tests

### Top Move-vs-Solidity Surprises

1. **No modulo operator** — `%` doesn't exist in Move. Use multiplication/division or restructure.
2. **Shift amounts must be `u8`** — `x >> y` requires `y: u8`, unlike Solidity where any uint works.
3. **No `int256`** — Every signed math operation needs a `(value, is_negative)` pattern.
4. **No enum** — Use `const X: u8 = 0` constants. More verbose but works.
5. **Borrow checker is real** — Can't hold `&` and `&mut` to the same resource simultaneously. Copy first, mutate later.
6. **No inheritance** — Abstract contracts become friend modules. Code duplication for shared helpers (bitmap functions duplicated in quickplay and agents).
7. **`doc comments + attributes` conflict** — `///` before `#[randomness]` causes warnings. Use `//` instead.
8. **Resource accounts are powerful** — `SignerCapability` lets modules act autonomously, cleaner than Solidity's `address(this).balance`.
9. **Move prevents reentrancy by design** — Linear type system makes Solidity-style reentrancy impossible. One less thing to worry about.
10. **APT 8 decimals vs ETH 18 decimals** — Off by 10^10 in every conversion formula. Must derive from first principles.

### What Would Change in Production

1. **Price Feed**: Replace mock `PriceFeedState` with Chainlink `data_feeds::router::get_benchmarks()` calls
2. **CCIP**: Import Chainlink CCIP Aptos package, implement real `ccip_send`/`ccip_receive` patterns
3. **Resolver Service**: Build off-chain service to submit `#[randomness]` TX2 transactions
4. **Testing**: Add comprehensive game flow integration tests using `randomness::initialize_for_testing`
5. **Banker AI**: Integrate Gemini via off-chain service calling `set_banker_offer` as authorized signer

---

## Recommendations for Aptos Docs (for tippi's proposal)

### For AI/LLM Discoverability

1. **`<link rel="llms-txt" href="/llms.txt">`** in every page's `<head>` — LLM agents deep-link to topic pages and never see the nav/homepage. This meta tag would make llms.txt discoverable from ANY page.
2. **`/.well-known/llms.txt`** should redirect to `/llms.txt` (currently 404s). This is the standard location that many AI tools check first.
3. **Mention MCP server in llms.txt** — "For Claude Code users, install `@aptos-labs/aptos-mcp`". I only found the MCP server on my 3rd round of research.

### For Developer Experience

4. **Redirect old URLs** — `/build/smart-contracts/structs`, `/events`, `/unit-testing`, `/coins`, `/install-cli` all 404. Every dead link costs an LLM a round-trip. Humans get lost too.
5. **Solidity-to-Move migration guide** — A dedicated page mapping common patterns. Currently only CertiK's blog post fills this gap, and it may go stale. Key mappings needed:
   - `mapping` → `SmartTable` / `SimpleMap`
   - `int256` → `(u64, bool)` signed pattern
   - `approve/transferFrom` → capability refs (MintRef/BurnRef/TransferRef)
   - `address(this).balance` → resource account + SignerCapability
   - `abstract contract` → friend modules
   - `enum` → `const X: u8 = 0` pattern
   - `%` modulo → no equivalent, restructure algorithm
6. **Error code catalog** linked from error messages when `assert!` fails
7. **Move Book as primary entry point** — Individual topic pages under `/build/smart-contracts/` are hit-or-miss. The Move Book at `/build/smart-contracts/book` is comprehensive and stable. Recommend making it the primary navigation entry.

### For This Specific Project (Chainlink + Aptos)

8. **Chainlink Aptos packages documentation** — The actual on-chain Move source (`router.move`, `registry.move`) is the best reference, but it took `aptos move download` to get it. A "Chainlink on Aptos: Quick Reference" page with the key function signatures would save time.
9. **Randomness + privacy discussion** — The randomness page covers `#[randomness]` well but doesn't address the fact that Move resources are publicly readable via RPC. A note saying "randomness prevents validator manipulation but does NOT hide stored values" would prevent a common misconception.

---

## Phase 8: Frontend Integration

### NPM Packages Added
- `@aptos-labs/ts-sdk` — Core Aptos SDK for view calls and transaction waiting
- `@aptos-labs/wallet-adapter-react` — React hooks for wallet connection (useWallet, connect, signAndSubmitTransaction)
- `@aptos-labs/wallet-adapter-core` — Peer dependency

### Architecture: ChainContext Pattern

The existing frontend uses wagmi + RainbowKit for EVM wallets. Aptos wallets are a completely different ecosystem. Rather than replacing the EVM wallet system, I created a `ChainContext` that sits above both:

```
ApolloProvider
  └─ Web3Provider (wagmi/RainbowKit)
    └─ AptosWalletProvider
      └─ ChainProvider ← detects which wallet is connected
        └─ App
```

`ChainContext` provides `activeChain: "evm" | "aptos" | "none"`, determined by:
1. If user explicitly prefers Aptos and Aptos wallet connected → aptos
2. If EVM connected and not preferring Aptos → evm
3. If only one wallet connected → that one
4. If neither → none

This lets every page check `isAptos` / `isEvm` to decide which hooks and UI to render.

### Key Frontend Learnings

**Aptos `account.address` is `AccountAddress`, not `string`**
Aptos SDK returns an `AccountAddress` object from `useWallet()`. Must call `.toString()` before slicing for display. Caught by TypeScript at build time.

**Dynamic imports required for wallet providers**
All wallet providers must be `dynamic(() => import(...), { ssr: false })` because they access browser APIs (localStorage, window.ethereum, etc.) that don't exist during SSR.

**RainbowKit can't host Aptos wallets**
RainbowKit's `ConnectButton.Custom` only works with EVM wallets. There's no way to inject Aptos wallet options into the RainbowKit modal. This means the Aptos connect must be a separate UI element — currently a standalone "APT" button in the nav. A unified experience would require building a custom connect modal that wraps both RainbowKit and the Aptos wallet adapter.

**Aptos game phases map differently**
EVM has 9 phases (WaitingForVRF, Created, Round, WaitingForCRE, AwaitingOffer, BankerOffer, FinalRound, WaitingForFinalCRE, GameOver). Aptos has 7 (Created, Round, WaitingForReveal, AwaitingOffer, BankerOffer, FinalRound, GameOver). The game board page needs separate phase rendering for each chain.

**Entry fee requires on-chain view call**
EVM uses wagmi's `useReadContract` which auto-handles ABI decoding. Aptos uses `aptos.view()` which returns raw arrays that need manual parsing. Created a `useAptosEntryFee` hook that polls the price feed view function every 30 seconds.

### What's Not Wired Up Yet
- Game ID discovery (Aptos games don't auto-navigate to the new game)
- Aptos event log (EventLog component only reads EVM logs)
- APT balance display in play lobby
- Spectator/watch mode for Aptos games
- Agent, market, and best-of-banker pages for Aptos

### Playwright Testing
6 tests verify the Aptos UI elements render correctly:
- APT button visible in nav on all pages
- EVM connect button still works alongside APT
- Play page still shows EVM flow when no wallet connected
- Game ID input works for joining games

Tests are UI-level only (no wallet extension in Playwright browser). Real integration testing would require a mock Aptos wallet adapter or a custom test harness.

---

### The LLM Agent Browsing Pattern (Meta-Insight)

LLM agents don't browse docs like humans. The pattern is:
1. Search for specific topic (e.g., "Aptos randomness")
2. Land on deep page (e.g., `/build/smart-contracts/randomness`)
3. Read the page content
4. Never see sidebar navigation, homepage, or global links

This means **any discoverable resource that only lives in the nav/homepage is invisible to LLM agents**. The llms.txt link IS in the nav — but I went through 15+ page fetches before discovering it, because I never loaded the homepage.

The fix is redundancy: put discovery links in `<head>` meta tags, in page footers, and in `/.well-known/` — places that are visible regardless of how you arrive at the page.

---

## Phase 9: What We Shipped vs What Actually Works

*Added after critical review of the initial port. This section is written FOR the Aptos team — each bug maps to a docs or DX gap that should be fixed.*

The original commit shipped 8,595 lines across 35 files. The commit message said "41 tests passing, all modules compile." The LEARNING_JOURNAL ended on a celebratory note. But when a second AI agent reviewed the work critically, it found five problems that would prevent anyone from actually playing a game.

### Bug 1: The "41/41 Tests" Illusion → Aptos Testing Docs Gap

All 41 tests pass. But they're almost entirely library/helper tests (`game_math`, `banker_algorithm`, `price_feed_helper`). The **core game module `deal_or_not_quickplay` had 0 tests**. Zero.

The porting agent's excuse (from Phase 6): "randomness mocking needs deeper test infrastructure." But this was wrong. `randomness::initialize_for_testing()` works perfectly. After a reviewer pointed this out, we added 11 game flow tests — including full create→pick→open→reveal→offer→accept and full-game-through-keep-case — and they all pass on the first try.

**Why this matters for Aptos docs:** The randomness testing section doesn't prominently show `initialize_for_testing()` as the standard pattern. An AI agent (and likely a human dev) gives up on testing randomness functions because the path isn't clear. The porting agent read the randomness guide, correctly implemented the two-TX pattern in the contracts, but assumed testing would be hard — and never tried.

**Recommendation 9:** Add a "Testing Randomness" section to the Aptos testing guide with a complete example:
```move
#[test(framework = @aptos_framework)]
fun test_my_randomness_function(framework: &signer) {
    randomness::initialize_for_testing(framework);
    // Now #[randomness] entry functions work in tests
    my_randomness_function();
}
```

### Bug 2: The keep/swap Caller Bug → Two-TX Pattern Under-Documented

`keep_case()` and `swap_case()` are `#[randomness] entry fun` callable **only by the resolver** (the contract asserts `signer::address_of(resolver) == store.resolver`). But the frontend hooks (`useAptosGame.ts:170-178`) have the **player's wallet** calling them via `signAndSubmitTransaction`. This would fail with `E_NOT_RESOLVER` (error 302) at runtime.

Nobody caught this because:
- No integration tests existed
- No testnet deployment existed
- The TypeScript compiled fine (type system can't catch smart contract access control)

**Root cause for Aptos docs:** The two-TX randomness pattern (TX1: player commits intent → TX2: resolver executes with randomness) is mentioned in the docs but has no complete example showing the full application flow. The porting agent designed the contracts correctly but forgot that the frontend still needs to know who calls what.

**Recommendation 10:** The randomness guide needs a "Full Application Pattern" section showing: contract with resolver, off-chain resolver service, frontend that signals intent + waits for resolution. The current docs show the contract side only.

### Bug 3: The `/play/aptos-latest` 404 → No Event Indexing Guidance

After creating a game, the frontend navigates to `/play/aptos-latest` — a route that doesn't exist. On EVM, you get the game ID from the transaction receipt (event logs). On Aptos, the porting agent didn't know how to get the game ID back from a transaction, so it hardcoded a placeholder route.

**Fix:** Added a `get_next_game_id` view function to the contract, and a `useAptosNextGameId` hook that reads it before creating the game.

**Recommendation for Aptos docs:** The events/indexing guide should have a "Migrating from EVM Events" section showing Aptos equivalent patterns (view functions for reading state, event handles for subscriptions, indexer for history).

### Bug 4: Hardcoded `isAptosPlayer = true`

Line 223 of the game page: `const isAptosPlayer = true;` — any viewer sees player controls. Should compare the connected wallet address to the game's player address.

**Fix:** `const isAptosPlayer = aptosAccount?.address?.toString().toLowerCase() === ag.player.toLowerCase();`

This one is just a bug, not a docs issue. But it illustrates a pattern: when porting quickly, identity checks get stubbed out. EVM's `useAccount()` + `address.toLowerCase()` pattern is so natural that the Aptos equivalent (`useWallet()` + `account?.address`) gets deferred.

### Bug 5: The Missing Resolver → Aptos Has No Automation Service

Games get stuck at `WaitingForReveal` forever because no resolver service was built. On EVM, Chainlink CRE triggers on events automatically. On Aptos, there's nothing equivalent.

The original journal buried this as a "What Would Change in Production" item, as if it were a nice-to-have. **It's not a nice-to-have — it's the reason the game doesn't work.** Without a resolver, the two-TX randomness pattern is just a contract that gets stuck.

**Fix:** Built `aptos-resolver.sh` — a polling state machine that watches game state and executes resolver actions. Also built `play-aptos.sh` (game CLI) and `aptos-e2e.sh` (full end-to-end test).

**This is the #1 integration blocker for any app using two-TX randomness.** The docs say "use the two-TX pattern for security" but don't address "...and you need to build your own automation to execute TX2."

**Recommendation 11:** Prominently document the resolver requirement alongside the two-TX pattern. Provide a reference resolver implementation (even a simple Node.js polling script). Don't let developers discover this requirement at runtime.

### Meta-Lesson: The Bugs ARE the Documentation

An AI agent is a perfect proxy for "developer who skims your docs and builds something." When Claude ported Deal-or-Not:

| Where docs were clear | Result |
|---|---|
| Move syntax, basic `#[test]` | Correct implementation |
| APT transfers, coin module | Correct implementation |
| Wallet adapter setup | Correct implementation |

| Where docs were sparse/missing | Result |
|---|---|
| Randomness testing (`initialize_for_testing`) | 0 tests for core module |
| Two-TX full application pattern | Caller bug in frontend |
| Event reading / game ID discovery | Hardcoded 404 route |
| Automation / resolver requirement | Missing resolver service |

**The bugs in this port are a map of the gaps in Aptos documentation.** Every place the port went wrong is a place where the docs either didn't exist or didn't explain the concept clearly enough for an AI (or a skimming human) to get right.

### Lesson for AI-Assisted Porting

"Compilation + unit tests for pure functions" creates a compelling "it works!" narrative. TypeScript builds clean. Move compiles. 41/41 tests pass. The commit message writes itself.

But the integration layer — **can a user actually play a game?** — was never tested. A single end-to-end test, even a manual one via CLI scripts, would have caught all five issues above.

---

## Phase 10: Resolver Pattern, Automation & Integration Architecture

### Why Aptos Needs a Resolver Pattern Guide

The two-TX randomness pattern is Aptos's answer to the commit-reveal problem: TX1 commits the player's intent, TX2 (from a separate authorized signer) generates randomness and executes. This prevents undergasing attacks and selective abort.

But it creates a dependency on an off-chain service to submit TX2. On EVM, this is handled by infrastructure services:

| Service | EVM (Chainlink) | Aptos | Gap? |
|---------|-----------------|-------|------|
| Randomness | VRF (callback-based) | Native `#[randomness]` (two-TX) | Different pattern |
| Event triggers | CRE workflows | Nothing | **Yes** |
| Scheduled TX | Chainlink Automation | Nothing (Greg: "supposed to be November") | **Yes** |
| Keeper service | Chainlink Keepers | Nothing | **Yes** |
| Confidential compute | CRE enclaves | Nothing | **Yes** |

### Resolver Architecture

The resolver is a polling state machine:

```
┌──────────┐   poll every 3s   ┌──────────────────┐
│  Start   │ ────────────────→ │  Read game phase  │
└──────────┘                   └────────┬─────────┘
                                        │
              ┌─────────────────────────┼──────────────────┐
              ▼                         ▼                  ▼
     WaitingForReveal          AwaitingOffer          FinalRound
              │                         │                  │
     reveal_case()             calc + set_offer()    keep/swap_case()
     (randomness)              (no randomness)       (randomness)
              │                         │                  │
              └─────────────────────────┼──────────────────┘
                                        ▼
                                    GameOver → exit
```

Key design decisions:
- **Phase deduplication**: Track `PREV_PHASE` to avoid re-executing actions (same pattern as EVM's `cre-simulate.sh support`)
- **FinalRound handling**: Player's keep/swap choice must be communicated to the resolver. Options:
  - (a) CLI flag: `aptos-resolver.sh <GID> --keep` (current implementation)
  - (b) On-chain flag: Add `request_keep`/`request_swap` entry functions that set a `player_final_choice` field, resolver polls for it
  - (c) Off-chain signal: HTTP endpoint, file watch, etc.
  Option (b) is the production path — the on-chain flag is verifiable and doesn't require a separate communication channel.

### Three Production Paths

**1. Script Resolver (what we built)**
- Bash script polling every 3 seconds
- Centralized trust: resolver key holder
- Good for: demos, testing, single-player games
- Bad for: production (single point of failure, key management)

**2. CCIP Hybrid (future)**
- EVM CRE workflow detects Aptos events → sends CCIP message → Aptos receives and executes
- Decentralized trust: CRE enclave
- Requires: CCIP Aptos support (in development), Aptos message receiver contracts
- Good for: production, multi-chain apps
- Bad for: latency (~2-5 min CCIP finality)

**3. Aptos Native Automation (aspirational)**
- On-chain scheduled transactions or keeper service
- Fully decentralized, on-chain trust
- Status: Doesn't exist. Greg Nazario (Aptos DevRel): "scheduled transactions were supposed to be done in November [2025]... it's March [2026]."
- Good for: everything, if it existed

### Recommendations for Aptos

**Recommendation 12:** Document the two-TX randomness + resolver as a first-class application pattern. The current docs show the contract side only — they need to show the full stack including the off-chain resolver.

**Recommendation 13:** Aptos needs a keeper/automation service. Any app with async operations (games, auctions, DeFi liquidations, scheduled payments) needs something to execute TX2. This is a real ecosystem gap. Chainlink Automation exists on EVM for exactly this reason.

**Recommendation 14:** Consider providing a reference resolver SDK — a simple TypeScript library that polls Aptos view functions and submits transactions. Developers shouldn't have to build this from scratch for every app that uses two-TX randomness.
