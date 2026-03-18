/// @title bank — Game payout custody for Deal or NOT
/// @notice The house bank that pays out case values and deal amounts in real APT.
/// Must be "sweetened" (preseeded) before games can be created.
/// Entry fees flow in, payouts flow out. Global pool, not per-game.
/// Ported from Bank.sol.
///
/// Key difference from Solidity:
/// - Uses a resource account to hold APT autonomously (vs address(this).balance)
/// - No `receive()` / `payable` — explicit deposit functions
/// - Uses aptos_framework::coin for APT transfers
/// - APT has 8 decimals (octas) vs ETH's 18 decimals (wei)
module deal_or_not::bank {
    use std::signer;
    use aptos_framework::aptos_account;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::coin;
    use aptos_framework::account::{Self, SignerCapability};

    friend deal_or_not::deal_or_not_quickplay;
    friend deal_or_not::deal_or_not_agents;

    // ── Error Codes ──
    const E_BANK_NOT_ACTIVE: u64 = 200;
    const E_NOT_AUTHORIZED_GAME: u64 = 201;
    const E_PAYOUT_EXCEEDS_MAX: u64 = 202;
    const E_TRANSFER_FAILED: u64 = 203;
    const E_NO_FUNDS_TO_RESCUE: u64 = 204;
    const E_INSUFFICIENT_BALANCE: u64 = 205;
    const E_NOT_OWNER: u64 = 206;
    const E_ALREADY_INITIALIZED: u64 = 207;

    // ── Config ──
    const MAX_PAYOUT_CENTS: u64 = 100;  // $1.00 max payout per game
    const MIN_BALANCE_CENTS: u64 = 100;  // $1.00 minimum to stay active

    // Resource account seed for the bank vault
    const BANK_SEED: vector<u8> = b"DEAL_OR_NOT_BANK";

    // ── State ──
    struct BankState has key {
        owner: address,
        // Resource account signer capability (holds APT)
        vault_signer_cap: SignerCapability,
        vault_address: address,
        // Price feed admin address (for conversions)
        price_feed_addr: address,
        // Authorized game contract addresses
        authorized_games: vector<address>,
    }

    // ── Events ──
    #[event]
    struct Sweetened has drop, store {
        donor: address,
        amount: u64,
    }

    #[event]
    struct EntryFeeReceived has drop, store {
        game_contract: address,
        amount: u64,
    }

    #[event]
    struct Settled has drop, store {
        player: address,
        payout_cents: u64,
        payout_octas: u64,
    }

    #[event]
    struct Rescued has drop, store {
        to: address,
        amount: u64,
    }

    #[event]
    struct GameAuthorized has drop, store {
        game: address,
        authorized: bool,
    }

    // ── Initialization ──

    /// Initialize the bank. Creates a resource account to hold APT.
    public entry fun initialize(
        owner: &signer,
        price_feed_addr: address,
    ) {
        let owner_addr = signer::address_of(owner);
        assert!(!exists<BankState>(owner_addr), E_ALREADY_INITIALIZED);

        // Create resource account for the bank vault
        let (vault_signer, vault_signer_cap) = account::create_resource_account(
            owner,
            BANK_SEED,
        );
        let vault_address = signer::address_of(&vault_signer);

        // Register the vault to receive APT
        coin::register<AptosCoin>(&vault_signer);

        move_to(owner, BankState {
            owner: owner_addr,
            vault_signer_cap,
            vault_address,
            price_feed_addr,
            authorized_games: vector[],
        });
    }

    // ── Activation ──

    /// Sweeten the pot. Anyone can contribute APT to keep the bank active.
    public entry fun sweeten(
        donor: &signer,
        bank_owner: address,
        amount: u64,
    ) acquires BankState {
        let state = borrow_global<BankState>(bank_owner);
        aptos_account::transfer(donor, state.vault_address, amount);

        std::event::emit(Sweetened {
            donor: signer::address_of(donor),
            amount,
        });
    }

    /// Check if the bank has enough APT to cover the max payout ($1.00).
    public fun is_active(bank_owner: address): bool acquires BankState {
        let state = borrow_global<BankState>(bank_owner);
        let balance = coin::balance<AptosCoin>(state.vault_address);
        let min_octas = min_balance_octas(state.price_feed_addr);
        balance >= min_octas
    }

    /// Get the bank vault's APT balance in octas.
    public fun vault_balance(bank_owner: address): u64 acquires BankState {
        let state = borrow_global<BankState>(bank_owner);
        coin::balance<AptosCoin>(state.vault_address)
    }

    // ── Entry Fees ──

    /// Receive entry fee from a game contract. Called by authorized game modules.
    public(friend) fun receive_entry_fee(
        bank_owner: address,
        from: &signer,
        amount: u64,
    ) acquires BankState {
        let state = borrow_global<BankState>(bank_owner);
        let from_addr = signer::address_of(from);
        assert!(is_authorized_game(state, from_addr), E_NOT_AUTHORIZED_GAME);

        aptos_account::transfer(from, state.vault_address, amount);

        std::event::emit(EntryFeeReceived {
            game_contract: from_addr,
            amount,
        });
    }

