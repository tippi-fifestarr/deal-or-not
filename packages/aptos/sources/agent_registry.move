/// @title agent_registry — AI agent registration and stats tracking
/// @notice Registry of AI agents playing Deal or NOT. Tracks metadata,
/// stats, reputation for multi-track hackathon qualification.
/// Ported from AgentRegistry.sol.
///
/// Key differences from Solidity:
/// - No inheritance (Ownable) — uses stored admin address + assert
/// - mapping(uint256 => Agent) → SmartTable<u64, Agent>
/// - mapping(address => uint256[]) → SmartTable<address, vector<u64>>
/// - No function overloading — separate function names for address vs agentId lookups
module deal_or_not::agent_registry {
    use std::signer;
    use std::string::{Self, String};
    use std::vector;
    use aptos_std::smart_table::{Self, SmartTable};

    // ── Error Codes ──
    const E_UNAUTHORIZED: u64 = 300;
    const E_AGENT_NOT_FOUND: u64 = 301;
    const E_AGENT_IS_BANNED: u64 = 302;
    const E_INVALID_ENDPOINT: u64 = 303;
    const E_EMPTY_NAME: u64 = 304;
    const E_ALREADY_INITIALIZED: u64 = 305;
    const E_NOT_AGENT_OWNER: u64 = 306;

    // ── State ──

    struct Agent has store, copy, drop {
        owner: address,
        name: String,
        api_endpoint: String,
        metadata: String,
        games_played: u64,
        games_won: u64,
        total_earnings: u64, // in cents
        registered_at: u64,
        is_banned: bool,
        is_active: bool,
    }

    struct AgentStats has store, copy, drop {
        win_rate: u64,      // basis points (0-10000)
        avg_earnings: u64,  // cents
        reputation: u64,    // 0-10000
        rank: u64,
    }

    struct RegistryState has key {
        admin: address,
        agents: SmartTable<u64, Agent>,
        owner_agents: SmartTable<address, vector<u64>>,
        player_to_agent_id: SmartTable<address, u64>,
        authorized_callers: SmartTable<address, bool>,
        next_agent_id: u64,
        total_agents: u64,
    }

    // ── Events ──

    #[event]
    struct AgentRegistered has drop, store {
        agent_id: u64,
        owner: address,
        name: String,
    }

    #[event]
    struct AgentUpdated has drop, store {
        agent_id: u64,
    }

    #[event]
    struct AgentStatsUpdated has drop, store {
        agent_id: u64,
        games_played: u64,
        games_won: u64,
        total_earnings: u64,
    }

    #[event]
    struct AgentBanned has drop, store {
        agent_id: u64,
        reason: String,
    }

    #[event]
    struct AgentUnbanned has drop, store {
        agent_id: u64,
    }

    // ── Initialization ──

    public entry fun initialize(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<RegistryState>(admin_addr), E_ALREADY_INITIALIZED);

