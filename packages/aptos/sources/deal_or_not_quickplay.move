/// @title deal_or_not_quickplay — Real APT Quick Play (5 Cases, $0.25 Entry)
/// @notice On-chain Deal or No Deal with Aptos native randomness + Chainlink Price Feeds.
/// Ported from DealOrNotQuickPlay.sol.
///
/// SECURITY MODEL (Two-Transaction Randomness):
///   TX1: Player calls open_case → records intent, no randomness
///   TX2: Resolver calls reveal_case (with #[randomness]) → fresh randomness generated
///   Player can't predict because randomness doesn't exist until TX2 executes.
///
/// Phase simplification (9 → 7 phases):
///   Solidity: WaitingForVRF → Created → Round → WaitingForCRE → AwaitingOffer → BankerOffer → FinalRound → WaitingForFinalCRE → GameOver
///   Move:     Created → Round → WaitingForReveal → AwaitingOffer → BankerOffer → FinalRound → GameOver
///
/// Key changes from Solidity:
///   - No VRF callback (Aptos randomness is synchronous in #[randomness] functions)
///   - No CRE secret (replaced by two-TX pattern with Aptos native randomness)
///   - No onReport/IReceiver (resolver calls functions directly as authorized signer)
///   - APT 8 decimals instead of ETH 18 decimals
///   - SmartTable<u64, Game> instead of mapping(uint256 => Game)
module deal_or_not::deal_or_not_quickplay {
    use std::signer;
    use std::vector;
    use aptos_framework::aptos_account;
    use aptos_framework::randomness;
    use aptos_framework::timestamp;
    use aptos_framework::smart_table::{Self, SmartTable};

    use deal_or_not::game_math;
    use deal_or_not::banker_algorithm;
    use deal_or_not::price_feed_helper;

    // ── Constants ──
    const NUM_CASES: u8 = 5;
    const NUM_ROUNDS: u8 = 4;
    // Case values in cents: $0.01, $0.05, $0.10, $0.50, $1.00
    const CASE_VALUE_0: u64 = 1;
    const CASE_VALUE_1: u64 = 5;
    const CASE_VALUE_2: u64 = 10;
    const CASE_VALUE_3: u64 = 50;
    const CASE_VALUE_4: u64 = 100;

    const ENTRY_FEE_CENTS: u64 = 25;  // $0.25
    const SLIPPAGE_BPS: u64 = 500;     // 5%
    const GAME_TIMEOUT: u64 = 600;     // 10 minutes

    // ── Phases ──
    const PHASE_CREATED: u8 = 0;
    const PHASE_ROUND: u8 = 1;
    const PHASE_WAITING_FOR_REVEAL: u8 = 2;
    const PHASE_AWAITING_OFFER: u8 = 3;
    const PHASE_BANKER_OFFER: u8 = 4;
    const PHASE_FINAL_ROUND: u8 = 5;
    const PHASE_GAME_OVER: u8 = 6;

    // ── Error Codes ──
    const E_WRONG_PHASE: u64 = 300;
    const E_NOT_PLAYER: u64 = 301;
    const E_NOT_RESOLVER: u64 = 302;
    const E_INVALID_CASE: u64 = 303;
    const E_CASE_ALREADY_OPENED: u64 = 304;
    const E_CANNOT_OPEN_OWN_CASE: u64 = 305;
    const E_INVALID_VALUE: u64 = 306;
    const E_GAME_NOT_OVER: u64 = 307;
    const E_NOT_OWNER: u64 = 308;
    const E_BANK_NOT_ACTIVE: u64 = 309;
    const E_GAME_NOT_FOUND: u64 = 310;
    const E_NOT_BANKER: u64 = 311;
    const E_GAME_NOT_EXPIRED: u64 = 312;
    const E_GAME_NOT_ACTIVE: u64 = 313;
    const E_MESSAGE_TOO_LONG: u64 = 314;

    // ── Game Struct ──
    struct Game has store {
        player: address,
        phase: u8,
        player_case: u8,
        current_round: u8,
        total_collapsed: u8,
        banker_offer: u64,
        final_payout: u64,
        apt_per_dollar: u64,       // Price snapshot at game creation
        used_values_bitmap: u64,   // Tracks which CASE_VALUES have been assigned
        case_values: vector<u64>,  // 5 slots, 0 = unrevealed
        opened: vector<bool>,      // 5 slots
        pending_case_index: u8,
        created_at: u64,
        entry_deposit: u64,        // Octas deposited as entry fee
    }

