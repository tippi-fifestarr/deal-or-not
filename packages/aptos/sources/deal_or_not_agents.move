/// @title deal_or_not_agents — Agent-variant game contract
/// @notice Agent-variant of the core game, designed for autonomous AI agent gameplay.
/// Agents are registered in AgentRegistry, play games orchestrated by an authorized resolver.
/// Ported from DealOrNotAgents.sol + IAgentReceiver pattern.
///
/// Key differences from Solidity:
/// - No VRF/CRE callbacks — uses Two-TX Randomness pattern (same as quickplay)
/// - No `onReport` dispatcher — resolver calls functions directly as authorized signer
/// - Agent stats recorded to AgentRegistry after each game
/// - Phases: 7 (same as quickplay) instead of 9
module deal_or_not::deal_or_not_agents {
    use std::signer;
    use std::string::String;
    use std::vector;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::coin;
    use aptos_framework::timestamp;
    use aptos_framework::randomness;
    use aptos_std::smart_table::{Self, SmartTable};

    // ── Error Codes ──
    const E_WRONG_PHASE: u64 = 700;
    const E_NOT_RESOLVER: u64 = 701;
    const E_INVALID_CASE: u64 = 702;
    const E_CASE_ALREADY_OPENED: u64 = 703;
    const E_CANNOT_OPEN_OWN_CASE: u64 = 704;
    const E_AGENT_NOT_ELIGIBLE: u64 = 705;
    const E_BANK_NOT_ACTIVE: u64 = 706;
    const E_GAME_NOT_FOUND: u64 = 707;
    const E_NOT_OWNER: u64 = 708;
    const E_ALREADY_INITIALIZED: u64 = 709;
    const E_INSUFFICIENT_ENTRY_FEE: u64 = 710;
    const E_MESSAGE_TOO_LONG: u64 = 711;

    // ── Game Constants ──
    const NUM_CASES: u64 = 5;
    const NUM_ROUNDS: u64 = 4;
    const ENTRY_FEE_CENTS: u64 = 25;
    const SLIPPAGE_BPS: u64 = 500;

    // Case values in cents: [1, 5, 10, 50, 100]
    const CASE_VALUE_0: u64 = 1;
    const CASE_VALUE_1: u64 = 5;
    const CASE_VALUE_2: u64 = 10;
    const CASE_VALUE_3: u64 = 50;
    const CASE_VALUE_4: u64 = 100;

    // Phases (same as quickplay)
    const PHASE_CREATED: u8 = 0;
    const PHASE_ROUND: u8 = 1;
    const PHASE_WAITING_FOR_REVEAL: u8 = 2;
    const PHASE_AWAITING_OFFER: u8 = 3;
    const PHASE_BANKER_OFFER: u8 = 4;
    const PHASE_FINAL_ROUND: u8 = 5;
    const PHASE_GAME_OVER: u8 = 6;

    // ── State ──

    struct AgentGame has store, copy, drop {
        agent: address,
        agent_id: u64,
        phase: u8,
        player_case: u8,
        current_round: u8,
        total_collapsed: u8,
        banker_offer: u64,
        banker_message: String,
        final_payout: u64,
        apt_per_dollar: u64,
        used_values_bitmap: u64,
        case_values: vector<u64>,
        opened: vector<bool>,
        pending_case_index: u8,
        created_at: u64,
        entry_deposit: u64,
    }

    struct AgentGameStore has key {
        owner: address,
        resolver: address,
        bank_owner: address,
        registry_addr: address,
        staking_addr: address,
        games: SmartTable<u64, AgentGame>,
        next_game_id: u64,
    }

    // ── Events ──

    #[event]
    struct AgentGameCreated has drop, store {
        game_id: u64,
        agent: address,
        agent_id: u64,
        entry_deposit: u64,
    }

    #[event]
    struct AgentCasePicked has drop, store {
        game_id: u64,
        case_index: u8,
    }

    #[event]
    struct AgentCaseOpenRequested has drop, store {
        game_id: u64,
        case_index: u8,
    }

    #[event]
    struct AgentCaseRevealed has drop, store {
        game_id: u64,
        case_index: u8,
        value_cents: u64,
    }

    #[event]
    struct AgentBankerOfferMade has drop, store {
        game_id: u64,
        offer_cents: u64,
        message: String,
    }

    #[event]
    struct AgentDealAccepted has drop, store {
        game_id: u64,
        payout_cents: u64,
    }

