/// @title price_feed_helper — APT/USD conversion utilities
/// @notice Wraps price feed data for USD<->Octas conversions with staleness checks
/// and price snapshots. Ported from PriceFeedHelper.sol.
///
/// Key difference from Solidity:
/// - APT has 8 decimals (1 APT = 10^8 octas) vs ETH's 18 decimals (1 ETH = 10^18 wei)
/// - Chainlink price feeds return 8-decimal prices on both chains
/// - Conversion formula changes: (usdCents * 1e14) / aptUsdPrice (vs 1e24 for ETH)
///
/// For production: integrate with Chainlink Data Feeds for Aptos
///   - data_feeds::router::get_benchmarks(signer, feed_ids, billing_data)
///   - Returns Benchmark { benchmark: u256, observation_timestamp: u256 }
///   - Feed IDs are vector<u8> (32 bytes, hex-encoded)
///
/// For development/testing: uses a stored price set by admin (MockPriceFeed pattern)
module deal_or_not::price_feed_helper {
    use std::signer;
    use aptos_framework::timestamp;

    // ── Error Codes ──
    const E_STALE_PRICE_FEED: u64 = 100;
    const E_PRICE_NOT_POSITIVE: u64 = 101;
    const E_NOT_ADMIN: u64 = 102;
    const E_NOT_INITIALIZED: u64 = 103;

    // ── Constants ──
    // APT has 8 decimals, Chainlink price feeds have 8 decimals
    // To convert USD cents to octas: (cents * 10^(8+8-2)) / price = (cents * 10^14) / price
    const CENTS_TO_OCTAS_MULTIPLIER: u128 = 100_000_000_000_000; // 1e14
    // For snapshotPrice (aptPerDollar): 10^(8+8) / price = 10^16 / price
    const SNAPSHOT_MULTIPLIER: u128 = 10_000_000_000_000_000; // 1e16

    // Default max staleness: 1 hour (3600 seconds)
    const DEFAULT_MAX_STALENESS: u64 = 3600;

    // ── State ──
    // Stored price feed data (mock for dev, replaced by Chainlink in production)
    struct PriceFeedState has key {
        admin: address,
        // APT/USD price with 8 decimals (e.g., 850_000_000 = $8.50)
        apt_usd_price: u64,
        // Timestamp of last update
        updated_at: u64,
    }

    // ── Initialization ──

    /// Initialize the price feed with an admin and initial price.
    /// In production, this would be replaced by Chainlink Data Feed reads.
    public entry fun initialize(admin: &signer, initial_price: u64) {
        let admin_addr = signer::address_of(admin);
        assert!(initial_price > 0, E_PRICE_NOT_POSITIVE);
        move_to(admin, PriceFeedState {
            admin: admin_addr,
            apt_usd_price: initial_price,
            updated_at: timestamp::now_seconds(),
        });
    }

    /// Update the price (admin only). Simulates oracle price update.
    public entry fun update_price(admin: &signer, new_price: u64) acquires PriceFeedState {
        let admin_addr = signer::address_of(admin);
        let state = borrow_global_mut<PriceFeedState>(admin_addr);
        assert!(state.admin == admin_addr, E_NOT_ADMIN);
        assert!(new_price > 0, E_PRICE_NOT_POSITIVE);
        state.apt_usd_price = new_price;
        state.updated_at = timestamp::now_seconds();
    }

    // ── Core Conversion Functions ──

    /// Convert USD cents to octas using a live price.
    /// Pattern: (usdCents * 1e14) / aptUsdPrice
    /// Example: 25 cents at $8.50/APT = (25 * 1e14) / 850_000_000 = 2,941,176 octas (~0.029 APT)
    public fun usd_to_octas(feed_addr: address, usd_cents: u64): u64 acquires PriceFeedState {
        let state = borrow_global<PriceFeedState>(feed_addr);
        assert!(state.apt_usd_price > 0, E_PRICE_NOT_POSITIVE);
        assert!(
            timestamp::now_seconds() - state.updated_at <= DEFAULT_MAX_STALENESS,
            E_STALE_PRICE_FEED
        );
        let cents = (usd_cents as u128);
        let price = (state.apt_usd_price as u128);
        ((cents * CENTS_TO_OCTAS_MULTIPLIER / price) as u64)
    }

    /// Convert octas to USD cents using a live price.
    public fun octas_to_usd(feed_addr: address, octas_amount: u64): u64 acquires PriceFeedState {
        let state = borrow_global<PriceFeedState>(feed_addr);
        assert!(state.apt_usd_price > 0, E_PRICE_NOT_POSITIVE);
        assert!(
            timestamp::now_seconds() - state.updated_at <= DEFAULT_MAX_STALENESS,
            E_STALE_PRICE_FEED
        );
        let octas = (octas_amount as u128);
        let price = (state.apt_usd_price as u128);
        ((octas * price / CENTS_TO_OCTAS_MULTIPLIER) as u64)
    }

    /// Get the current APT/USD price (8 decimals).
    public fun get_apt_usd_price(feed_addr: address): u64 acquires PriceFeedState {
        let state = borrow_global<PriceFeedState>(feed_addr);
        assert!(state.apt_usd_price > 0, E_PRICE_NOT_POSITIVE);
        assert!(
            timestamp::now_seconds() - state.updated_at <= DEFAULT_MAX_STALENESS,
            E_STALE_PRICE_FEED
        );
        state.apt_usd_price
    }