    // ── Global State ──
    struct GameStore has key {
        owner: address,
        resolver: address,           // Authorized to call reveal_case (two-TX pattern)
        bank_owner: address,         // Bank module admin address
        price_feed_addr: address,    // Price feed admin address
        games: SmartTable<u64, Game>,
        next_game_id: u64,
        // Banker authorization per game
        bankers: SmartTable<u64, vector<address>>,
    }

    // ── Events ──
    #[event]
    struct GameCreated has drop, store { game_id: u64, player: address }
    #[event]
    struct EntryFeePaid has drop, store { game_id: u64, player: address, octas: u64, cents: u64 }
    #[event]
    struct CasePicked has drop, store { game_id: u64, case_index: u8 }
    #[event]
    struct CaseOpenRequested has drop, store { game_id: u64, case_index: u8 }
    #[event]
    struct CaseRevealed has drop, store { game_id: u64, case_index: u8, value_cents: u64 }
    #[event]
    struct RoundComplete has drop, store { game_id: u64, round: u8 }
    #[event]
    struct BankerOfferMade has drop, store { game_id: u64, round: u8, offer_cents: u64 }
    #[event]
    struct BankerMessage has drop, store { game_id: u64, message: vector<u8> }
    #[event]
    struct DealAccepted has drop, store { game_id: u64, payout_cents: u64 }
    #[event]
    struct DealRejected has drop, store { game_id: u64, round: u8 }
    #[event]
    struct FinalCaseRequested has drop, store { game_id: u64 }
    #[event]
    struct GameResolved has drop, store { game_id: u64, payout_cents: u64, swapped: bool }
    #[event]
    struct GameExpired has drop, store { game_id: u64 }

    // ── Initialization ──

    /// Initialize the game module. Must be called once by the deployer.
    public entry fun initialize(
        owner: &signer,
        resolver: address,
        bank_owner: address,
        price_feed_addr: address,
    ) {
        let owner_addr = signer::address_of(owner);
        move_to(owner, GameStore {
            owner: owner_addr,
            resolver,
            bank_owner,
            price_feed_addr,
            games: smart_table::new(),
            next_game_id: 0,
            bankers: smart_table::new(),
        });
    }

    // ════════════════════════════════════════════════════════
    //                    GAME CREATION
    // ════════════════════════════════════════════════════════

    /// Create a single-player game. Pays $0.25 entry fee in APT.
    /// Unlike Solidity, no VRF callback needed — game starts in Created phase immediately.
    public entry fun create_game(
        player: &signer,
        game_store_addr: address,
    ) acquires GameStore {
        let player_addr = signer::address_of(player);
        let store = borrow_global_mut<GameStore>(game_store_addr);

        // Validate entry fee
        let required_octas = price_feed_helper::usd_to_octas(
            store.price_feed_addr,
            ENTRY_FEE_CENTS,
        );
        let with_slippage = game_math::required_with_slippage(required_octas, SLIPPAGE_BPS);

        // Transfer entry fee to bank vault
        let bank_vault = deal_or_not::bank::get_vault_address(store.bank_owner);
        aptos_account::transfer(player, bank_vault, with_slippage);

        // Snapshot price for this game
        let apt_per_dollar = price_feed_helper::snapshot_price(store.price_feed_addr);

        // Create game
        let game_id = store.next_game_id;
        store.next_game_id = game_id + 1;

        smart_table::add(&mut store.games, game_id, Game {
            player: player_addr,
            phase: PHASE_CREATED,
            player_case: 255, // sentinel: not yet picked
            current_round: 0,
            total_collapsed: 0,
            banker_offer: 0,
            final_payout: 0,
            apt_per_dollar,
            used_values_bitmap: 0,
            case_values: vector[0, 0, 0, 0, 0],
            opened: vector[false, false, false, false, false],
            pending_case_index: 255,
            created_at: timestamp::now_seconds(),
            entry_deposit: with_slippage,
        });

        // Authorize player as a banker
        smart_table::add(&mut store.bankers, game_id, vector[player_addr]);

        std::event::emit(GameCreated { game_id, player: player_addr });
        std::event::emit(EntryFeePaid {
            game_id,
            player: player_addr,
            octas: with_slippage,
            cents: ENTRY_FEE_CENTS,
        });
    }