    #[event]
    struct AgentDealRejected has drop, store {
        game_id: u64,
    }

    #[event]
    struct AgentGameResolved has drop, store {
        game_id: u64,
        payout_cents: u64,
        agent_id: u64,
        won: bool,
    }

    // ── Initialization ──

    public entry fun initialize(
        owner: &signer,
        resolver: address,
        bank_owner: address,
        registry_addr: address,
        staking_addr: address,
    ) {
        let owner_addr = signer::address_of(owner);
        assert!(!exists<AgentGameStore>(owner_addr), E_ALREADY_INITIALIZED);

        move_to(owner, AgentGameStore {
            owner: owner_addr,
            resolver,
            bank_owner,
            registry_addr,
            staking_addr,
            games: smart_table::new(),
            next_game_id: 1,
        });
    }

    // ── Admin ──

    public entry fun set_resolver(
        owner: &signer,
        new_resolver: address,
    ) acquires AgentGameStore {
        let owner_addr = signer::address_of(owner);
        let store = borrow_global_mut<AgentGameStore>(owner_addr);
        assert!(store.owner == owner_addr, E_NOT_OWNER);
        store.resolver = new_resolver;
    }

    // ── Game Creation ──

    /// Agent creates a game by paying entry fee.
    public entry fun create_agent_game(
        agent: &signer,
        store_addr: address,
        agent_id: u64,
    ) acquires AgentGameStore {
        let agent_addr = signer::address_of(agent);
        let store = borrow_global_mut<AgentGameStore>(store_addr);

        // Check agent eligibility
        assert!(
            deal_or_not::agent_registry::is_agent_eligible(store.registry_addr, agent_id),
            E_AGENT_NOT_ELIGIBLE,
        );

        // Check bank active
        assert!(deal_or_not::bank::is_active(store.bank_owner), E_BANK_NOT_ACTIVE);

        // Snapshot price
        let price_feed_addr = store.bank_owner; // price feed co-located with bank owner
        let apt_per_dollar = deal_or_not::price_feed_helper::snapshot_price(price_feed_addr);

        // Calculate and collect entry fee
        let entry_fee_octas = deal_or_not::game_math::required_with_slippage(
            deal_or_not::price_feed_helper::cents_to_octas_snapshot(ENTRY_FEE_CENTS, apt_per_dollar),
            SLIPPAGE_BPS,
        );
        assert!(coin::balance<AptosCoin>(agent_addr) >= entry_fee_octas, E_INSUFFICIENT_ENTRY_FEE);

        // Transfer entry fee to bank
        deal_or_not::bank::receive_entry_fee(store.bank_owner, agent, entry_fee_octas);

        let game_id = store.next_game_id;

        let game = AgentGame {
            agent: agent_addr,
            agent_id,
            phase: PHASE_CREATED,
            player_case: 0,
            current_round: 0,
            total_collapsed: 0,
            banker_offer: 0,
            banker_message: std::string::utf8(b""),
            final_payout: 0,
            apt_per_dollar,
            used_values_bitmap: 0,
            case_values: vector[0, 0, 0, 0, 0],
            opened: vector[false, false, false, false, false],
            pending_case_index: 0,
            created_at: timestamp::now_seconds(),
            entry_deposit: entry_fee_octas,
        };

        smart_table::add(&mut store.games, game_id, game);
        store.next_game_id = game_id + 1;

        std::event::emit(AgentGameCreated {
            game_id,
            agent: agent_addr,
            agent_id,
            entry_deposit: entry_fee_octas,
        });
    }

    // ── Agent Actions ──

    /// Agent picks their case (resolver-mediated for fairness).
    public entry fun agent_pick_case(
        resolver: &signer,
        store_addr: address,
        game_id: u64,
        case_index: u8,
    ) acquires AgentGameStore {
        let store = borrow_global_mut<AgentGameStore>(store_addr);
        assert!(signer::address_of(resolver) == store.resolver, E_NOT_RESOLVER);

        let game = smart_table::borrow_mut(&mut store.games, game_id);
        assert!(game.phase == PHASE_CREATED, E_WRONG_PHASE);
        assert!((case_index as u64) < NUM_CASES, E_INVALID_CASE);

        game.player_case = case_index;
        game.phase = PHASE_ROUND;
        game.current_round = 1;

        std::event::emit(AgentCasePicked { game_id, case_index });
    }