    /// Snapshot aptPerDollar for a game. Stores a fixed conversion rate
    /// so the game settles at the price when it started, not when it ends.
    /// Returns: 1e16 / aptUsdPrice
    public fun snapshot_price(feed_addr: address): u64 acquires PriceFeedState {
        let state = borrow_global<PriceFeedState>(feed_addr);
        assert!(state.apt_usd_price > 0, E_PRICE_NOT_POSITIVE);
        let price = (state.apt_usd_price as u128);
        ((SNAPSHOT_MULTIPLIER / price) as u64)
    }

    /// Snapshot with staleness check.
    public fun snapshot_price_with_staleness(
        feed_addr: address,
        max_staleness: u64,
    ): u64 acquires PriceFeedState {
        let state = borrow_global<PriceFeedState>(feed_addr);
        assert!(state.apt_usd_price > 0, E_PRICE_NOT_POSITIVE);
        assert!(
            timestamp::now_seconds() - state.updated_at <= max_staleness,
            E_STALE_PRICE_FEED
        );
        let price = (state.apt_usd_price as u128);
        ((SNAPSHOT_MULTIPLIER / price) as u64)
    }

    /// Convert cents to octas using a snapshot aptPerDollar (not live feed).
    /// Used during game settlement with the price locked at game start.
    public fun cents_to_octas_snapshot(cents: u64, apt_per_dollar: u64): u64 {
        let c = (cents as u128);
        let rate = (apt_per_dollar as u128);
        ((c * rate / 100) as u64)
    }

    /// Check if the price feed is fresh.
    public fun is_fresh(feed_addr: address, max_staleness: u64): bool acquires PriceFeedState {
        let state = borrow_global<PriceFeedState>(feed_addr);
        timestamp::now_seconds() - state.updated_at <= max_staleness
    }

    // ── Tests ──

    #[test_only]
    use aptos_framework::account;

    #[test(admin = @0xCAFE, framework = @aptos_framework)]
    fun test_usd_to_octas(admin: &signer, framework: &signer) acquires PriceFeedState {
        // Setup
        timestamp::set_time_has_started_for_testing(framework);
        account::create_account_for_test(signer::address_of(admin));

        // APT/USD = $8.50 = 850_000_000 (8 decimals)
        initialize(admin, 850_000_000);

        // 25 cents at $8.50/APT
        // = (25 * 1e14) / 850_000_000
        // = 2_500_000_000_000_000 / 850_000_000
        // = 2_941_176 octas (~0.029 APT)
        let octas = usd_to_octas(@0xCAFE, 25);
        assert!(octas == 2_941_176, 0);
    }

    #[test(admin = @0xCAFE, framework = @aptos_framework)]
    fun test_octas_to_usd(admin: &signer, framework: &signer) acquires PriceFeedState {
        timestamp::set_time_has_started_for_testing(framework);
        account::create_account_for_test(signer::address_of(admin));

        // APT/USD = $8.50
        initialize(admin, 850_000_000);

        // 2_941_176 octas at $8.50/APT
        // = (2_941_176 * 850_000_000) / 1e14
        // = 24 cents (rounding)
        let cents = octas_to_usd(@0xCAFE, 2_941_176);
        assert!(cents == 24, 0); // slight rounding from integer division
    }

    #[test(admin = @0xCAFE, framework = @aptos_framework)]
    fun test_snapshot_price(admin: &signer, framework: &signer) acquires PriceFeedState {
        timestamp::set_time_has_started_for_testing(framework);
        account::create_account_for_test(signer::address_of(admin));

        // APT/USD = $8.50 = 850_000_000
        initialize(admin, 850_000_000);

        // aptPerDollar = 1e16 / 850_000_000 = 11_764_705
        let apt_per_dollar = snapshot_price(@0xCAFE);
        assert!(apt_per_dollar == 11_764_705, 0);

        // Now use snapshot for settlement: 100 cents ($1.00) at that rate
        // = (100 * 11_764_705) / 100 = 11_764_705 octas
        let payout = cents_to_octas_snapshot(100, apt_per_dollar);
        assert!(payout == 11_764_705, 0);
    }

    #[test(admin = @0xCAFE, framework = @aptos_framework)]
    fun test_cents_to_octas_snapshot_25_cents(admin: &signer, framework: &signer) acquires PriceFeedState {
        timestamp::set_time_has_started_for_testing(framework);
        account::create_account_for_test(signer::address_of(admin));

        initialize(admin, 850_000_000);

        let apt_per_dollar = snapshot_price(@0xCAFE);
        // 25 cents ($0.25) at snapshot rate
        let octas = cents_to_octas_snapshot(25, apt_per_dollar);
        assert!(octas == 2_941_176, 0);
    }

    #[test(admin = @0xCAFE, framework = @aptos_framework)]
    #[expected_failure(abort_code = E_PRICE_NOT_POSITIVE)]
    fun test_zero_price_fails(admin: &signer, framework: &signer) {
        timestamp::set_time_has_started_for_testing(framework);
        account::create_account_for_test(signer::address_of(admin));
        initialize(admin, 0);
    }
}