    // ════════════════════════════════════════════════════════
    //                    GAME PLAY
    // ════════════════════════════════════════════════════════

    /// Pick your case (0-4). Transitions Created → Round.
    public entry fun pick_case(
        player: &signer,
        game_store_addr: address,
        game_id: u64,
        case_index: u8,
    ) acquires GameStore {
        let store = borrow_global_mut<GameStore>(game_store_addr);
        let game = smart_table::borrow_mut(&mut store.games, game_id);

        assert!(game.player == signer::address_of(player), E_NOT_PLAYER);
        assert!(game.phase == PHASE_CREATED, E_WRONG_PHASE);
        assert!(case_index < (NUM_CASES as u8), E_INVALID_CASE);

        game.player_case = case_index;
        game.phase = PHASE_ROUND;

        std::event::emit(CasePicked { game_id, case_index });
    }

    /// Open a case. Transitions Round → WaitingForReveal.
    /// This is TX1 of the two-TX pattern. No randomness here.
    public entry fun open_case(
        player: &signer,
        game_store_addr: address,
        game_id: u64,
        case_index: u8,
    ) acquires GameStore {
        let store = borrow_global_mut<GameStore>(game_store_addr);
        let game = smart_table::borrow_mut(&mut store.games, game_id);

        assert!(game.player == signer::address_of(player), E_NOT_PLAYER);
        assert!(game.phase == PHASE_ROUND, E_WRONG_PHASE);
        assert!(case_index < (NUM_CASES as u8), E_INVALID_CASE);
        assert!(case_index != game.player_case, E_CANNOT_OPEN_OWN_CASE);
        assert!(!*vector::borrow(&game.opened, (case_index as u64)), E_CASE_ALREADY_OPENED);

        game.pending_case_index = case_index;
        game.phase = PHASE_WAITING_FOR_REVEAL;

        std::event::emit(CaseOpenRequested { game_id, case_index });
    }

    // Reveal a case value using native randomness. TX2 of the two-TX pattern.
    // Only callable by the authorized resolver. The #[randomness] attribute ensures
    // the random value is generated AFTER this transaction's block is ordered,
    // preventing prediction.
    #[randomness]
    entry fun reveal_case(
        resolver: &signer,
        game_store_addr: address,
        game_id: u64,
    ) acquires GameStore {
        let store = borrow_global_mut<GameStore>(game_store_addr);
        assert!(signer::address_of(resolver) == store.resolver, E_NOT_RESOLVER);

        let game = smart_table::borrow_mut(&mut store.games, game_id);
        assert!(
            game.phase == PHASE_WAITING_FOR_REVEAL,
            E_WRONG_PHASE,
        );

        let case_index = game.pending_case_index;

        // Count remaining unused values
        let remaining = count_unused_values(game.used_values_bitmap);
        assert!(remaining > 0, E_INVALID_VALUE);

        // Use native randomness to pick from remaining values
        let pick = randomness::u64_range(0, (remaining as u64));

        // Walk the bitmap to find the pick-th unused value
        let value_cents = pick_unused_value(game.used_values_bitmap, (pick as u8));

        // Assign the value
        *vector::borrow_mut(&mut game.case_values, (case_index as u64)) = value_cents;
        *vector::borrow_mut(&mut game.opened, (case_index as u64)) = true;
        mark_value_used(&mut game.used_values_bitmap, value_cents);
        game.total_collapsed = game.total_collapsed + 1;

        std::event::emit(CaseRevealed { game_id, case_index, value_cents });

        // Determine next phase
        let cases_remaining = count_remaining_cases(game);
        if (cases_remaining == 1) {
            game.phase = PHASE_FINAL_ROUND;
        } else {
            game.phase = PHASE_AWAITING_OFFER;
        };
        std::event::emit(RoundComplete { game_id, round: game.current_round });
    }