    /// Agent requests to open a case (TX1 of two-TX pattern).
    public entry fun agent_open_case(
        resolver: &signer,
        store_addr: address,
        game_id: u64,
        case_index: u8,
    ) acquires AgentGameStore {
        let store = borrow_global_mut<AgentGameStore>(store_addr);
        assert!(signer::address_of(resolver) == store.resolver, E_NOT_RESOLVER);

        let game = smart_table::borrow_mut(&mut store.games, game_id);
        assert!(game.phase == PHASE_ROUND, E_WRONG_PHASE);
        assert!((case_index as u64) < NUM_CASES, E_INVALID_CASE);
        assert!(case_index != game.player_case, E_CANNOT_OPEN_OWN_CASE);
        assert!(!*vector::borrow(&game.opened, (case_index as u64)), E_CASE_ALREADY_OPENED);

        game.pending_case_index = case_index;
        game.phase = PHASE_WAITING_FOR_REVEAL;

        std::event::emit(AgentCaseOpenRequested { game_id, case_index });
    }

    // Reveal case with fresh randomness (TX2 of two-TX pattern)
    #[randomness]
    entry fun reveal_agent_case(
        resolver: &signer,
        store_addr: address,
        game_id: u64,
    ) acquires AgentGameStore {
        let store = borrow_global_mut<AgentGameStore>(store_addr);
        assert!(signer::address_of(resolver) == store.resolver, E_NOT_RESOLVER);

        let game = smart_table::borrow_mut(&mut store.games, game_id);
        assert!(game.phase == PHASE_WAITING_FOR_REVEAL, E_WRONG_PHASE);

        let case_index = game.pending_case_index;

        // Generate random value from unused pool
        let remaining = count_unused_values(game.used_values_bitmap);
        let rand_index = randomness::u64_range(0, remaining);
        let value = pick_unused_value(game.used_values_bitmap, rand_index);

        // Assign value and mark used
        *vector::borrow_mut(&mut game.case_values, (case_index as u64)) = value;
        *vector::borrow_mut(&mut game.opened, (case_index as u64)) = true;
        game.used_values_bitmap = mark_value_used(game.used_values_bitmap, value);
        game.total_collapsed = game.total_collapsed + 1;

        // Determine next phase
        let cases_opened_this_round = (game.total_collapsed as u64);
        if (cases_opened_this_round >= NUM_ROUNDS) {
            // All openable cases done → final round
            game.phase = PHASE_FINAL_ROUND;
        } else if (cases_opened_this_round > 0 && cases_opened_this_round % 1 == 0) {
            // After each case in agent mode → banker offer
            game.phase = PHASE_AWAITING_OFFER;
        } else {
            game.phase = PHASE_ROUND;
        };

        std::event::emit(AgentCaseRevealed {
            game_id,
            case_index,
            value_cents: value,
        });
    }

    /// Set banker offer with optional message.
    public entry fun set_banker_offer(
        resolver: &signer,
        store_addr: address,
        game_id: u64,
        offer_cents: u64,
        message: String,
    ) acquires AgentGameStore {
        let store = borrow_global_mut<AgentGameStore>(store_addr);
        assert!(signer::address_of(resolver) == store.resolver, E_NOT_RESOLVER);

        let game = smart_table::borrow_mut(&mut store.games, game_id);
        assert!(game.phase == PHASE_AWAITING_OFFER, E_WRONG_PHASE);
        assert!(std::string::length(&message) <= 280, E_MESSAGE_TOO_LONG);

        game.banker_offer = offer_cents;
        game.banker_message = message;
        game.phase = PHASE_BANKER_OFFER;

        std::event::emit(AgentBankerOfferMade {
            game_id,
            offer_cents,
            message,
        });
    }

    /// Agent accepts the deal.
    public entry fun agent_accept_deal(
        resolver: &signer,
        store_addr: address,
        game_id: u64,
    ) acquires AgentGameStore {
        let store = borrow_global_mut<AgentGameStore>(store_addr);
        assert!(signer::address_of(resolver) == store.resolver, E_NOT_RESOLVER);

        let game = smart_table::borrow_mut(&mut store.games, game_id);
        assert!(game.phase == PHASE_BANKER_OFFER, E_WRONG_PHASE);

        let payout = game.banker_offer;
        game.final_payout = payout;
        game.phase = PHASE_GAME_OVER;

        // Settle payout
        deal_or_not::bank::settle(
            store.bank_owner,
            payout,
            game.agent,
            game.apt_per_dollar,
        );

        // Record stats
        let won = payout > ENTRY_FEE_CENTS;
        deal_or_not::agent_registry::record_game_friend(
            store.registry_addr,
            game.agent_id,
            won,
            payout,
        );

        std::event::emit(AgentDealAccepted { game_id, payout_cents: payout });
        std::event::emit(AgentGameResolved {
            game_id,
            payout_cents: payout,
            agent_id: game.agent_id,
            won,
        });
    }

