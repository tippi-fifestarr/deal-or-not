/// @title sponsor_vault — Sponsorship + jackpot management
/// @notice Sponsors deposit APT to fund jackpots triggered by max case value ($1.00)
/// + "no deal" completion. 50/50 split: half to player, half rolls over.
/// Ported from SponsorVault.sol.
///
/// Key differences from Solidity:
/// - No IReceiver/onReport — resolver calls functions directly
/// - APT (8 decimals) vs ETH (18 decimals)
/// - Resource account holds sponsor deposits and jackpot funds
module deal_or_not::sponsor_vault {
    use std::signer;
    use std::string::String;
    use aptos_framework::aptos_account;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::coin;
    use aptos_framework::account::{Self, SignerCapability};
    use aptos_std::smart_table::{Self, SmartTable};

    // ── Error Codes ──
    const E_NOT_AUTHORIZED: u64 = 900;
    const E_ALREADY_REGISTERED: u64 = 901;
    const E_NOT_REGISTERED: u64 = 902;
    const E_GAME_ALREADY_SPONSORED: u64 = 903;
    const E_NO_SPONSOR: u64 = 904;
    const E_GAME_NOT_OVER: u64 = 905;
    const E_NOT_TOP_CASE: u64 = 906;
    const E_NOT_PLAYER: u64 = 907;
    const E_ALREADY_CLAIMED: u64 = 908;
    const E_NO_JACKPOT: u64 = 909;
    const E_INSUFFICIENT_BALANCE: u64 = 910;
    const E_NOT_OWNER: u64 = 911;
    const E_ALREADY_INITIALIZED: u64 = 912;

    // ── Constants ──
    const JACKPOT_CASE_VALUE: u64 = 100; // $1.00 = max case value

    // Resource account seed
    const SPONSOR_SEED: vector<u8> = b"DEAL_OR_NOT_SPONSOR";

    // ── State ──

    struct Sponsor has store, copy, drop {
        name: String,
        logo_url: String,
        balance: u64, // octas
        total_spent: u64,
        registered: bool,
    }

    struct SponsorState has key {
        owner: address,
        vault_signer_cap: SignerCapability,
        vault_address: address,
        sponsors: SmartTable<address, Sponsor>,
        game_sponsor: SmartTable<u64, address>,
        jackpots: SmartTable<u64, u64>, // game_id → jackpot in octas
        claimed: SmartTable<u64, bool>,
        rolling_jackpot: u64, // octas
        resolver: address,
    }

    // ── Events ──

    #[event]
    struct SponsorRegistered has drop, store {
        sponsor: address,
        name: String,
    }

    #[event]
    struct SponsorToppedUp has drop, store {
        sponsor: address,
        amount: u64,
    }

    #[event]
    struct GameSponsored has drop, store {
        game_id: u64,
        sponsor: address,
    }

    #[event]
    struct JackpotIncreased has drop, store {
        game_id: u64,
        amount: u64,
    }

    #[event]
    struct JackpotClaimed has drop, store {
        game_id: u64,
        player: address,
        amount: u64,
    }

    #[event]
    struct JackpotRolled has drop, store {
        from_game_id: u64,
        amount: u64,
    }

    // ── Initialization ──

    public entry fun initialize(
        owner: &signer,
        resolver: address,
    ) {
        let owner_addr = signer::address_of(owner);
        assert!(!exists<SponsorState>(owner_addr), E_ALREADY_INITIALIZED);

        let (vault_signer, vault_signer_cap) = account::create_resource_account(
            owner,
            SPONSOR_SEED,
        );
        let vault_address = signer::address_of(&vault_signer);
        coin::register<AptosCoin>(&vault_signer);

        move_to(owner, SponsorState {
            owner: owner_addr,
            vault_signer_cap,
            vault_address,
            sponsors: smart_table::new(),
            game_sponsor: smart_table::new(),
            jackpots: smart_table::new(),
            claimed: smart_table::new(),
            rolling_jackpot: 0,
            resolver,
        });
    }

    // ── Admin ──

    public entry fun set_resolver(
        owner: &signer,
        new_resolver: address,
    ) acquires SponsorState {
        let owner_addr = signer::address_of(owner);
        let state = borrow_global_mut<SponsorState>(owner_addr);
        assert!(state.owner == owner_addr, E_NOT_OWNER);
        state.resolver = new_resolver;
    }

    // ── Sponsor Functions ──

    public entry fun register_sponsor(
        sponsor: &signer,
        vault_addr: address,
        name: String,
        logo_url: String,
        initial_deposit: u64,
    ) acquires SponsorState {
        let sponsor_addr = signer::address_of(sponsor);
        let state = borrow_global_mut<SponsorState>(vault_addr);

        assert!(
            !smart_table::contains(&state.sponsors, sponsor_addr),
            E_ALREADY_REGISTERED,
        );

        // Transfer initial deposit
        if (initial_deposit > 0) {
            aptos_account::transfer(sponsor, state.vault_address, initial_deposit);
        };

        smart_table::add(&mut state.sponsors, sponsor_addr, Sponsor {
            name,
            logo_url,
            balance: initial_deposit,
            total_spent: 0,
            registered: true,
        });

        std::event::emit(SponsorRegistered { sponsor: sponsor_addr, name:
            smart_table::borrow(&state.sponsors, sponsor_addr).name });
    }

