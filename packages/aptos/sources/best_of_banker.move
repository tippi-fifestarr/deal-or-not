/// @title best_of_banker — On-chain gallery of AI Banker quotes with paid upvoting
/// @notice Gallery of AI Banker messages with paid upvoting. Players can upvote
/// their favorite banker quotes for $0.02 per upvote.
/// Ported from BestOfBanker.sol.
///
/// Key differences from Solidity:
/// - No IReceiver/onReport — authorized writers call saveQuote directly
/// - Upvote cost in APT octas (via price feed) vs ETH wei
/// - Uses SmartTable for quotes and hasUpvoted tracking
module deal_or_not::best_of_banker {
    use std::signer;
    use std::string::{Self, String};
    use std::vector;
    use aptos_framework::aptos_account;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::coin;
    use aptos_framework::timestamp;
    use aptos_framework::account::{Self, SignerCapability};
    use aptos_std::smart_table::{Self, SmartTable};

    // ── Error Codes ──
    const E_NOT_WRITER: u64 = 800;
    const E_ALREADY_UPVOTED: u64 = 801;
    const E_INVALID_QUOTE: u64 = 802;
    const E_EMPTY_MESSAGE: u64 = 803;
    const E_INSUFFICIENT_PAYMENT: u64 = 804;
    const E_NOT_OWNER: u64 = 805;
    const E_ALREADY_INITIALIZED: u64 = 806;

    // ── Constants ──
    const UPVOTE_COST_CENTS: u64 = 2; // $0.02 per upvote

    // Resource account seed
    const BANKER_SEED: vector<u8> = b"DEAL_OR_NOT_BANKER_QUOTES";

    // ── State ──

    struct Quote has store, copy, drop {
        game_id: u64,
        round: u8,
        message: String,
        upvotes: u64,
        timestamp: u64,
    }

    // Key for tracking who has upvoted which quote
    struct VoteKey has store, copy, drop {
        quote_id: u64,
        voter: address,
    }

    struct BankerState has key {
        owner: address,
        vault_signer_cap: SignerCapability,
        vault_address: address,
        price_feed_addr: address,
        quotes: vector<Quote>,
        latest_quote_for_game: SmartTable<u64, u64>, // game_id → quote_index
        has_upvoted: SmartTable<VoteKey, bool>,
        writers: SmartTable<address, bool>,
    }

    // ── Events ──

    #[event]
    struct QuoteSaved has drop, store {
        quote_id: u64,
        game_id: u64,
        round: u8,
        message: String,
    }

    #[event]
    struct QuoteUpvoted has drop, store {
        quote_id: u64,
        voter: address,
        total_upvotes: u64,
    }

    // ── Initialization ──

    public entry fun initialize(
        owner: &signer,
        price_feed_addr: address,
    ) {
        let owner_addr = signer::address_of(owner);
        assert!(!exists<BankerState>(owner_addr), E_ALREADY_INITIALIZED);

        let (vault_signer, vault_signer_cap) = account::create_resource_account(
            owner,
            BANKER_SEED,
        );
        let vault_address = signer::address_of(&vault_signer);
        coin::register<AptosCoin>(&vault_signer);

        move_to(owner, BankerState {
            owner: owner_addr,
            vault_signer_cap,
            vault_address,
            price_feed_addr,
            quotes: vector[],
            latest_quote_for_game: smart_table::new(),
            has_upvoted: smart_table::new(),
            writers: smart_table::new(),
        });
    }

    // ── Admin ──

    public entry fun set_writer(
        owner: &signer,
        writer: address,
        authorized: bool,
    ) acquires BankerState {
        let owner_addr = signer::address_of(owner);
        let state = borrow_global_mut<BankerState>(owner_addr);
        assert!(state.owner == owner_addr, E_NOT_OWNER);
        smart_table::upsert(&mut state.writers, writer, authorized);
    }

    public entry fun withdraw(
        owner: &signer,
        to: address,
    ) acquires BankerState {
        let owner_addr = signer::address_of(owner);
        let state = borrow_global<BankerState>(owner_addr);
        assert!(state.owner == owner_addr, E_NOT_OWNER);

        let balance = coin::balance<AptosCoin>(state.vault_address);
        if (balance > 0) {
            let vault_signer = account::create_signer_with_capability(&state.vault_signer_cap);
            aptos_account::transfer(&vault_signer, to, balance);
        };
    }

    // ── Quote Management ──