    /// Agent rejects the deal.
    public entry fun agent_reject_deal(
        resolver: &signer,
        store_addr: address,
        game_id: u64,
    ) acquires AgentGameStore {
        let store = borrow_global_mut<AgentGameStore>(store_addr);
        assert!(signer::address_of(resolver) == store.resolver, E_NOT_RESOLVER);

        let game = smart_table::borrow_mut(&mut store.games, game_id);
        assert!(game.phase == PHASE_BANKER_OFFER, E_WRONG_PHASE);

        game.banker_offer = 0;

        // Check if we should go to final round or back to opening
        if ((game.total_collapsed as u64) >= NUM_ROUNDS) {
            game.phase = PHASE_FINAL_ROUND;
        } else {
            game.current_round = game.current_round + 1;
            game.phase = PHASE_ROUND;
        };

        std::event::emit(AgentDealRejected { game_id });
    }

    // Agent keeps their case in final round
    #[randomness]
    entry fun agent_keep_case(
        resolver: &signer,
        store_addr: address,
        game_id: u64,
    ) acquires AgentGameStore {
        let store = borrow_global_mut<AgentGameStore>(store_addr);
        assert!(signer::address_of(resolver) == store.resolver, E_NOT_RESOLVER);

        let game = smart_table::borrow_mut(&mut store.games, game_id);
        assert!(game.phase == PHASE_FINAL_ROUND, E_WRONG_PHASE);

        // Reveal player's case value
        let remaining = count_unused_values(game.used_values_bitmap);
        let rand_index = randomness::u64_range(0, remaining);
        let player_value = pick_unused_value(game.used_values_bitmap, rand_index);
        *vector::borrow_mut(&mut game.case_values, (game.player_case as u64)) = player_value;
        game.used_values_bitmap = mark_value_used(game.used_values_bitmap, player_value);

        // Reveal remaining case
        reveal_last_case(game);

        game.final_payout = player_value;
        game.phase = PHASE_GAME_OVER;

        deal_or_not::bank::settle(
            store.bank_owner,
            player_value,
            game.agent,
            game.apt_per_dollar,
        );

        let won = player_value > ENTRY_FEE_CENTS;
        deal_or_not::agent_registry::record_game_friend(
            store.registry_addr,
            game.agent_id,
            won,
            player_value,
        );

        std::event::emit(AgentGameResolved {
            game_id,
            payout_cents: player_value,
            agent_id: game.agent_id,
            won,
        });
    }

    // Agent swaps their case in final round
    #[randomness]
    entry fun agent_swap_case(
        resolver: &signer,
        store_addr: address,
        game_id: u64,
    ) acquires AgentGameStore {
        let store = borrow_global_mut<AgentGameStore>(store_addr);
        assert!(signer::address_of(resolver) == store.resolver, E_NOT_RESOLVER);

        let game = smart_table::borrow_mut(&mut store.games, game_id);
        assert!(game.phase == PHASE_FINAL_ROUND, E_WRONG_PHASE);

        // Reveal player's case value (will NOT be their payout)
        let remaining = count_unused_values(game.used_values_bitmap);
        let rand_index = randomness::u64_range(0, remaining);
        let player_value = pick_unused_value(game.used_values_bitmap, rand_index);
        *vector::borrow_mut(&mut game.case_values, (game.player_case as u64)) = player_value;
        game.used_values_bitmap = mark_value_used(game.used_values_bitmap, player_value);

        // Reveal remaining case — this IS their payout (swapped)
        let swap_value = reveal_last_case(game);

        game.final_payout = swap_value;
        game.phase = PHASE_GAME_OVER;

        deal_or_not::bank::settle(
            store.bank_owner,
            swap_value,
            game.agent,
            game.apt_per_dollar,
        );

        let won = swap_value > ENTRY_FEE_CENTS;
        deal_or_not::agent_registry::record_game_friend(
            store.registry_addr,
            game.agent_id,
            won,
            swap_value,
        );

        std::event::emit(AgentGameResolved {
            game_id,
            payout_cents: swap_value,
            agent_id: game.agent_id,
            won,
        });
    }

