# Integration Gotchas — Living List

These are real issues we hit porting Deal-or-Not from EVM to Aptos. Each one cost time to debug. Updated as we find more.

---

## Contract / Move

1. **No signed integers in Move.** Banker algorithm needs `context_adjustment` which can be negative. Workaround: `struct SignedU64 { value: u64, negative: bool }` with custom arithmetic. (~50 lines of code for what Solidity does natively.)

2. **`#[randomness] entry fun` can only be called by the signer specified as resolver.** The `#[randomness]` attribute doesn't enforce WHO calls it — your contract must do that with `assert!`. But the two-TX pattern means only the resolver should call it, not the player.

3. **`randomness::initialize_for_testing()` is all you need for test randomness.** Don't overthink it. Don't skip testing randomness functions.

4. **`move_to(signer, resource)` stores at the signer's address.** There's no separate "contract address." Your module address IS where you publish, but resources are stored at whichever address calls `move_to`.

5. **`SmartTable` requires `store` ability on values.** Your Game struct needs `has store`. If you add fields that don't have `store`, the whole struct breaks.

6. **`timestamp::now_seconds()` starts at 0 in tests.** If your code checks `created_at > 0`, advance time before creating the resource.

7. **Resource accounts for bank vaults.** Solidity uses `address(this).balance`. In Move, create a resource account with `account::create_resource_account(owner, seed)`, store the `SignerCapability`, and use it to sign transfers.

8. **Module initialization order matters.** No constructors. You must call `initialize()` explicitly after publishing, in dependency order. If module B reads from module A's resource, initialize A first.

---

## Frontend / TypeScript

9. **Wallet adapter `signAndSubmitTransaction` return type varies.** Some wallets return `{ hash: string }`, others return just the hash string. Always handle both: `const hash = typeof response === 'string' ? response : response.hash;`

10. **`aptos.view()` returns raw arrays, not decoded objects.** Unlike wagmi/viem which decode using ABI types, Aptos view results are `[value1, value2, ...]` that you manually destructure.

11. **No equivalent to EVM transaction receipt events for game ID discovery.** On EVM: `receipt.logs → GameCreated(id)`. On Aptos: add a `get_next_game_id()` view function and read it before the transaction.

12. **`@aptos-labs/wallet-adapter-react` needs explicit install.** It's not part of any starter template. `bun add @aptos-labs/ts-sdk @aptos-labs/wallet-adapter-core @aptos-labs/wallet-adapter-react`

---

## CLI / Deployment

13. **Aptos CLI version matters.** CLI 7.4.0 can't compile `mainnet` branch of aptos-framework (Move 2.2 syntax errors). Upgrade to 8.1.0+: `brew upgrade aptos`.

14. **`--dev` flag required for local testing.** `Move.toml` uses `deal_or_not = "_"` placeholder. Without `--dev`, you get "Unresolved addresses."

15. **`aptos move run` needs `--assume-yes` for scripting.** Otherwise it prompts for confirmation interactively.

16. **Profile addresses aren't exported to env.** Use `aptos account lookup-address --profile <name>` and parse JSON to get the address programmatically.

---

## Architecture

17. **Aptos has no event-triggered automation.** No CRE, no Keepers, no scheduled transactions. If your app needs something to happen after an event, you build a polling service.

18. **Two-TX randomness requires a resolver.** The docs explain the pattern. They don't mention you need to build and run a service to submit TX2. This is the single biggest gap in the integration experience.

19. **Aptos scheduled transactions don't exist yet.** They were planned for November 2025 (per Greg Nazario, March 2026). Plan your architecture around polling/cron for now.