    /// Set banker offer. Called by authorized banker or resolver.
    public entry fun set_banker_offer(
        banker: &signer,
        game_store_addr: address,
        game_id: u64,
        offer_cents: u64,
    ) acquires GameStore {
        let store = borrow_global_mut<GameStore>(game_store_addr);
        let banker_addr = signer::address_of(banker);

        // Check banker authorization (resolver is always authorized)
        if (banker_addr != store.resolver) {
            let bankers = smart_table::borrow(&store.bankers, game_id);
            assert!(vector::contains(bankers, &banker_addr), E_NOT_BANKER);
        };

        let game = smart_table::borrow_mut(&mut store.games, game_id);
        assert!(game.phase == PHASE_AWAITING_OFFER, E_WRONG_PHASE);

        game.banker_offer = offer_cents;
        game.phase = PHASE_BANKER_OFFER;

        std::event::emit(BankerOfferMade {
            game_id,
            round: game.current_round,
            offer_cents,
        });
    }

    /// Set banker offer with a message (for AI banker personality).
    public entry fun set_banker_offer_with_message(
        banker: &signer,
        game_store_addr: address,
        game_id: u64,
        offer_cents: u64,
        message: vector<u8>,
    ) acquires GameStore {
        assert!(vector::length(&message) <= 512, E_MESSAGE_TOO_LONG);
        set_banker_offer(banker, game_store_addr, game_id, offer_cents);
        std::event::emit(BankerMessage { game_id, message });
    }

    /// DEAL — accept the banker's offer. Game over. Bank settles payout.
    public entry fun accept_deal(
        player: &signer,
        game_store_addr: address,
        game_id: u64,
    ) acquires GameStore {
        let store = borrow_global_mut<GameStore>(game_store_addr);
        let game = smart_table::borrow_mut(&mut store.games, game_id);

        assert!(game.player == signer::address_of(player), E_NOT_PLAYER);
        assert!(game.phase == PHASE_BANKER_OFFER, E_WRONG_PHASE);

        game.final_payout = game.banker_offer;
        game.phase = PHASE_GAME_OVER;

        // Settle payout from Bank
        deal_or_not::bank::settle(
            store.bank_owner,
            game.final_payout,
            game.player,
            game.apt_per_dollar,
        );

        std::event::emit(DealAccepted { game_id, payout_cents: game.banker_offer });
        std::event::emit(GameResolved { game_id, payout_cents: game.final_payout, swapped: false });
    }

    /// NO DEAL — reject the offer. Next round.
    public entry fun reject_deal(
        player: &signer,
        game_store_addr: address,
        game_id: u64,
    ) acquires GameStore {
        let store = borrow_global_mut<GameStore>(game_store_addr);
        let game = smart_table::borrow_mut(&mut store.games, game_id);

        assert!(game.player == signer::address_of(player), E_NOT_PLAYER);
        assert!(game.phase == PHASE_BANKER_OFFER, E_WRONG_PHASE);

        std::event::emit(DealRejected { game_id, round: game.current_round });

        game.current_round = game.current_round + 1;
        game.banker_offer = 0;
        game.phase = PHASE_ROUND;
    }

    // Keep your case. Reveals the last remaining case. Uses randomness.
    #[randomness]
    entry fun keep_case(
        resolver: &signer,
        game_store_addr: address,
        game_id: u64,
    ) acquires GameStore {
        let store = borrow_global_mut<GameStore>(game_store_addr);
        assert!(signer::address_of(resolver) == store.resolver, E_NOT_RESOLVER);
        let game = smart_table::borrow_mut(&mut store.games, game_id);
        assert!(game.phase == PHASE_FINAL_ROUND, E_WRONG_PHASE);

        let last_case = find_last_case(game);

        // Reveal the last non-player case with randomness
        reveal_final_cases(game, last_case, false);

        // Settle payout
        deal_or_not::bank::settle(
            store.bank_owner,
            game.final_payout,
            game.player,
            game.apt_per_dollar,
        );

        std::event::emit(FinalCaseRequested { game_id });
        std::event::emit(CaseRevealed {
            game_id,
            case_index: last_case,
            value_cents: *vector::borrow(&game.case_values, (last_case as u64)),
        });
        std::event::emit(GameResolved { game_id, payout_cents: game.final_payout, swapped: false });
    }

