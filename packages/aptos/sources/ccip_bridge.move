/// @title ccip_bridge — Cross-chain game receiver via Chainlink CCIP
/// @notice CCIP receiver on Aptos (home chain). Receives cross-chain join messages
/// from gateways on other chains and forwards players to the game contract.
/// Ported from DealOrNotBridge.sol.
///
/// Key differences from Solidity:
/// - Aptos CCIP receiver uses `ccip_receive()` callback pattern from Chainlink's Aptos package
/// - For production: import `ccip_message_receiver` pattern from aptos-starter-kit
///   (deployed to resource account, receives via ccip::ccip_receive callback)
/// - This is a STUB — real CCIP integration requires the Chainlink CCIP Aptos package
///
/// Production integration path:
/// 1. Deploy bridge as resource account (required by CCIP receiver pattern)
/// 2. Register with CCIP router to receive messages
/// 3. Implement `ccip_receive(message: Any2AptosMessage)` callback
/// 4. Decode message, verify source gateway, forward to game contract
module deal_or_not::ccip_bridge {
    use std::signer;
    use aptos_std::smart_table::{Self, SmartTable};

    // ── Error Codes ──
    const E_UNAUTHORIZED_GATEWAY: u64 = 1100;
    const E_NOT_OWNER: u64 = 1101;
    const E_ALREADY_INITIALIZED: u64 = 1102;

    // ── State ──

    struct BridgeState has key {
        owner: address,
        game_store_addr: address, // deal_or_not_quickplay store address
        // chain_selector → gateway address (authorized sources)
        gateways: SmartTable<u64, address>,
    }

    // ── Events ──

    #[event]
    struct PlayerJoinedCrossChain has drop, store {
        source_chain: u64,
        player: address,
        game_id: u64,
    }

    #[event]
    struct CrossChainJoinFailed has drop, store {
        source_chain: u64,
        reason: u64,
    }

    #[event]
    struct GatewayRegistered has drop, store {
        chain_selector: u64,
        gateway: address,
    }

    #[event]
    struct GatewayRemoved has drop, store {
        chain_selector: u64,
    }

    // ── Initialization ──

    public entry fun initialize(
        owner: &signer,
        game_store_addr: address,
    ) {
        let owner_addr = signer::address_of(owner);
        assert!(!exists<BridgeState>(owner_addr), E_ALREADY_INITIALIZED);

        move_to(owner, BridgeState {
            owner: owner_addr,
            game_store_addr,
            gateways: smart_table::new(),
        });
    }

    // ── Admin ──

    public entry fun set_gateway(
        owner: &signer,
        chain_selector: u64,
        gateway: address,
    ) acquires BridgeState {
        let owner_addr = signer::address_of(owner);
        let state = borrow_global_mut<BridgeState>(owner_addr);
        assert!(state.owner == owner_addr, E_NOT_OWNER);

        smart_table::upsert(&mut state.gateways, chain_selector, gateway);

        std::event::emit(GatewayRegistered { chain_selector, gateway });
    }

    public entry fun remove_gateway(
        owner: &signer,
        chain_selector: u64,
    ) acquires BridgeState {
        let owner_addr = signer::address_of(owner);
        let state = borrow_global_mut<BridgeState>(owner_addr);
        assert!(state.owner == owner_addr, E_NOT_OWNER);

        if (smart_table::contains(&state.gateways, chain_selector)) {
            smart_table::remove(&mut state.gateways, chain_selector);
        };

        std::event::emit(GatewayRemoved { chain_selector });
    }

    public entry fun set_game_contract(
        owner: &signer,
        new_game_store: address,
    ) acquires BridgeState {
        let owner_addr = signer::address_of(owner);
        let state = borrow_global_mut<BridgeState>(owner_addr);
        assert!(state.owner == owner_addr, E_NOT_OWNER);
        state.game_store_addr = new_game_store;
    }

    // ── CCIP Receive (STUB) ──

    /// Process a cross-chain join message.
    /// STUB: In production, this would be called by the CCIP router's `ccip_receive` callback.
    /// For now, an authorized relay calls this with the decoded message data.
    public entry fun process_cross_chain_join(
        _relay: &signer,
        bridge_addr: address,
        source_chain: u64,
        source_sender: address,
        player: address,
        game_id: u64,
    ) acquires BridgeState {
        let state = borrow_global<BridgeState>(bridge_addr);

        // Verify authorized gateway
        assert!(smart_table::contains(&state.gateways, source_chain), E_UNAUTHORIZED_GATEWAY);
        let expected_gateway = *smart_table::borrow(&state.gateways, source_chain);
        assert!(source_sender == expected_gateway, E_UNAUTHORIZED_GATEWAY);

        // TODO: In production, forward to game contract
        // deal_or_not::deal_or_not_quickplay::join_game_cross_chain(
        //     state.game_store_addr, game_id, player
        // );

        std::event::emit(PlayerJoinedCrossChain {
            source_chain,
            player,
            game_id,
        });
    }

    // ── View Functions ──

    #[view]
    public fun get_gateway(
        bridge_addr: address,
        chain_selector: u64,
    ): address acquires BridgeState {
        let state = borrow_global<BridgeState>(bridge_addr);
        assert!(smart_table::contains(&state.gateways, chain_selector), E_UNAUTHORIZED_GATEWAY);
        *smart_table::borrow(&state.gateways, chain_selector)
    }

    #[view]
    public fun is_gateway_registered(
        bridge_addr: address,
        chain_selector: u64,
    ): bool acquires BridgeState {
        let state = borrow_global<BridgeState>(bridge_addr);
        smart_table::contains(&state.gateways, chain_selector)
    }

    // ── Tests ──

    #[test_only]
    use aptos_framework::account;
    #[test_only]
    use aptos_framework::timestamp;

    #[test(owner = @0xCAFE, framework = @aptos_framework)]
    fun test_gateway_management(
        owner: &signer,
        framework: &signer,
    ) acquires BridgeState {
        timestamp::set_time_has_started_for_testing(framework);
        account::create_account_for_test(signer::address_of(owner));

        initialize(owner, @0xCAFE);

        // Register ETH Sepolia gateway
        set_gateway(owner, 16015286601757825753, @0xDEAD);
        assert!(is_gateway_registered(@0xCAFE, 16015286601757825753), 0);

        // Remove gateway
        remove_gateway(owner, 16015286601757825753);
        assert!(!is_gateway_registered(@0xCAFE, 16015286601757825753), 1);
    }
}