        move_to(admin, RegistryState {
            admin: admin_addr,
            agents: smart_table::new(),
            owner_agents: smart_table::new(),
            player_to_agent_id: smart_table::new(),
            authorized_callers: smart_table::new(),
            next_agent_id: 1,
            total_agents: 0,
        });
    }

    // ── Admin Functions ──

    public entry fun authorize_contract(
        admin: &signer,
        caller: address,
    ) acquires RegistryState {
        let admin_addr = signer::address_of(admin);
        let state = borrow_global_mut<RegistryState>(admin_addr);
        assert!(state.admin == admin_addr, E_UNAUTHORIZED);
        smart_table::upsert(&mut state.authorized_callers, caller, true);
    }

    public entry fun revoke_contract(
        admin: &signer,
        caller: address,
    ) acquires RegistryState {
        let admin_addr = signer::address_of(admin);
        let state = borrow_global_mut<RegistryState>(admin_addr);
        assert!(state.admin == admin_addr, E_UNAUTHORIZED);
        if (smart_table::contains(&state.authorized_callers, caller)) {
            smart_table::remove(&mut state.authorized_callers, caller);
        };
    }

    public entry fun ban_agent(
        admin: &signer,
        agent_id: u64,
        reason: String,
    ) acquires RegistryState {
        let admin_addr = signer::address_of(admin);
        let state = borrow_global_mut<RegistryState>(admin_addr);
        assert!(state.admin == admin_addr, E_UNAUTHORIZED);
        assert!(smart_table::contains(&state.agents, agent_id), E_AGENT_NOT_FOUND);

        let agent = smart_table::borrow_mut(&mut state.agents, agent_id);
        agent.is_banned = true;
        agent.is_active = false;

        std::event::emit(AgentBanned { agent_id, reason });
    }

    public entry fun unban_agent(
        admin: &signer,
        agent_id: u64,
    ) acquires RegistryState {
        let admin_addr = signer::address_of(admin);
        let state = borrow_global_mut<RegistryState>(admin_addr);
        assert!(state.admin == admin_addr, E_UNAUTHORIZED);
        assert!(smart_table::contains(&state.agents, agent_id), E_AGENT_NOT_FOUND);

        let agent = smart_table::borrow_mut(&mut state.agents, agent_id);
        agent.is_banned = false;
        agent.is_active = true;

        std::event::emit(AgentUnbanned { agent_id });
    }

    // ── Registration ──

    public entry fun register_agent(
        owner: &signer,
        registry_addr: address,
        name: String,
        api_endpoint: String,
        metadata: String,
    ) acquires RegistryState {
        assert!(string::length(&name) > 0, E_EMPTY_NAME);
        assert!(string::length(&api_endpoint) > 0, E_INVALID_ENDPOINT);

        let owner_addr = signer::address_of(owner);
        let state = borrow_global_mut<RegistryState>(registry_addr);
        let agent_id = state.next_agent_id;

        let agent = Agent {
            owner: owner_addr,
            name,
            api_endpoint,
            metadata,
            games_played: 0,
            games_won: 0,
            total_earnings: 0,
            registered_at: aptos_framework::timestamp::now_seconds(),
            is_banned: false,
            is_active: true,
        };

        smart_table::add(&mut state.agents, agent_id, agent);

        // Track owner's agents
        if (!smart_table::contains(&state.owner_agents, owner_addr)) {
            smart_table::add(&mut state.owner_agents, owner_addr, vector[agent_id]);
        } else {
            let ids = smart_table::borrow_mut(&mut state.owner_agents, owner_addr);
            vector::push_back(ids, agent_id);
        };

        // Map player address to agent ID
        smart_table::upsert(&mut state.player_to_agent_id, owner_addr, agent_id);

        state.next_agent_id = agent_id + 1;
        state.total_agents = state.total_agents + 1;

        std::event::emit(AgentRegistered {
            agent_id,
            owner: owner_addr,
            name: smart_table::borrow(&state.agents, agent_id).name,
        });
    }

    public entry fun update_agent(
        owner: &signer,
        registry_addr: address,
        agent_id: u64,
        api_endpoint: String,
        metadata: String,
    ) acquires RegistryState {
        let owner_addr = signer::address_of(owner);
        let state = borrow_global_mut<RegistryState>(registry_addr);
        assert!(smart_table::contains(&state.agents, agent_id), E_AGENT_NOT_FOUND);

        let agent = smart_table::borrow_mut(&mut state.agents, agent_id);
        assert!(agent.owner == owner_addr, E_NOT_AGENT_OWNER);

        if (string::length(&api_endpoint) > 0) {
            agent.api_endpoint = api_endpoint;
        };
        agent.metadata = metadata;

        std::event::emit(AgentUpdated { agent_id });
    }

    // ── Stats Recording (authorized callers only) ──

    public fun record_game(
        registry_addr: address,
        caller: address,
        agent_id: u64,
        won: bool,
        earnings: u64,
    ) acquires RegistryState {
        let state = borrow_global_mut<RegistryState>(registry_addr);
        assert!(
            smart_table::contains(&state.authorized_callers, caller)
                && *smart_table::borrow(&state.authorized_callers, caller),
            E_UNAUTHORIZED,
        );
        assert!(smart_table::contains(&state.agents, agent_id), E_AGENT_NOT_FOUND);

        let agent = smart_table::borrow_mut(&mut state.agents, agent_id);
        agent.games_played = agent.games_played + 1;
        if (won) {
            agent.games_won = agent.games_won + 1;
        };
        agent.total_earnings = agent.total_earnings + earnings;

        std::event::emit(AgentStatsUpdated {
            agent_id,
            games_played: agent.games_played,
            games_won: agent.games_won,
            total_earnings: agent.total_earnings,
        });
    }

    // ── View Functions ──

    #[view]
    public fun get_agent(
        registry_addr: address,
        agent_id: u64,
    ): (address, String, String, u64, u64, u64, bool, bool) acquires RegistryState {
        let state = borrow_global<RegistryState>(registry_addr);
        assert!(smart_table::contains(&state.agents, agent_id), E_AGENT_NOT_FOUND);
        let agent = smart_table::borrow(&state.agents, agent_id);
        (
            agent.owner,
            agent.name,
            agent.api_endpoint,
            agent.games_played,
            agent.games_won,
            agent.total_earnings,
            agent.is_banned,
            agent.is_active,
        )
    }

    #[view]
    public fun get_agent_stats(
        registry_addr: address,
        agent_id: u64,
    ): (u64, u64, u64, u64) acquires RegistryState {
        let state = borrow_global<RegistryState>(registry_addr);
        assert!(smart_table::contains(&state.agents, agent_id), E_AGENT_NOT_FOUND);
        let agent = smart_table::borrow(&state.agents, agent_id);

        let win_rate = if (agent.games_played > 0) {
            agent.games_won * 10000 / agent.games_played
        } else { 0 };

        let avg_earnings = if (agent.games_played > 0) {
            agent.total_earnings / agent.games_played
        } else { 0 };

        // Simple reputation: weighted win rate + earnings factor
        let reputation = if (agent.games_played >= 5) {
            let earnings_factor = if (agent.total_earnings > 1000) { 5000 } else {
                agent.total_earnings * 5000 / 1000
            };
            (win_rate + earnings_factor) / 2
        } else { 0 };

        (win_rate, avg_earnings, reputation, 0) // rank computed off-chain
    }

    #[view]
    public fun is_agent_eligible(
        registry_addr: address,
        agent_id: u64,
    ): bool acquires RegistryState {
        let state = borrow_global<RegistryState>(registry_addr);
        if (!smart_table::contains(&state.agents, agent_id)) return false;
        let agent = smart_table::borrow(&state.agents, agent_id);
        agent.is_active && !agent.is_banned
    }

    #[view]
    public fun get_agent_id_by_address(
        registry_addr: address,
        player: address,
    ): u64 acquires RegistryState {
        let state = borrow_global<RegistryState>(registry_addr);
        assert!(
            smart_table::contains(&state.player_to_agent_id, player),
            E_AGENT_NOT_FOUND,
        );
        *smart_table::borrow(&state.player_to_agent_id, player)
    }

    #[view]
    public fun get_total_agents(registry_addr: address): u64 acquires RegistryState {
        borrow_global<RegistryState>(registry_addr).total_agents
    }

    // ── Friend access for other modules ──

    friend deal_or_not::deal_or_not_agents;
    friend deal_or_not::agent_staking;
    friend deal_or_not::seasonal_leaderboard;

    public(friend) fun record_game_friend(
        registry_addr: address,
        agent_id: u64,
        won: bool,
        earnings: u64,
    ) acquires RegistryState {
        let state = borrow_global_mut<RegistryState>(registry_addr);
        assert!(smart_table::contains(&state.agents, agent_id), E_AGENT_NOT_FOUND);

        let agent = smart_table::borrow_mut(&mut state.agents, agent_id);
        agent.games_played = agent.games_played + 1;
        if (won) {
            agent.games_won = agent.games_won + 1;
        };
        agent.total_earnings = agent.total_earnings + earnings;

        std::event::emit(AgentStatsUpdated {
            agent_id,
            games_played: agent.games_played,
            games_won: agent.games_won,
            total_earnings: agent.total_earnings,
        });
    }

    // ── Tests ──

    #[test_only]
    use aptos_framework::account;
    #[test_only]
    use aptos_framework::timestamp;

    #[test(admin = @0xCAFE, framework = @aptos_framework)]
    fun test_initialize_and_register(
        admin: &signer,
        framework: &signer,
    ) acquires RegistryState {
        timestamp::set_time_has_started_for_testing(framework);
        account::create_account_for_test(signer::address_of(admin));

        initialize(admin);

        register_agent(
            admin,
            @0xCAFE,
            string::utf8(b"TestBot"),
            string::utf8(b"https://api.test.com"),
            string::utf8(b"{}"),
        );

        assert!(get_total_agents(@0xCAFE) == 1, 0);
        assert!(is_agent_eligible(@0xCAFE, 1), 1);
    }

    #[test(admin = @0xCAFE, framework = @aptos_framework)]
    fun test_ban_unban(
        admin: &signer,
        framework: &signer,
    ) acquires RegistryState {
        timestamp::set_time_has_started_for_testing(framework);
        account::create_account_for_test(signer::address_of(admin));

        initialize(admin);
        register_agent(
            admin,
            @0xCAFE,
            string::utf8(b"TestBot"),
            string::utf8(b"https://api.test.com"),
            string::utf8(b"{}"),
        );

        assert!(is_agent_eligible(@0xCAFE, 1), 0);

        ban_agent(admin, 1, string::utf8(b"cheating"));
        assert!(!is_agent_eligible(@0xCAFE, 1), 1);

        unban_agent(admin, 1);
        assert!(is_agent_eligible(@0xCAFE, 1), 2);
    }

    #[test(admin = @0xCAFE, caller = @0xBEEF, framework = @aptos_framework)]
    fun test_record_game(
        admin: &signer,
        caller: &signer,
        framework: &signer,
    ) acquires RegistryState {
        timestamp::set_time_has_started_for_testing(framework);
        account::create_account_for_test(signer::address_of(admin));
        account::create_account_for_test(@0xBEEF);

        initialize(admin);
        authorize_contract(admin, @0xBEEF);
        register_agent(
            admin,
            @0xCAFE,
            string::utf8(b"TestBot"),
            string::utf8(b"https://api.test.com"),
            string::utf8(b"{}"),
        );

        record_game(@0xCAFE, @0xBEEF, 1, true, 50);
        record_game(@0xCAFE, @0xBEEF, 1, false, 0);

        let (_, _, _, games_played, games_won, total_earnings, _, _) = get_agent(@0xCAFE, 1);
        assert!(games_played == 2, 0);
        assert!(games_won == 1, 1);
        assert!(total_earnings == 50, 2);
    }
}