    // Swap your case for the last remaining one. Uses randomness.
    #[randomness]
    entry fun swap_case(
        resolver: &signer,
        game_store_addr: address,
        game_id: u64,
    ) acquires GameStore {
        let store = borrow_global_mut<GameStore>(game_store_addr);
        assert!(signer::address_of(resolver) == store.resolver, E_NOT_RESOLVER);
        let game = smart_table::borrow_mut(&mut store.games, game_id);
        assert!(game.phase == PHASE_FINAL_ROUND, E_WRONG_PHASE);

        let last_case = find_last_case(game);
        let old_player_case = game.player_case;
        game.player_case = last_case;

        // Reveal the old player case with randomness
        reveal_final_cases(game, old_player_case, true);

        // Settle payout
        deal_or_not::bank::settle(
            store.bank_owner,
            game.final_payout,
            game.player,
            game.apt_per_dollar,
        );

        std::event::emit(FinalCaseRequested { game_id });
        std::event::emit(CaseRevealed {
            game_id,
            case_index: old_player_case,
            value_cents: *vector::borrow(&game.case_values, (old_player_case as u64)),
        });
        std::event::emit(GameResolved { game_id, payout_cents: game.final_payout, swapped: true });
    }

    /// Expire a stale game (10 minute timeout). Resolver only.
    public entry fun expire_game(
        resolver: &signer,
        game_store_addr: address,
        game_id: u64,
    ) acquires GameStore {
        let store = borrow_global_mut<GameStore>(game_store_addr);
        assert!(signer::address_of(resolver) == store.resolver, E_NOT_RESOLVER);
        let game = smart_table::borrow_mut(&mut store.games, game_id);

        assert!(game.phase != PHASE_GAME_OVER, E_GAME_NOT_ACTIVE);
        assert!(
            game.created_at > 0 && timestamp::now_seconds() > game.created_at + GAME_TIMEOUT,
            E_GAME_NOT_EXPIRED,
        );

        game.final_payout = 0;
        game.phase = PHASE_GAME_OVER;
        std::event::emit(GameExpired { game_id });
    }

    // ════════════════════════════════════════════════════════
    //                  VIEW FUNCTIONS
    // ════════════════════════════════════════════════════════

    #[view]
    public fun get_game_state(
        game_store_addr: address,
        game_id: u64,
    ): (address, u8, u8, u8, u8, u64, u64, u64, vector<u64>, vector<bool>) acquires GameStore {
        let store = borrow_global<GameStore>(game_store_addr);
        let game = smart_table::borrow(&store.games, game_id);
        (
            game.player,
            game.phase,
            game.player_case,
            game.current_round,
            game.total_collapsed,
            game.banker_offer,
            game.final_payout,
            game.apt_per_dollar,
            game.case_values,
            game.opened,
        )
    }

    #[view]
    public fun estimate_entry_fee(
        game_store_addr: address,
    ): (u64, u64) acquires GameStore {
        let store = borrow_global<GameStore>(game_store_addr);
        let base_octas = price_feed_helper::usd_to_octas(store.price_feed_addr, ENTRY_FEE_CENTS);
        let with_slippage = game_math::required_with_slippage(base_octas, SLIPPAGE_BPS);
        (base_octas, with_slippage)
    }

    #[view]
    public fun get_remaining_value_pool(
        game_store_addr: address,
        game_id: u64,
    ): vector<u64> acquires GameStore {
        let store = borrow_global<GameStore>(game_store_addr);
        let game = smart_table::borrow(&store.games, game_id);
        get_remaining_values(game.used_values_bitmap)
    }

    #[view]
    public fun calculate_banker_offer(
        game_store_addr: address,
        game_id: u64,
    ): u64 acquires GameStore {
        let store = borrow_global<GameStore>(game_store_addr);
        let game = smart_table::borrow(&store.games, game_id);
        let pool = get_remaining_values(game.used_values_bitmap);
        banker_algorithm::calculate_offer(&pool, (game.current_round as u64))
    }

    // ════════════════════════════════════════════════════════
    //                  ADMIN
    // ════════════════════════════════════════════════════════