    public entry fun top_up(
        sponsor: &signer,
        vault_addr: address,
        amount: u64,
    ) acquires SponsorState {
        let sponsor_addr = signer::address_of(sponsor);
        let state = borrow_global_mut<SponsorState>(vault_addr);

        assert!(smart_table::contains(&state.sponsors, sponsor_addr), E_NOT_REGISTERED);

        aptos_account::transfer(sponsor, state.vault_address, amount);

        let s = smart_table::borrow_mut(&mut state.sponsors, sponsor_addr);
        s.balance = s.balance + amount;

        std::event::emit(SponsorToppedUp { sponsor: sponsor_addr, amount });
    }

    public entry fun sponsor_game(
        sponsor: &signer,
        vault_addr: address,
        game_id: u64,
    ) acquires SponsorState {
        let sponsor_addr = signer::address_of(sponsor);
        let state = borrow_global_mut<SponsorState>(vault_addr);

        assert!(smart_table::contains(&state.sponsors, sponsor_addr), E_NOT_REGISTERED);
        assert!(
            !smart_table::contains(&state.game_sponsor, game_id),
            E_GAME_ALREADY_SPONSORED,
        );

        smart_table::add(&mut state.game_sponsor, game_id, sponsor_addr);

        std::event::emit(GameSponsored { game_id, sponsor: sponsor_addr });
    }

    // ── Jackpot Management ──

    public entry fun add_to_jackpot(
        resolver: &signer,
        vault_addr: address,
        game_id: u64,
        amount_octas: u64,
    ) acquires SponsorState {
        let state = borrow_global_mut<SponsorState>(vault_addr);
        assert!(signer::address_of(resolver) == state.resolver, E_NOT_AUTHORIZED);

        if (!smart_table::contains(&state.game_sponsor, game_id)) return;

        let sponsor_addr = *smart_table::borrow(&state.game_sponsor, game_id);
        let sponsor = smart_table::borrow_mut(&mut state.sponsors, sponsor_addr);
        assert!(sponsor.balance >= amount_octas, E_INSUFFICIENT_BALANCE);

        sponsor.balance = sponsor.balance - amount_octas;
        sponsor.total_spent = sponsor.total_spent + amount_octas;

        // Add rolling jackpot
        let total = amount_octas + state.rolling_jackpot;
        smart_table::upsert(&mut state.jackpots, game_id, total);
        state.rolling_jackpot = 0;

        std::event::emit(JackpotIncreased { game_id, amount: total });
    }

    /// Claim jackpot after game over. 50/50 split: half to player, half rolls.
    public entry fun claim_jackpot(
        player: &signer,
        vault_addr: address,
        game_id: u64,
        final_payout_cents: u64,
    ) acquires SponsorState {
        let player_addr = signer::address_of(player);
        let state = borrow_global_mut<SponsorState>(vault_addr);

        assert!(smart_table::contains(&state.jackpots, game_id), E_NO_JACKPOT);
        assert!(
            !smart_table::contains(&state.claimed, game_id)
                || !*smart_table::borrow(&state.claimed, game_id),
            E_ALREADY_CLAIMED,
        );
        // Must have gone "all the way" with top case value
        assert!(final_payout_cents == JACKPOT_CASE_VALUE, E_NOT_TOP_CASE);

        let jackpot = *smart_table::borrow(&state.jackpots, game_id);
        let player_share = jackpot / 2;
        let roll_share = jackpot - player_share;

        // Mark claimed
        smart_table::upsert(&mut state.claimed, game_id, true);

        // Roll half forward
        state.rolling_jackpot = state.rolling_jackpot + roll_share;

        // Pay player
        if (player_share > 0) {
            let vault_signer = account::create_signer_with_capability(&state.vault_signer_cap);
            aptos_account::transfer(&vault_signer, player_addr, player_share);
        };

        std::event::emit(JackpotClaimed {
            game_id,
            player: player_addr,
            amount: player_share,
        });
        std::event::emit(JackpotRolled {
            from_game_id: game_id,
            amount: roll_share,
        });
    }

    // ── View Functions ──

    #[view]
    public fun get_jackpot(vault_addr: address, game_id: u64): u64 acquires SponsorState {
        let state = borrow_global<SponsorState>(vault_addr);
        if (!smart_table::contains(&state.jackpots, game_id)) return 0;
        *smart_table::borrow(&state.jackpots, game_id)
    }

    #[view]
    public fun get_rolling_jackpot(vault_addr: address): u64 acquires SponsorState {
        borrow_global<SponsorState>(vault_addr).rolling_jackpot
    }

    #[view]
    public fun get_sponsor_balance(
        vault_addr: address,
        sponsor: address,
    ): u64 acquires SponsorState {
        let state = borrow_global<SponsorState>(vault_addr);
        if (!smart_table::contains(&state.sponsors, sponsor)) return 0;
        smart_table::borrow(&state.sponsors, sponsor).balance
    }

    // ── Tests ──

    #[test_only]
    use aptos_framework::aptos_coin;
    #[test_only]
    use aptos_framework::timestamp;

    #[test(owner = @0xCAFE, framework = @aptos_framework)]
    fun test_initialize(owner: &signer, framework: &signer) acquires SponsorState {
        timestamp::set_time_has_started_for_testing(framework);
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(framework);
        account::create_account_for_test(signer::address_of(owner));

        initialize(owner, @0xBEEF);

        assert!(get_rolling_jackpot(@0xCAFE) == 0, 0);

        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);
    }
}
