---
name: application-integrator
description: Guide for porting EVM applications to Aptos. Use when the user has an existing blockchain app and wants to add Aptos support. Covers Move contracts, wallet integration, randomness, testing, deployment, and known gaps.
---

# Application Integrator Guide — EVM to Aptos

**Audience:** Developers who already have a working blockchain app (usually EVM) and want to add Aptos support. This is NOT for beginners. You know what a wallet is.

**Format:** Short sections with links to Aptos docs pages. Read the section headers, drill into what's relevant. Each section has a "What the docs don't tell you" note based on our experience porting [Deal-or-Not](https://dealornot.vercel.app) from Solidity/Base Sepolia to Aptos Move.

**For the Aptos docs team:** This was written as feedback for the [Application Integrator Guide rewrite](https://aptos.dev/build/guides/system-integrators-guide.md). Each "gotcha" below is a real integration pain point we hit. See `../LEARNING_JOURNAL.md` for the full narrative.

---

## 1. Mental Model Shift

| Concept | EVM (Solidity) | Aptos (Move) |
|---------|---------------|--------------|
| State storage | `mapping(uint => Game)` in contract | `SmartTable<u64, Game>` in resource at address |
| Access control | `msg.sender` | `signer::address_of(signer)` |
| Token decimals | ETH: 18 (wei) | APT: 8 (octas) |
| Entry point | `function foo() external` | `public entry fun foo(signer: &signer)` |
| Events | `emit GameCreated(id)` | `std::event::emit(GameCreated { game_id })` |
| Deploy model | Contract at address | Modules at account address |

**Key difference:** In Move, data lives in resources at specific addresses, not inside contracts. When you call `borrow_global<GameStore>(addr)`, you're reading from `addr`'s storage. This means your "contract address" is really the deployer's account address.

**Read:** [Move on Aptos](https://aptos.dev/move/move-on-aptos) | [Objects vs Resources](https://aptos.dev/build/smart-contracts/objects)

**Gotcha:** `named-addresses` in `Move.toml` must match the account you publish from. Use `[dev-addresses]` for testing with `--dev` flag.

---

## 2. Wallet Integration

The first thing every app dev does. Aptos uses a different wallet ecosystem from EVM.

**EVM pattern:** wagmi + RainbowKit (or similar)
**Aptos pattern:** `@aptos-labs/wallet-adapter-react` + Petra/Pontem/etc.

**Dual-chain approach** (what we did):
- `ChainContext` provider tracks `activeChain: "evm" | "aptos" | "none"`
- Unified CONNECT button opens a modal with both chains
- Conditional rendering based on `isAptos` / `isEvm`

See `references/wallet-integration.md` for our implementation and `examples/ChainContext.tsx` for the dual-chain pattern.

**Read:** [Wallet Adapter](https://aptos.dev/build/sdks/wallet-adapter) | [Wallet Adapter React](https://github.com/aptos-labs/aptos-wallet-adapter)

**Gotcha:** The wallet adapter's `signAndSubmitTransaction` may return the hash as a string or an object with `.hash`. Handle both: `const hash = typeof response === 'string' ? response : response.hash;`

---

## 3. Reading On-Chain State

**EVM pattern:** `useReadContract({ abi, functionName, args })`
**Aptos pattern:** `aptos.view({ payload: { function, functionArguments } })`

View functions in Move are marked with `#[view]`:
```move
#[view]
public fun get_game_state(addr: address, game_id: u64): (address, u8, ...) { ... }
```

The return is a raw JSON array that you parse manually. No ABI decoding.

**Read:** [View Functions](https://aptos.dev/build/apis) | [TypeScript SDK](https://aptos.dev/build/sdks/ts-sdk)

**Gotcha:** Aptos events work differently from EVM. On EVM, you get event data from transaction receipts. On Aptos, you read events from event handles or use the indexer. If you just need state, **view functions are simpler than events** — we added `get_next_game_id()` specifically because getting the game ID from events was harder than expected.

---

## 4. Writing Transactions

**EVM pattern:** `writeContractAsync({ functionName, args, value })`
**Aptos pattern:** `signAndSubmitTransaction({ data: { function, functionArguments } })`

```typescript
const response = await signAndSubmitTransaction({
  data: {
    function: `${MODULE_ADDR}::deal_or_not_quickplay::create_game`,
    functionArguments: [MODULE_ADDR],
  },
});
```

**Read:** [Transaction Builder](https://aptos.dev/build/sdks/ts-sdk/transaction-builder)

### Two-TX Randomness (Critical)

If your app uses randomness, you MUST use the two-TX pattern:
- **TX1:** Player calls a regular `entry fun` that records intent (no randomness consumed)
- **TX2:** Resolver (authorized signer) calls a `#[randomness] entry fun` that generates randomness

This prevents undergasing attacks. See `references/two-tx-randomness.md` for the full pattern.

**Gotcha:** The resolver is an OFF-CHAIN service. Aptos has no event triggers, no scheduled transactions, no keeper service. **You must build the resolver yourself.** See `scripts/aptos-resolver.sh` for our reference implementation. This is the #1 thing the Aptos docs don't prepare you for.

---

## 5. Testing

**EVM pattern:** Foundry's `forge test` with `vm.prank`, `vm.expectRevert`
**Aptos pattern:** `aptos move test --dev` with `#[test]`, `#[expected_failure]`

Test setup requires initializing framework modules:
```move
#[test(owner = @my_addr, framework = @aptos_framework)]
fun test_my_function(owner: &signer, framework: &signer) {
    timestamp::set_time_has_started_for_testing(framework);
    randomness::initialize_for_testing(framework);
    let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(framework);
    // ... your test
    coin::destroy_burn_cap(burn_cap);
    coin::destroy_mint_cap(mint_cap);
}
```

See `references/testing-randomness.md` for a complete example.

**Read:** [Unit Testing](https://aptos.dev/build/smart-contracts/book/unit-testing)

**Gotcha:** `randomness::initialize_for_testing()` is all you need to test `#[randomness]` functions. The docs don't make this obvious. Our first port shipped with 0 tests for the core game module because the porting agent assumed "randomness mocking needs deeper test infrastructure." It doesn't — `initialize_for_testing` works fine. We later added 11 tests and they all passed on the first try.

---

## 6. Deployment

**EVM pattern:** `forge script` with private keys
**Aptos pattern:** `aptos move publish` with profiles

```bash
# Create profiles
aptos init --profile deployer --network testnet
aptos init --profile resolver --network testnet

# Fund from faucet
aptos account fund-with-faucet --profile deployer --amount 500000000

# Publish
aptos move publish \
  --named-addresses deal_or_not=$DEPLOYER_ADDR \
  --profile deployer --assume-yes

# Initialize modules in dependency order
aptos move run --function-id $ADDR::price_feed_helper::initialize --args u64:850000000 --profile deployer
aptos move run --function-id $ADDR::bank::initialize --args address:$DEPLOYER_ADDR --profile deployer
# ... etc
```

**Read:** [CLI Reference](https://aptos.dev/tools/aptos-cli) | [Publishing Modules](https://aptos.dev/build/smart-contracts/deployment)

**Gotcha:** Module initialization order matters. If module B depends on module A's resources, initialize A first. There's no `constructor()` like Solidity — you must call `initialize()` explicitly after publishing.

---

## 7. What's Missing on Aptos (Honest Assessment)

These are real gaps as of March 2026. They're not criticism — they're places where the docs should either explain the workaround or flag "this doesn't exist yet."

| Feature | EVM | Aptos | Workaround |
|---------|-----|-------|------------|
| Event-triggered automation | Chainlink CRE | **None** | Polling script/cron |
| Scheduled transactions | Chainlink Automation | **None** (was "supposed to be November 2025") | Cron job |
| Keeper service | Chainlink Keepers | **None** | Build your own |
| Confidential compute | CRE enclaves | **None** | Off-chain computation |
| Price feeds (pull) | Chainlink Data Feeds | Chainlink Data Feeds (exists!) | Use `data_feeds::router` |
| Cross-chain messaging | Chainlink CCIP | CCIP Aptos (in development) | Bridge contracts |

**The biggest gap is automation.** Any app that uses two-TX randomness needs something to submit TX2. This is table stakes for games, auctions, DeFi liquidations, and scheduled payments.

---

## 8. File Map

This skill folder contains:

```
skills/application-integrator/
├── SKILL.md                           ← You are here (index/overview)
├── references/
│   ├── wallet-integration.md          ← Dual-chain wallet pattern
│   ├── two-tx-randomness.md           ← Full two-TX pattern with resolver
│   ├── testing-randomness.md          ← Complete test example
│   └── evm-to-move-cheatsheet.md      ← Quick reference: Solidity → Move
├── scripts/
│   └── (symlinks to ../../../scripts/) ← play-aptos.sh, aptos-resolver.sh, etc.
├── examples/
│   └── ChainContext.tsx               ← Dual-chain context provider
└── gotchas.md                         ← Living list of integration gotchas
```

---

## 9. Links & Resources

**Aptos docs (verified working as of March 2026):**
- [Move on Aptos](https://aptos.dev/move/move-on-aptos)
- [Randomness](https://aptos.dev/build/smart-contracts/randomness)
- [Unit Testing](https://aptos.dev/build/smart-contracts/book/unit-testing)
- [Wallet Adapter](https://aptos.dev/build/sdks/wallet-adapter)
- [TypeScript SDK](https://aptos.dev/build/sdks/ts-sdk)
- [CLI Reference](https://aptos.dev/tools/aptos-cli)
- [Data Feeds](https://aptos.dev/build/smart-contracts/chainlink-data-feeds) (if it exists — check)

**Broken/outdated links found during port:**
- The current [System Integrators Guide](https://aptos.dev/build/guides/system-integrators-guide.md) is from 2022, written for exchanges, not app devs. Greg Nazario is rewriting it.

**Our case study:**
- `packages/aptos/LEARNING_JOURNAL.md` — full narrative of the port
- `packages/aptos/sources/` — 14 Move modules (ported from 16 Solidity contracts)
- `packages/aptos/scripts/` — CLI tools mirroring the EVM scripts
