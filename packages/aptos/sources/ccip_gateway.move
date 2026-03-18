/// @title ccip_gateway — Cross-chain game entry via Chainlink CCIP
/// @notice CCIP spoke contract. Players on other chains pay entry fee to join
/// a game on Aptos (home chain) via cross-chain message.
/// Ported from DealOrNotGateway.sol.
///
/// Key differences from Solidity:
/// - Aptos CCIP uses `ccip::send_message()` from Chainlink's Aptos CCIP package
/// - For production: import `ccip_message_sender` pattern from aptos-starter-kit
/// - This is a STUB — real CCIP integration requires the Chainlink CCIP Aptos package
///   which is deployed at a specific address on Aptos mainnet/testnet
/// - Entry fee in APT (8 decimals) vs source chain's native token
///
/// Production integration path:
/// 1. Add ChainlinkCCIP dependency to Move.toml
/// 2. Use `ccip::fee_for_msg()` to estimate CCIP fees
/// 3. Use `ccip::ccip_send()` to send cross-chain messages
/// 4. Bridge contract on destination receives via `ccip_receive()`
module deal_or_not::ccip_gateway {
    use std::signer;
    use aptos_framework::aptos_account;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::coin;
    use aptos_framework::account::{Self, SignerCapability};

    // ── Error Codes ──
    const E_INSUFFICIENT_ENTRY_FEE: u64 = 1000;
    const E_HOME_BRIDGE_NOT_SET: u64 = 1001;
    const E_NOT_OWNER: u64 = 1002;
    const E_ALREADY_INITIALIZED: u64 = 1003;

    // ── Constants ──
    const ENTRY_FEE_CENTS: u64 = 25;
    const SLIPPAGE_BPS: u64 = 500;

    // Resource account seed
    const GATEWAY_SEED: vector<u8> = b"DEAL_OR_NOT_GATEWAY";

    // ── State ──

    struct GatewayState has key {
        owner: address,
        vault_signer_cap: SignerCapability,
        vault_address: address,
        price_feed_addr: address,
        // In production, this would be the CCIP chain selector + bridge address
        home_chain_selector: u64,
        home_bridge: address,
    }

    // ── Events ──

    #[event]
    struct CrossChainJoinSent has drop, store {
        player: address,
        game_id: u64,
        entry_fee: u64,
    }

    #[event]
    struct HomeBridgeUpdated has drop, store {
        new_bridge: address,
    }

    // ── Initialization ──

    public entry fun initialize(
        owner: &signer,
        price_feed_addr: address,
        home_chain_selector: u64,
    ) {
        let owner_addr = signer::address_of(owner);
        assert!(!exists<GatewayState>(owner_addr), E_ALREADY_INITIALIZED);

        let (vault_signer, vault_signer_cap) = account::create_resource_account(
            owner,
            GATEWAY_SEED,
        );
        let vault_address = signer::address_of(&vault_signer);
        coin::register<AptosCoin>(&vault_signer);

        move_to(owner, GatewayState {
            owner: owner_addr,
            vault_signer_cap,
            vault_address,
            price_feed_addr,
            home_chain_selector,
            home_bridge: @0x0,
        });
    }

    // ── Admin ──

    public entry fun set_home_bridge(
        owner: &signer,
        bridge: address,
    ) acquires GatewayState {
        let owner_addr = signer::address_of(owner);
        let state = borrow_global_mut<GatewayState>(owner_addr);
        assert!(state.owner == owner_addr, E_NOT_OWNER);
        state.home_bridge = bridge;

        std::event::emit(HomeBridgeUpdated { new_bridge: bridge });
    }

    // ── Cross-Chain Entry ──

    /// Enter a game on the home chain via CCIP.
    /// STUB: In production, this would call ccip::ccip_send() with the encoded message.
    /// For now, it collects the entry fee and emits an event.
    public entry fun enter_game(
        player: &signer,
        gateway_addr: address,
        game_id: u64,
    ) acquires GatewayState {
        let player_addr = signer::address_of(player);
        let state = borrow_global<GatewayState>(gateway_addr);
        assert!(state.home_bridge != @0x0, E_HOME_BRIDGE_NOT_SET);

        // Calculate entry fee
        let apt_per_dollar = deal_or_not::price_feed_helper::snapshot_price(state.price_feed_addr);
        let base_fee = deal_or_not::price_feed_helper::cents_to_octas_snapshot(
            ENTRY_FEE_CENTS,
            apt_per_dollar,
        );
        let entry_fee = deal_or_not::game_math::required_with_slippage(base_fee, SLIPPAGE_BPS);

        assert!(coin::balance<AptosCoin>(player_addr) >= entry_fee, E_INSUFFICIENT_ENTRY_FEE);

        // Collect entry fee (held until CCIP message confirmed on destination)
        aptos_account::transfer(player, state.vault_address, entry_fee);

        // TODO: In production, encode message and call ccip::ccip_send()
        // let message = bcs::to_bytes(&(game_id, player_addr));
        // ccip::ccip_send(vault_signer, home_chain_selector, home_bridge, message, ...);

        std::event::emit(CrossChainJoinSent {
            player: player_addr,
            game_id,
            entry_fee,
        });
    }

    // ── View Functions ──

    #[view]
    public fun estimate_entry_fee(gateway_addr: address): u64 acquires GatewayState {
        let state = borrow_global<GatewayState>(gateway_addr);
        let apt_per_dollar = deal_or_not::price_feed_helper::snapshot_price(state.price_feed_addr);
        let base_fee = deal_or_not::price_feed_helper::cents_to_octas_snapshot(
            ENTRY_FEE_CENTS,
            apt_per_dollar,
        );
        deal_or_not::game_math::required_with_slippage(base_fee, SLIPPAGE_BPS)
    }

    // ── Tests ──

    #[test_only]
    use aptos_framework::aptos_coin;
    #[test_only]
    use aptos_framework::timestamp;

    #[test(owner = @0xCAFE, framework = @aptos_framework)]
    fun test_initialize(owner: &signer, framework: &signer) acquires GatewayState {
        timestamp::set_time_has_started_for_testing(framework);
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(framework);
        account::create_account_for_test(signer::address_of(owner));

        deal_or_not::price_feed_helper::initialize(owner, 850_000_000);
        initialize(owner, @0xCAFE, 1);

        let fee = estimate_entry_fee(@0xCAFE);
        assert!(fee > 0, 0);

        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);
    }
}
