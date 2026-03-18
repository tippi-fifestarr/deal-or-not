# Testing Randomness Functions in Aptos Move

## The Setup You Need

```move
#[test_only]
use aptos_framework::timestamp;
#[test_only]
use aptos_framework::aptos_coin::{Self, AptosCoin};
#[test_only]
use aptos_framework::coin;
#[test_only]
use aptos_framework::account;
#[test_only]
use aptos_framework::randomness;

#[test_only]
fun setup_test_env(
    owner: &signer,
    resolver: &signer,
    player: &signer,
    framework: &signer,
) {
    // 1. Initialize framework modules
    timestamp::set_time_has_started_for_testing(framework);
    randomness::initialize_for_testing(framework);  // ← THIS IS THE KEY LINE
    let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(framework);

    // 2. Create test accounts
    account::create_account_for_test(signer::address_of(owner));
    account::create_account_for_test(signer::address_of(resolver));
    account::create_account_for_test(signer::address_of(player));

    // 3. Fund accounts that need APT
    coin::register<AptosCoin>(player);
    let coins = coin::mint<AptosCoin>(100_000_000, &mint_cap); // 1 APT
    coin::deposit(signer::address_of(player), coins);

    // 4. Initialize your modules
    // price_feed_helper::initialize(owner, 850_000_000);
    // bank::initialize(owner, ...);
    // quickplay::initialize(owner, resolver_addr, ...);

    // 5. Cleanup capabilities
    coin::destroy_burn_cap(burn_cap);
    coin::destroy_mint_cap(mint_cap);
}
```

## Testing a #[randomness] Function

After `randomness::initialize_for_testing()`, you can call `#[randomness] entry fun` directly:

```move
#[test(owner = @deal_or_not, resolver = @0xBEEF, player = @0x123, framework = @aptos_framework)]
fun test_reveal_case(
    owner: &signer, resolver: &signer, player: &signer, framework: &signer,
) acquires GameStore {
    setup_test_env(owner, resolver, player, framework);
    create_game(player, @deal_or_not);
    pick_case(player, @deal_or_not, 0, 2);
    open_case(player, @deal_or_not, 0, 0);

    // This calls randomness::u64_range() internally — works after initialize_for_testing()
    reveal_case(resolver, @deal_or_not, 0);

    let store = borrow_global<GameStore>(@deal_or_not);
    let game = smart_table::borrow(&store.games, 0);
    assert!(game.phase == PHASE_AWAITING_OFFER, 0);
    // Value is random but must be one of [1, 5, 10, 50, 100]
    let val = *vector::borrow(&game.case_values, 0);
    assert!(val == 1 || val == 5 || val == 10 || val == 50 || val == 100, 1);
}
```

## Common Gotchas

1. **`randomness::initialize_for_testing()` is all you need.** Don't overthink it. The journal said "needs deeper test infrastructure" — it doesn't.

2. **Test randomness is non-deterministic** by default. Don't assert exact random values — assert that results are within valid ranges.

3. **`timestamp::set_time_has_started_for_testing()` must come first.** Many modules depend on timestamps.

4. **`timestamp::fast_forward_seconds(N)` for time-dependent tests.** But note: `now_seconds()` starts at 0 in tests. If your code checks `created_at > 0`, advance time by 1 second before creating the resource.

5. **`entry fun` (without `public`) is callable from within the same module's tests.** You don't need `#[test_only]` wrappers.

## Test Count: What "Good" Looks Like

For a game module, aim to test:
- Each phase transition (create → pick → round → ...)
- Error conditions (`#[expected_failure]`)
- Full game flow (create through game over)
- Edge cases (expire, max values, boundary conditions)

Our quickplay module has 11 tests covering: create, pick, pick_wrong_phase, open, open_own_case_fails, reveal, set_banker_offer, full_accept_deal, full_keep_case, expire_game, get_next_game_id.