    // ── Internal Helpers ──

    fun count_unused_values(bitmap: u64): u64 {
        let count = 0u64;
        let i = 0u8;
        while ((i as u64) < NUM_CASES) {
            if ((bitmap >> i) & 1 == 0) {
                count = count + 1;
            };
            i = i + 1;
        };
        count
    }

    fun get_case_value(index: u64): u64 {
        if (index == 0) { CASE_VALUE_0 }
        else if (index == 1) { CASE_VALUE_1 }
        else if (index == 2) { CASE_VALUE_2 }
        else if (index == 3) { CASE_VALUE_3 }
        else { CASE_VALUE_4 }
    }

    fun pick_unused_value(bitmap: u64, rand_index: u64): u64 {
        let count = 0u64;
        let i = 0u8;
        while ((i as u64) < NUM_CASES) {
            if ((bitmap >> i) & 1 == 0) {
                if (count == rand_index) {
                    return get_case_value((i as u64))
                };
                count = count + 1;
            };
            i = i + 1;
        };
        abort E_INVALID_CASE
    }

    fun mark_value_used(bitmap: u64, value: u64): u64 {
        let i = 0u8;
        while ((i as u64) < NUM_CASES) {
            if (get_case_value((i as u64)) == value && (bitmap >> i) & 1 == 0) {
                return bitmap | (1 << i)
            };
            i = i + 1;
        };
        bitmap
    }

    fun reveal_last_case(game: &mut AgentGame): u64 {
        let remaining = count_unused_values(game.used_values_bitmap);
        if (remaining == 0) return 0;
        // Only one value left
        let value = pick_unused_value(game.used_values_bitmap, 0);

        // Find the unopened, non-player case
        let i = 0u64;
        while (i < NUM_CASES) {
            if (!*vector::borrow(&game.opened, i) && (i as u8) != game.player_case) {
                *vector::borrow_mut(&mut game.case_values, i) = value;
                *vector::borrow_mut(&mut game.opened, i) = true;
                game.used_values_bitmap = mark_value_used(game.used_values_bitmap, value);
                return value
            };
            i = i + 1;
        };
        0
    }

    // ── View Functions ──

    #[view]
    public fun get_agent_game_state(
        store_addr: address,
        game_id: u64,
    ): (address, u64, u8, u8, u8, u8, u64, u64, u64) acquires AgentGameStore {
        let store = borrow_global<AgentGameStore>(store_addr);
        assert!(smart_table::contains(&store.games, game_id), E_GAME_NOT_FOUND);
        let g = smart_table::borrow(&store.games, game_id);
        (g.agent, g.agent_id, g.phase, g.player_case, g.current_round,
         g.total_collapsed, g.banker_offer, g.final_payout, g.apt_per_dollar)
    }

    // ── Tests ──

    #[test_only]
    use aptos_framework::account;

    #[test(owner = @0xCAFE, framework = @aptos_framework)]
    fun test_initialize(owner: &signer, framework: &signer) acquires AgentGameStore {
        aptos_framework::timestamp::set_time_has_started_for_testing(framework);
        account::create_account_for_test(signer::address_of(owner));

        initialize(owner, @0xBEEF, @0xCAFE, @0xCAFE, @0xCAFE);

        let store = borrow_global<AgentGameStore>(@0xCAFE);
        assert!(store.next_game_id == 1, 0);
        assert!(store.resolver == @0xBEEF, 1);
    }

    #[test]
    fun test_bitmap_helpers() {
        // All unused initially
        assert!(count_unused_values(0) == 5, 0);

        // Pick first unused (index 0) → value 1
        assert!(pick_unused_value(0, 0) == 1, 1);
        // Pick third unused (index 2) → value 10
        assert!(pick_unused_value(0, 2) == 10, 2);

        // Mark value 1 used (bit 0)
        let bitmap = mark_value_used(0, 1);
        assert!(bitmap == 1, 3);
        assert!(count_unused_values(bitmap) == 4, 4);

        // Now index 0 of unused is value 5
        assert!(pick_unused_value(bitmap, 0) == 5, 5);
    }
}