    public entry fun set_resolver(
        owner: &signer,
        game_store_addr: address,
        new_resolver: address,
    ) acquires GameStore {
        let store = borrow_global_mut<GameStore>(game_store_addr);
        assert!(signer::address_of(owner) == store.owner, E_NOT_OWNER);
        store.resolver = new_resolver;
    }

    // ════════════════════════════════════════════════════════
    //                  INTERNAL HELPERS
    // ════════════════════════════════════════════════════════

    /// Get the case values array [1, 5, 10, 50, 100]
    fun case_values(): vector<u64> {
        vector[CASE_VALUE_0, CASE_VALUE_1, CASE_VALUE_2, CASE_VALUE_3, CASE_VALUE_4]
    }

    /// Count unused values in the bitmap
    fun count_unused_values(bitmap: u64): u8 {
        let count = 0u8;
        let i = 0u8;
        while (i < NUM_CASES) {
            if ((bitmap & (1 << (i as u8))) == 0) {
                count = count + 1;
            };
            i = i + 1;
        };
        count
    }

    /// Pick the nth unused value from the bitmap
    fun pick_unused_value(bitmap: u64, pick: u8): u64 {
        let vals = case_values();
        let count = 0u8;
        let i = 0u8;
        while (i < NUM_CASES) {
            if ((bitmap & (1 << (i as u8))) == 0) {
                if (count == pick) {
                    return *vector::borrow(&vals, (i as u64))
                };
                count = count + 1;
            };
            i = i + 1;
        };
        abort E_INVALID_VALUE
    }

    /// Mark a value as used in the bitmap
    fun mark_value_used(bitmap: &mut u64, value_cents: u64) {
        let vals = case_values();
        let i = 0u8;
        while (i < NUM_CASES) {
            if (*vector::borrow(&vals, (i as u64)) == value_cents
                && (*bitmap & (1 << (i as u8))) == 0) {
                *bitmap = *bitmap | (1 << (i as u8));
                return
            };
            i = i + 1;
        };
    }

    /// Count remaining unopened cases (excluding player's case)
    fun count_remaining_cases(game: &Game): u8 {
        let count = 0u8;
        let i = 0u8;
        while (i < NUM_CASES) {
            if (!*vector::borrow(&game.opened, (i as u64)) && i != game.player_case) {
                count = count + 1;
            };
            i = i + 1;
        };
        count
    }

    /// Find the last unopened case (excluding player's case)
    fun find_last_case(game: &Game): u8 {
        let i = 0u8;
        while (i < NUM_CASES) {
            if (!*vector::borrow(&game.opened, (i as u64)) && i != game.player_case) {
                return i
            };
            i = i + 1;
        };
        abort E_INVALID_CASE
    }

    /// Get remaining (unused) values from the bitmap
    fun get_remaining_values(bitmap: u64): vector<u64> {
        let vals = case_values();
        let result = vector[];
        let i = 0u8;
        while (i < NUM_CASES) {
            if ((bitmap & (1 << (i as u8))) == 0) {
                vector::push_back(&mut result, *vector::borrow(&vals, (i as u64)));
            };
            i = i + 1;
        };
        result
    }

    /// Reveal both final cases using randomness and determine the player's payout
    fun reveal_final_cases(game: &mut Game, reveal_case_index: u8, _swapped: bool) {
        // Reveal the non-player case
        let remaining = count_unused_values(game.used_values_bitmap);
        assert!(remaining == 2, E_INVALID_VALUE); // Should be exactly 2 left

        let pick = randomness::u64_range(0, 2);
        let revealed_value = pick_unused_value(game.used_values_bitmap, (pick as u8));

        *vector::borrow_mut(&mut game.case_values, (reveal_case_index as u64)) = revealed_value;
        *vector::borrow_mut(&mut game.opened, (reveal_case_index as u64)) = true;
        mark_value_used(&mut game.used_values_bitmap, revealed_value);
        game.total_collapsed = game.total_collapsed + 1;

        // The remaining value goes to the player's case
        let player_value = pick_unused_value(game.used_values_bitmap, 0);
        *vector::borrow_mut(&mut game.case_values, (game.player_case as u64)) = player_value;
        mark_value_used(&mut game.used_values_bitmap, player_value);
        game.total_collapsed = game.total_collapsed + 1;

        game.final_payout = player_value;
        game.phase = PHASE_GAME_OVER;
    }
}
