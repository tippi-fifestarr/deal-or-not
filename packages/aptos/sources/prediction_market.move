/// @title prediction_market — Bet on agent game outcomes
/// @notice Prediction markets for game outcomes. Users bet on: Will agent win?
/// Will earnings exceed X? Will accept offer? Which round finishes in?
/// 2% platform fee. Ported from PredictionMarket.sol.
///
/// Key differences from Solidity:
/// - enum → u8 constants (Move has no enums)
/// - APT bets in octas (8 decimals) vs ETH bets in wei (18 decimals)
/// - MIN_BET = 100_000 octas (0.001 APT) vs 0.001 ETH
/// - Resource account holds all bet funds
module deal_or_not::prediction_market {
    use std::signer;
    use std::vector;
    use aptos_framework::aptos_account;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::coin;
    use aptos_framework::timestamp;
    use aptos_framework::account::{Self, SignerCapability};
    use aptos_std::smart_table::{Self, SmartTable};

    // ── Error Codes ──
    const E_MARKET_NOT_OPEN: u64 = 600;
    const E_MARKET_LOCKED: u64 = 601;
    const E_MARKET_NOT_RESOLVED: u64 = 602;
    const E_BET_TOO_SMALL: u64 = 603;
    const E_BET_ALREADY_CLAIMED: u64 = 604;
    const E_NOT_WINNER: u64 = 605;
    const E_UNAUTHORIZED: u64 = 606;
    const E_INVALID_MARKET: u64 = 607;
    const E_ZERO_AMOUNT: u64 = 608;
    const E_ALREADY_INITIALIZED: u64 = 609;
    const E_BET_NOT_FOUND: u64 = 610;

    // ── Market Type Constants (replaces Solidity enum) ──
    const MARKET_WILL_WIN: u8 = 0;
    const MARKET_EARNINGS_OVER: u8 = 1;
    const MARKET_WILL_ACCEPT_OFFER: u8 = 2;
    const MARKET_ROUND_PREDICTION: u8 = 3;

    // ── Market Status Constants ──
    const STATUS_OPEN: u8 = 0;
    const STATUS_LOCKED: u8 = 1;
    const STATUS_RESOLVED: u8 = 2;
    const STATUS_CANCELLED: u8 = 3;

    // ── Constants ──
    const PLATFORM_FEE: u64 = 200; // 2% in basis points
    const MIN_BET: u64 = 100_000; // 0.001 APT in octas
    const LOCK_BEFORE_GAME_START: u64 = 300; // 5 minutes

    // Resource account seed
    const MARKET_SEED: vector<u8> = b"DEAL_OR_NOT_MARKET";

    // ── State ──

    struct Market has store, copy, drop {
        game_id: u64,
        agent_id: u64,
        market_type: u8,
        target_value: u64,
        status: u8,
        outcome: bool, // true = YES won
        created_at: u64,
        lock_time: u64,
        total_pool: u64,
        yes_pool: u64,
        no_pool: u64,
    }

    struct Bet has store, copy, drop {
        bettor: address,
        market_id: u64,
        prediction: bool, // true = YES
        amount: u64,
        claimed: bool,
    }

    struct MarketState has key {
        admin: address,
        vault_signer_cap: SignerCapability,
        vault_address: address,
        markets: SmartTable<u64, Market>,
        bets: SmartTable<u64, Bet>,
        market_bets: SmartTable<u64, vector<u64>>,
        user_bets: SmartTable<address, vector<u64>>,
        game_markets: SmartTable<u64, vector<u64>>,
        next_market_id: u64,
        next_bet_id: u64,
        total_volume: u64,
        total_fees_collected: u64,
        authorized_resolvers: SmartTable<address, bool>,
    }

    // ── Events ──

    #[event]
    struct MarketCreated has drop, store {
        market_id: u64,
        game_id: u64,
        agent_id: u64,
        market_type: u8,
        target_value: u64,
    }

    #[event]
    struct BetPlaced has drop, store {
        bet_id: u64,
        bettor: address,
        market_id: u64,
        prediction: bool,
        amount: u64,
    }

    #[event]
    struct MarketResolved has drop, store {
        market_id: u64,
        outcome: bool,
        total_pool: u64,
    }

    #[event]
    struct PayoutClaimed has drop, store {
        bet_id: u64,
        bettor: address,
        amount: u64,
    }

    // ── Initialization ──

    public entry fun initialize(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<MarketState>(admin_addr), E_ALREADY_INITIALIZED);