    // ── Settlement ──

    /// Settle a game payout. Converts cents to octas using the game's price snapshot.
    /// Called by authorized game contracts via friend access.
    public(friend) fun settle(
        bank_owner: address,
        payout_cents: u64,
        player: address,
        apt_per_dollar: u64,
    ) acquires BankState {
        assert!(payout_cents <= MAX_PAYOUT_CENTS, E_PAYOUT_EXCEEDS_MAX);
        if (payout_cents == 0) return;

        let state = borrow_global<BankState>(bank_owner);
        let vault_signer = account::create_signer_with_capability(&state.vault_signer_cap);

        let payout_octas = deal_or_not::price_feed_helper::cents_to_octas_snapshot(
            payout_cents,
            apt_per_dollar,
        );

        // Cap at actual balance to avoid abort
        let balance = coin::balance<AptosCoin>(state.vault_address);
        if (payout_octas > balance) {
            payout_octas = balance;
        };

        aptos_account::transfer(&vault_signer, player, payout_octas);

        std::event::emit(Settled {
            player,
            payout_cents,
            payout_octas,
        });
    }

    // ── Admin ──

    /// Authorize a game contract address to receive entry fees and settle payouts.
    public entry fun set_authorized_game(
        owner: &signer,
        game: address,
        authorized: bool,
    ) acquires BankState {
        let owner_addr = signer::address_of(owner);
        let state = borrow_global_mut<BankState>(owner_addr);
        assert!(state.owner == owner_addr, E_NOT_OWNER);

        if (authorized) {
            if (!std::vector::contains(&state.authorized_games, &game)) {
                std::vector::push_back(&mut state.authorized_games, game);
            };
        } else {
            let (found, idx) = std::vector::index_of(&state.authorized_games, &game);
            if (found) {
                std::vector::remove(&mut state.authorized_games, idx);
            };
        };

        std::event::emit(GameAuthorized { game, authorized });
    }

    /// Rescue excess APT above the minimum threshold. Owner only.
    public entry fun rescue_apt(
        owner: &signer,
        to: address,
    ) acquires BankState {
        let owner_addr = signer::address_of(owner);
        let state = borrow_global<BankState>(owner_addr);
        assert!(state.owner == owner_addr, E_NOT_OWNER);

        let min_octas = min_balance_octas(state.price_feed_addr);
        let balance = coin::balance<AptosCoin>(state.vault_address);
        assert!(balance > min_octas, E_NO_FUNDS_TO_RESCUE);

        let excess = balance - min_octas;
        let vault_signer = account::create_signer_with_capability(&state.vault_signer_cap);
        aptos_account::transfer(&vault_signer, to, excess);

        std::event::emit(Rescued { to, amount: excess });
    }

    // ── Internal Helpers ──

    fun is_authorized_game(state: &BankState, addr: address): bool {
        std::vector::contains(&state.authorized_games, &addr)
    }

    fun min_balance_octas(price_feed_addr: address): u64 {
        deal_or_not::price_feed_helper::usd_to_octas(price_feed_addr, MIN_BALANCE_CENTS)
    }

    // ── View Functions ──

    #[view]
    public fun get_vault_address(bank_owner: address): address acquires BankState {
        let state = borrow_global<BankState>(bank_owner);
        state.vault_address
    }

    // ── Tests ──

    #[test_only]
    use aptos_framework::timestamp;
    #[test_only]
    use aptos_framework::aptos_coin;

    #[test_only]
    fun setup_test(owner: &signer, framework: &signer) {
        // Initialize framework modules needed for coin operations
        timestamp::set_time_has_started_for_testing(framework);
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(framework);

        account::create_account_for_test(signer::address_of(owner));

        // Initialize price feed
        deal_or_not::price_feed_helper::initialize(owner, 850_000_000);

        // Initialize bank
        initialize(owner, @0xCAFE);

        // Clean up capabilities
        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);
    }

    #[test(owner = @0xCAFE, framework = @aptos_framework)]
    fun test_initialize(owner: &signer, framework: &signer) acquires BankState {
        setup_test(owner, framework);

        // Check state
        let state = borrow_global<BankState>(@0xCAFE);
        assert!(state.owner == @0xCAFE, 0);
        assert!(state.price_feed_addr == @0xCAFE, 1);

        // Vault should exist and have zero balance
        assert!(coin::balance<AptosCoin>(state.vault_address) == 0, 2);
    }

    #[test(owner = @0xCAFE, framework = @aptos_framework)]
    fun test_is_active_when_empty(owner: &signer, framework: &signer) acquires BankState {
        setup_test(owner, framework);

        // Bank should not be active when empty
        assert!(!is_active(@0xCAFE), 0);
    }
}