    public entry fun save_quote(
        writer: &signer,
        banker_addr: address,
        game_id: u64,
        round: u8,
        message: String,
    ) acquires BankerState {
        let writer_addr = signer::address_of(writer);
        let state = borrow_global_mut<BankerState>(banker_addr);

        assert!(
            smart_table::contains(&state.writers, writer_addr)
                && *smart_table::borrow(&state.writers, writer_addr),
            E_NOT_WRITER,
        );
        assert!(string::length(&message) > 0, E_EMPTY_MESSAGE);

        let quote_id = vector::length(&state.quotes);
        vector::push_back(&mut state.quotes, Quote {
            game_id,
            round,
            message,
            upvotes: 0,
            timestamp: timestamp::now_seconds(),
        });

        smart_table::upsert(&mut state.latest_quote_for_game, game_id, quote_id);

        std::event::emit(QuoteSaved {
            quote_id,
            game_id,
            round,
            message: vector::borrow(&state.quotes, quote_id).message,
        });
    }

    /// Upvote a quote by paying $0.02 in APT.
    public entry fun upvote(
        voter: &signer,
        banker_addr: address,
        quote_id: u64,
    ) acquires BankerState {
        let voter_addr = signer::address_of(voter);
        let state = borrow_global_mut<BankerState>(banker_addr);

        assert!(quote_id < vector::length(&state.quotes), E_INVALID_QUOTE);

        // Check not already upvoted
        let vote_key = VoteKey { quote_id, voter: voter_addr };
        assert!(
            !smart_table::contains(&state.has_upvoted, vote_key),
            E_ALREADY_UPVOTED,
        );

        // Calculate upvote cost in octas
        let cost_octas = deal_or_not::price_feed_helper::usd_to_octas(
            state.price_feed_addr,
            UPVOTE_COST_CENTS,
        );
        assert!(coin::balance<AptosCoin>(voter_addr) >= cost_octas, E_INSUFFICIENT_PAYMENT);

        // Pay
        aptos_account::transfer(voter, state.vault_address, cost_octas);

        // Record upvote
        smart_table::add(&mut state.has_upvoted, vote_key, true);
        let quote = vector::borrow_mut(&mut state.quotes, quote_id);
        quote.upvotes = quote.upvotes + 1;

        std::event::emit(QuoteUpvoted {
            quote_id,
            voter: voter_addr,
            total_upvotes: quote.upvotes,
        });
    }

    // ── View Functions ──

    #[view]
    public fun quote_count(banker_addr: address): u64 acquires BankerState {
        vector::length(&borrow_global<BankerState>(banker_addr).quotes)
    }

    #[view]
    public fun get_quote(
        banker_addr: address,
        quote_id: u64,
    ): (u64, u8, String, u64, u64) acquires BankerState {
        let state = borrow_global<BankerState>(banker_addr);
        assert!(quote_id < vector::length(&state.quotes), E_INVALID_QUOTE);
        let q = vector::borrow(&state.quotes, quote_id);
        (q.game_id, q.round, q.message, q.upvotes, q.timestamp)
    }

    #[view]
    public fun get_latest_message(
        banker_addr: address,
        game_id: u64,
    ): String acquires BankerState {
        let state = borrow_global<BankerState>(banker_addr);
        if (!smart_table::contains(&state.latest_quote_for_game, game_id)) {
            return string::utf8(b"")
        };
        let idx = *smart_table::borrow(&state.latest_quote_for_game, game_id);
        vector::borrow(&state.quotes, idx).message
    }

    // ── Tests ──

    #[test_only]
    use aptos_framework::aptos_coin;

    #[test(owner = @0xCAFE, framework = @aptos_framework)]
    fun test_initialize_and_save_quote(
        owner: &signer,
        framework: &signer,
    ) acquires BankerState {
        timestamp::set_time_has_started_for_testing(framework);
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(framework);
        account::create_account_for_test(signer::address_of(owner));

        deal_or_not::price_feed_helper::initialize(owner, 850_000_000);
        initialize(owner, @0xCAFE);
        set_writer(owner, @0xCAFE, true);

        save_quote(
            owner,
            @0xCAFE,
            1,
            1,
            string::utf8(b"No deal! The suspense is killing me!"),
        );

        assert!(quote_count(@0xCAFE) == 1, 0);

        let (game_id, round, _msg, upvotes, _ts) = get_quote(@0xCAFE, 0);
        assert!(game_id == 1, 1);
        assert!(round == 1, 2);
        assert!(upvotes == 0, 3);

        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);
    }
}