        let (vault_signer, vault_signer_cap) = account::create_resource_account(
            admin,
            MARKET_SEED,
        );
        let vault_address = signer::address_of(&vault_signer);
        coin::register<AptosCoin>(&vault_signer);

        move_to(admin, MarketState {
            admin: admin_addr,
            vault_signer_cap,
            vault_address,
            markets: smart_table::new(),
            bets: smart_table::new(),
            market_bets: smart_table::new(),
            user_bets: smart_table::new(),
            game_markets: smart_table::new(),
            next_market_id: 1,
            next_bet_id: 1,
            total_volume: 0,
            total_fees_collected: 0,
            authorized_resolvers: smart_table::new(),
        });
    }

    // ── Admin ──

    public entry fun authorize_resolver(
        admin: &signer,
        resolver: address,
    ) acquires MarketState {
        let admin_addr = signer::address_of(admin);
        let state = borrow_global_mut<MarketState>(admin_addr);
        assert!(state.admin == admin_addr, E_UNAUTHORIZED);
        smart_table::upsert(&mut state.authorized_resolvers, resolver, true);
    }

    public entry fun revoke_resolver(
        admin: &signer,
        resolver: address,
    ) acquires MarketState {
        let admin_addr = signer::address_of(admin);
        let state = borrow_global_mut<MarketState>(admin_addr);
        assert!(state.admin == admin_addr, E_UNAUTHORIZED);
        if (smart_table::contains(&state.authorized_resolvers, resolver)) {
            smart_table::remove(&mut state.authorized_resolvers, resolver);
        };
    }

    // ── Market Creation (authorized only) ──

    public fun create_market(
        market_addr: address,
        caller: address,
        game_id: u64,
        agent_id: u64,
        market_type: u8,
        target_value: u64,
        lock_time: u64,
    ): u64 acquires MarketState {
        let state = borrow_global_mut<MarketState>(market_addr);
        assert!(
            smart_table::contains(&state.authorized_resolvers, caller)
                && *smart_table::borrow(&state.authorized_resolvers, caller),
            E_UNAUTHORIZED,
        );

        let market_id = state.next_market_id;
        let market = Market {
            game_id,
            agent_id,
            market_type,
            target_value,
            status: STATUS_OPEN,
            outcome: false,
            created_at: timestamp::now_seconds(),
            lock_time,
            total_pool: 0,
            yes_pool: 0,
            no_pool: 0,
        };

        smart_table::add(&mut state.markets, market_id, market);
        smart_table::add(&mut state.market_bets, market_id, vector[]);

        // Track game's markets
        if (!smart_table::contains(&state.game_markets, game_id)) {
            smart_table::add(&mut state.game_markets, game_id, vector[market_id]);
        } else {
            let ids = smart_table::borrow_mut(&mut state.game_markets, game_id);
            vector::push_back(ids, market_id);
        };

        state.next_market_id = market_id + 1;

        std::event::emit(MarketCreated {
            market_id,
            game_id,
            agent_id,
            market_type,
            target_value,
        });

        market_id
    }

    // ── Betting ──

    public entry fun place_bet(
        bettor: &signer,
        market_addr: address,
        market_id: u64,
        prediction: bool,
        amount: u64,
    ) acquires MarketState {
        assert!(amount >= MIN_BET, E_BET_TOO_SMALL);

        let bettor_addr = signer::address_of(bettor);
        let state = borrow_global_mut<MarketState>(market_addr);

        assert!(smart_table::contains(&state.markets, market_id), E_INVALID_MARKET);
        let market = smart_table::borrow(&state.markets, market_id);
        assert!(market.status == STATUS_OPEN, E_MARKET_NOT_OPEN);
        assert!(timestamp::now_seconds() < market.lock_time, E_MARKET_LOCKED);

        // Transfer bet to vault
        aptos_account::transfer(bettor, state.vault_address, amount);

        // Update market pools
        let market_mut = smart_table::borrow_mut(&mut state.markets, market_id);
        market_mut.total_pool = market_mut.total_pool + amount;
        if (prediction) {
            market_mut.yes_pool = market_mut.yes_pool + amount;
        } else {
            market_mut.no_pool = market_mut.no_pool + amount;
        };

        // Create bet
        let bet_id = state.next_bet_id;
        smart_table::add(&mut state.bets, bet_id, Bet {
            bettor: bettor_addr,
            market_id,
            prediction,
            amount,
            claimed: false,
        });

        // Track bet associations
        let market_bet_ids = smart_table::borrow_mut(&mut state.market_bets, market_id);
        vector::push_back(market_bet_ids, bet_id);

        if (!smart_table::contains(&state.user_bets, bettor_addr)) {
            smart_table::add(&mut state.user_bets, bettor_addr, vector[bet_id]);
        } else {
            let user_bet_ids = smart_table::borrow_mut(&mut state.user_bets, bettor_addr);
            vector::push_back(user_bet_ids, bet_id);
        };

        state.next_bet_id = bet_id + 1;
        state.total_volume = state.total_volume + amount;

        std::event::emit(BetPlaced {
            bet_id,
            bettor: bettor_addr,
            market_id,
            prediction,
            amount,
        });
    }

    // ── Market Resolution ──

    public fun lock_market(
        market_addr: address,
        caller: address,
        market_id: u64,
    ) acquires MarketState {
        let state = borrow_global_mut<MarketState>(market_addr);
        assert!(
            smart_table::contains(&state.authorized_resolvers, caller)
                && *smart_table::borrow(&state.authorized_resolvers, caller),
            E_UNAUTHORIZED,
        );
        assert!(smart_table::contains(&state.markets, market_id), E_INVALID_MARKET);

        let market = smart_table::borrow_mut(&mut state.markets, market_id);
        assert!(market.status == STATUS_OPEN, E_MARKET_NOT_OPEN);
        market.status = STATUS_LOCKED;
    }

    public fun resolve_market(
        market_addr: address,
        caller: address,
        market_id: u64,
        outcome: bool,
    ) acquires MarketState {
        let state = borrow_global_mut<MarketState>(market_addr);
        assert!(
            smart_table::contains(&state.authorized_resolvers, caller)
                && *smart_table::borrow(&state.authorized_resolvers, caller),
            E_UNAUTHORIZED,
        );
        assert!(smart_table::contains(&state.markets, market_id), E_INVALID_MARKET);

        let market = smart_table::borrow_mut(&mut state.markets, market_id);
        assert!(market.status == STATUS_OPEN || market.status == STATUS_LOCKED, E_MARKET_NOT_OPEN);
        market.status = STATUS_RESOLVED;
        market.outcome = outcome;

        std::event::emit(MarketResolved {
            market_id,
            outcome,
            total_pool: market.total_pool,
        });
    }

    public fun cancel_market(
        market_addr: address,
        caller: address,
        market_id: u64,
    ) acquires MarketState {
        let state = borrow_global_mut<MarketState>(market_addr);
        assert!(
            smart_table::contains(&state.authorized_resolvers, caller)
                && *smart_table::borrow(&state.authorized_resolvers, caller),
            E_UNAUTHORIZED,
        );

        let market = smart_table::borrow_mut(&mut state.markets, market_id);
        market.status = STATUS_CANCELLED;
    }

    // ── Claiming ──

    public entry fun claim_payout(
        bettor: &signer,
        market_addr: address,
        bet_id: u64,
    ) acquires MarketState {
        let bettor_addr = signer::address_of(bettor);
        let state = borrow_global_mut<MarketState>(market_addr);

        assert!(smart_table::contains(&state.bets, bet_id), E_BET_NOT_FOUND);

        // Read all needed values before any mutable borrow
        let bet = *smart_table::borrow(&state.bets, bet_id);
        assert!(bet.bettor == bettor_addr, E_UNAUTHORIZED);
        assert!(!bet.claimed, E_BET_ALREADY_CLAIMED);

        let market = *smart_table::borrow(&state.markets, bet.market_id);

        let payout = if (market.status == STATUS_CANCELLED) {
            // Refund on cancellation
            bet.amount
        } else {
            assert!(market.status == STATUS_RESOLVED, E_MARKET_NOT_RESOLVED);
            assert!(bet.prediction == market.outcome, E_NOT_WINNER);

            // Calculate payout: (bet_amount / winning_pool) * total_pool * (1 - fee)
            let winning_pool = if (market.outcome) { market.yes_pool } else { market.no_pool };
            if (winning_pool == 0) {
                0
            } else {
                let gross = (bet.amount as u128) * (market.total_pool as u128)
                    / (winning_pool as u128);
                let fee = gross * (PLATFORM_FEE as u128) / 10000;
                ((gross - fee) as u64)
            }
        };

        // Mark claimed (now safe to borrow mutably)
        let bet_mut = smart_table::borrow_mut(&mut state.bets, bet_id);
        bet_mut.claimed = true;

        if (payout > 0) {
            let vault_signer = account::create_signer_with_capability(&state.vault_signer_cap);
            aptos_account::transfer(&vault_signer, bettor_addr, payout);

            if (market.status == STATUS_RESOLVED) {
                let winning_pool = if (market.outcome) { market.yes_pool } else { market.no_pool };
                let fee_amount = (bet.amount as u128) * (market.total_pool as u128)
                    / (winning_pool as u128);
                let fee = ((fee_amount * (PLATFORM_FEE as u128) / 10000) as u64);
                state.total_fees_collected = state.total_fees_collected + fee;
            };
        };

        std::event::emit(PayoutClaimed {
            bet_id,
            bettor: bettor_addr,
            amount: payout,
        });
    }

    // ── Admin Fee Withdrawal ──

    public entry fun withdraw_fees(
        admin: &signer,
        to: address,
    ) acquires MarketState {
        let admin_addr = signer::address_of(admin);
        let state = borrow_global_mut<MarketState>(admin_addr);
        assert!(state.admin == admin_addr, E_UNAUTHORIZED);
        assert!(state.total_fees_collected > 0, E_ZERO_AMOUNT);

        let vault_signer = account::create_signer_with_capability(&state.vault_signer_cap);
        let balance = coin::balance<AptosCoin>(state.vault_address);
        let withdraw_amount = if (state.total_fees_collected > balance) { balance }
            else { state.total_fees_collected };

        aptos_account::transfer(&vault_signer, to, withdraw_amount);
        state.total_fees_collected = state.total_fees_collected - withdraw_amount;
    }

    // ── View Functions ──

    #[view]
    public fun get_market(
        market_addr: address,
        market_id: u64,
    ): (u64, u64, u8, u64, u8, bool, u64, u64, u64) acquires MarketState {
        let state = borrow_global<MarketState>(market_addr);
        assert!(smart_table::contains(&state.markets, market_id), E_INVALID_MARKET);
        let m = smart_table::borrow(&state.markets, market_id);
        (m.game_id, m.agent_id, m.market_type, m.target_value,
         m.status, m.outcome, m.total_pool, m.yes_pool, m.no_pool)
    }

    #[view]
    public fun get_market_odds(
        market_addr: address,
        market_id: u64,
    ): (u64, u64) acquires MarketState {
        let state = borrow_global<MarketState>(market_addr);
        assert!(smart_table::contains(&state.markets, market_id), E_INVALID_MARKET);
        let m = smart_table::borrow(&state.markets, market_id);
        if (m.total_pool == 0) return (5000, 5000);
        let yes_odds = m.yes_pool * 10000 / m.total_pool;
        let no_odds = m.no_pool * 10000 / m.total_pool;
        (yes_odds, no_odds)
    }

    #[view]
    public fun get_total_volume(market_addr: address): u64 acquires MarketState {
        borrow_global<MarketState>(market_addr).total_volume
    }

    // ── Tests ──

    #[test_only]
    use aptos_framework::aptos_coin;

    #[test(admin = @0xCAFE, framework = @aptos_framework)]
    fun test_initialize(admin: &signer, framework: &signer) acquires MarketState {
        timestamp::set_time_has_started_for_testing(framework);
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(framework);
        account::create_account_for_test(signer::address_of(admin));

        initialize(admin);

        let state = borrow_global<MarketState>(@0xCAFE);
        assert!(state.next_market_id == 1, 0);
        assert!(state.total_volume == 0, 1);

        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);
    }

    #[test(admin = @0xCAFE, resolver = @0xBEEF, framework = @aptos_framework)]
    fun test_create_market(
        admin: &signer,
        resolver: &signer,
        framework: &signer,
    ) acquires MarketState {
        timestamp::set_time_has_started_for_testing(framework);
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(framework);
        account::create_account_for_test(signer::address_of(admin));
        account::create_account_for_test(@0xBEEF);

        initialize(admin);
        authorize_resolver(admin, @0xBEEF);

        let market_id = create_market(
            @0xCAFE,
            @0xBEEF,
            1, // game_id
            1, // agent_id
            MARKET_WILL_WIN,
            0, // target_value
            timestamp::now_seconds() + 3600, // lock in 1 hour
        );

        assert!(market_id == 1, 0);

        let (game_id, agent_id, market_type, _, status, _, _, _, _) =
            get_market(@0xCAFE, 1);
        assert!(game_id == 1, 1);
        assert!(agent_id == 1, 2);
        assert!(market_type == MARKET_WILL_WIN, 3);
        assert!(status == STATUS_OPEN, 4);

        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);
    }
}
