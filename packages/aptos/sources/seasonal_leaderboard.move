/// @title seasonal_leaderboard — Monthly agent tournaments
/// @notice Agents earn points for wins, earnings, perfect games.
/// Prize distribution: 1st=50%, 2nd=25%, 3rd=15%, 4-10=10% split.
/// Ported from SeasonalLeaderboard.sol.
///
/// Key differences from Solidity:
/// - No nested mappings — uses SmartTable with composite keys (season_id * 1_000_000 + agent_id)
/// - Prize pool in APT (octas) not ETH (wei)
/// - Bubble sort for rankings (same as Solidity — small N)
module deal_or_not::seasonal_leaderboard {
    use std::signer;
    use std::vector;
    use aptos_framework::aptos_account;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::coin;
    use aptos_framework::timestamp;
    use aptos_framework::account::{Self, SignerCapability};
    use aptos_std::smart_table::{Self, SmartTable};

    // ── Error Codes ──
    const E_SEASON_NOT_ACTIVE: u64 = 500;
    const E_SEASON_ALREADY_ACTIVE: u64 = 501;
    const E_UNAUTHORIZED: u64 = 502;
    const E_PRIZES_ALREADY_DISTRIBUTED: u64 = 503;
    const E_INSUFFICIENT_PRIZE_POOL: u64 = 504;
    const E_ALREADY_INITIALIZED: u64 = 505;

    // ── Constants ──
    const SEASON_DURATION: u64 = 2592000; // 30 days
    const POINTS_PER_WIN: u64 = 100;
    const POINTS_PER_DOLLAR_EARNED: u64 = 10;
    const BONUS_PERFECT_GAME: u64 = 500;
    const TOP_AGENTS_COUNT: u64 = 10;

    // Resource account seed
    const LEADERBOARD_SEED: vector<u8> = b"DEAL_OR_NOT_LEADERBOARD";

    // ── State ──

    struct AgentSeasonStats has store, copy, drop {
        games_played: u64,
        games_won: u64,
        total_earnings: u64, // cents
        highest_single_game: u64, // cents
        points: u64,
    }

    struct Season has store, copy, drop {
        start_time: u64,
        end_time: u64,
        total_prize_pool: u64, // octas
        is_active: bool,
        prizes_distributed: bool,
    }

    struct LeaderboardState has key {
        admin: address,
        vault_signer_cap: SignerCapability,
        vault_address: address,
        registry_addr: address,
        seasons: SmartTable<u64, Season>,
        // Composite key: season_id * 1_000_000 + agent_id → stats
        agent_stats: SmartTable<u64, AgentSeasonStats>,
        // season_id → vector of participating agent IDs
        season_agents: SmartTable<u64, vector<u64>>,
        current_season_id: u64,
        total_seasons: u64,
        authorized_recorders: SmartTable<address, bool>,
    }

    // ── Events ──

    #[event]
    struct SeasonStarted has drop, store {
        season_id: u64,
        start_time: u64,
        end_time: u64,
    }

    #[event]
    struct SeasonEnded has drop, store {
        season_id: u64,
    }

    #[event]
    struct PointsAwarded has drop, store {
        season_id: u64,
        agent_id: u64,
        points: u64,
        total_points: u64,
    }

    #[event]
    struct PrizeDistributed has drop, store {
        season_id: u64,
        agent_id: u64,
        rank: u64,
        prize_octas: u64,
    }

    // ── Initialization ──

    public entry fun initialize(
        admin: &signer,
        registry_addr: address,
    ) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<LeaderboardState>(admin_addr), E_ALREADY_INITIALIZED);

        let (vault_signer, vault_signer_cap) = account::create_resource_account(
            admin,
            LEADERBOARD_SEED,
        );
        let vault_address = signer::address_of(&vault_signer);
        coin::register<AptosCoin>(&vault_signer);

        move_to(admin, LeaderboardState {
            admin: admin_addr,
            vault_signer_cap,
            vault_address,
            registry_addr,
            seasons: smart_table::new(),
            agent_stats: smart_table::new(),
            season_agents: smart_table::new(),
            current_season_id: 0,
            total_seasons: 0,
            authorized_recorders: smart_table::new(),
        });
    }

    // ── Admin ──

    public entry fun authorize_recorder(
        admin: &signer,
        recorder: address,
    ) acquires LeaderboardState {
        let admin_addr = signer::address_of(admin);
        let state = borrow_global_mut<LeaderboardState>(admin_addr);
        assert!(state.admin == admin_addr, E_UNAUTHORIZED);
        smart_table::upsert(&mut state.authorized_recorders, recorder, true);
    }

    public entry fun start_season(admin: &signer) acquires LeaderboardState {
        let admin_addr = signer::address_of(admin);
        let state = borrow_global_mut<LeaderboardState>(admin_addr);
        assert!(state.admin == admin_addr, E_UNAUTHORIZED);

        // Check no active season
        if (state.current_season_id > 0) {
            let current = smart_table::borrow(&state.seasons, state.current_season_id);
            assert!(!current.is_active, E_SEASON_ALREADY_ACTIVE);
        };

        let now = timestamp::now_seconds();
        state.total_seasons = state.total_seasons + 1;
        let season_id = state.total_seasons;
        state.current_season_id = season_id;

        smart_table::add(&mut state.seasons, season_id, Season {
            start_time: now,
            end_time: now + SEASON_DURATION,
            total_prize_pool: 0,
            is_active: true,
            prizes_distributed: false,
        });

        smart_table::add(&mut state.season_agents, season_id, vector[]);

        std::event::emit(SeasonStarted {
            season_id,
            start_time: now,
            end_time: now + SEASON_DURATION,
        });
    }

    public entry fun end_season(admin: &signer) acquires LeaderboardState {
        let admin_addr = signer::address_of(admin);
        let state = borrow_global_mut<LeaderboardState>(admin_addr);
        assert!(state.admin == admin_addr, E_UNAUTHORIZED);
        assert!(state.current_season_id > 0, E_SEASON_NOT_ACTIVE);

        let season = smart_table::borrow_mut(&mut state.seasons, state.current_season_id);
        assert!(season.is_active, E_SEASON_NOT_ACTIVE);
        season.is_active = false;

        std::event::emit(SeasonEnded { season_id: state.current_season_id });
    }

    public entry fun add_prize_pool(
        admin: &signer,
        amount: u64,
    ) acquires LeaderboardState {
        let admin_addr = signer::address_of(admin);
        let state = borrow_global_mut<LeaderboardState>(admin_addr);
        assert!(state.admin == admin_addr, E_UNAUTHORIZED);
        assert!(state.current_season_id > 0, E_SEASON_NOT_ACTIVE);

        aptos_account::transfer(admin, state.vault_address, amount);

        let season = smart_table::borrow_mut(&mut state.seasons, state.current_season_id);
        season.total_prize_pool = season.total_prize_pool + amount;
    }

    /// Distribute prizes after season ends.
    /// 1st=50%, 2nd=25%, 3rd=15%, 4-10=10% split
    public entry fun distribute_prizes(admin: &signer) acquires LeaderboardState {
        let admin_addr = signer::address_of(admin);
        let state = borrow_global_mut<LeaderboardState>(admin_addr);
        assert!(state.admin == admin_addr, E_UNAUTHORIZED);

        let season_id = state.current_season_id;
        let season = smart_table::borrow(&state.seasons, season_id);
        assert!(!season.is_active, E_SEASON_ALREADY_ACTIVE);
        assert!(!season.prizes_distributed, E_PRIZES_ALREADY_DISTRIBUTED);
        assert!(season.total_prize_pool > 0, E_INSUFFICIENT_PRIZE_POOL);

        let prize_pool = season.total_prize_pool;

        // Get ranked agents by points (bubble sort, small N)
        let agents = *smart_table::borrow(&state.season_agents, season_id);
        let len = vector::length(&agents);
        if (len == 0) return;

        // Bubble sort by points descending
        let i = 0;
        while (i < len) {
            let j = 0;
            while (j < len - 1 - i) {
                let key_j = season_id * 1_000_000 + *vector::borrow(&agents, j);
                let key_j1 = season_id * 1_000_000 + *vector::borrow(&agents, j + 1);
                let points_j = if (smart_table::contains(&state.agent_stats, key_j)) {
                    smart_table::borrow(&state.agent_stats, key_j).points
                } else { 0 };
                let points_j1 = if (smart_table::contains(&state.agent_stats, key_j1)) {
                    smart_table::borrow(&state.agent_stats, key_j1).points
                } else { 0 };
                if (points_j < points_j1) {
                    vector::swap(&mut agents, j, j + 1);
                };
                j = j + 1;
            };
            i = i + 1;
        };

        let vault_signer = account::create_signer_with_capability(&state.vault_signer_cap);

        // Distribute to top agents
        let max_winners = if (len < TOP_AGENTS_COUNT) { len } else { TOP_AGENTS_COUNT };
        let rank = 0;
        while (rank < max_winners) {
            let agent_id = *vector::borrow(&agents, rank);
            let prize = prize_for_rank(rank, prize_pool, max_winners);
            if (prize > 0) {
                // Get agent owner address from registry
                let (owner, _, _, _, _, _, _, _) = deal_or_not::agent_registry::get_agent(
                    state.registry_addr,
                    agent_id,
                );
                aptos_account::transfer(&vault_signer, owner, prize);

                std::event::emit(PrizeDistributed {
                    season_id,
                    agent_id,
                    rank: rank + 1,
                    prize_octas: prize,
                });
            };
            rank = rank + 1;
        };

        let season_mut = smart_table::borrow_mut(&mut state.seasons, season_id);
        season_mut.prizes_distributed = true;
    }

    // ── Game Recording ──

    public fun record_game_result(
        leaderboard_addr: address,
        caller: address,
        agent_id: u64,
        won: bool,
        earnings_cents: u64,
    ) acquires LeaderboardState {
        let state = borrow_global_mut<LeaderboardState>(leaderboard_addr);
        assert!(
            smart_table::contains(&state.authorized_recorders, caller)
                && *smart_table::borrow(&state.authorized_recorders, caller),
            E_UNAUTHORIZED,
        );

        let season_id = state.current_season_id;
        if (season_id == 0) return;
        let season = smart_table::borrow(&state.seasons, season_id);
        if (!season.is_active) return;

        let key = season_id * 1_000_000 + agent_id;

        // Initialize stats if first game this season
        if (!smart_table::contains(&state.agent_stats, key)) {
            smart_table::add(&mut state.agent_stats, key, AgentSeasonStats {
                games_played: 0,
                games_won: 0,
                total_earnings: 0,
                highest_single_game: 0,
                points: 0,
            });

            // Add to participating agents
            let season_agents = smart_table::borrow_mut(&mut state.season_agents, season_id);
            vector::push_back(season_agents, agent_id);
        };

        let stats = smart_table::borrow_mut(&mut state.agent_stats, key);
        stats.games_played = stats.games_played + 1;

        let points_earned: u64 = 0;

        if (won) {
            stats.games_won = stats.games_won + 1;
            points_earned = points_earned + POINTS_PER_WIN;
        };

        stats.total_earnings = stats.total_earnings + earnings_cents;
        points_earned = points_earned + earnings_cents * POINTS_PER_DOLLAR_EARNED / 100;

        if (earnings_cents > stats.highest_single_game) {
            stats.highest_single_game = earnings_cents;
        };

        // Perfect game bonus: earned max ($1.00 = 100 cents)
        if (earnings_cents >= 100) {
            points_earned = points_earned + BONUS_PERFECT_GAME;
        };

        stats.points = stats.points + points_earned;

        std::event::emit(PointsAwarded {
            season_id,
            agent_id,
            points: points_earned,
            total_points: stats.points,
        });
    }

    // ── Internal ──

    fun prize_for_rank(rank: u64, total_pool: u64, _num_winners: u64): u64 {
        if (rank == 0) {
            total_pool * 50 / 100  // 1st: 50%
        } else if (rank == 1) {
            total_pool * 25 / 100  // 2nd: 25%
        } else if (rank == 2) {
            total_pool * 15 / 100  // 3rd: 15%
        } else if (rank < TOP_AGENTS_COUNT) {
            // 4th-10th: split 10%
            total_pool * 10 / 100 / 7
        } else {
            0
        }
    }

    // ── View Functions ──

    #[view]
    public fun is_season_active(leaderboard_addr: address): bool acquires LeaderboardState {
        let state = borrow_global<LeaderboardState>(leaderboard_addr);
        if (state.current_season_id == 0) return false;
        smart_table::borrow(&state.seasons, state.current_season_id).is_active
    }

    #[view]
    public fun get_agent_season_stats(
        leaderboard_addr: address,
        season_id: u64,
        agent_id: u64,
    ): (u64, u64, u64, u64, u64) acquires LeaderboardState {
        let state = borrow_global<LeaderboardState>(leaderboard_addr);
        let key = season_id * 1_000_000 + agent_id;
        if (!smart_table::contains(&state.agent_stats, key)) {
            return (0, 0, 0, 0, 0)
        };
        let stats = smart_table::borrow(&state.agent_stats, key);
        (stats.games_played, stats.games_won, stats.total_earnings, stats.highest_single_game, stats.points)
    }

    #[view]
    public fun get_current_season_id(leaderboard_addr: address): u64 acquires LeaderboardState {
        borrow_global<LeaderboardState>(leaderboard_addr).current_season_id
    }

    // ── Tests ──

    #[test_only]
    use aptos_framework::aptos_coin;

    #[test(admin = @0xCAFE, framework = @aptos_framework)]
    fun test_season_lifecycle(
        admin: &signer,
        framework: &signer,
    ) acquires LeaderboardState {
        timestamp::set_time_has_started_for_testing(framework);
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(framework);
        account::create_account_for_test(signer::address_of(admin));

        deal_or_not::agent_registry::initialize(admin);
        initialize(admin, @0xCAFE);

        assert!(!is_season_active(@0xCAFE), 0);

        start_season(admin);
        assert!(is_season_active(@0xCAFE), 1);
        assert!(get_current_season_id(@0xCAFE) == 1, 2);

        end_season(admin);
        assert!(!is_season_active(@0xCAFE), 3);

        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);
    }

    #[test(admin = @0xCAFE, recorder = @0xBEEF, framework = @aptos_framework)]
    fun test_record_and_points(
        admin: &signer,
        recorder: &signer,
        framework: &signer,
    ) acquires LeaderboardState {
        timestamp::set_time_has_started_for_testing(framework);
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(framework);
        account::create_account_for_test(signer::address_of(admin));
        account::create_account_for_test(@0xBEEF);

        deal_or_not::agent_registry::initialize(admin);
        deal_or_not::agent_registry::register_agent(
            admin,
            @0xCAFE,
            std::string::utf8(b"TestBot"),
            std::string::utf8(b"https://test.com"),
            std::string::utf8(b"{}"),
        );

        initialize(admin, @0xCAFE);
        authorize_recorder(admin, @0xBEEF);
        start_season(admin);

        // Record a win with 50 cents earnings
        record_game_result(@0xCAFE, @0xBEEF, 1, true, 50);

        let (games_played, games_won, total_earnings, _highest, points) =
            get_agent_season_stats(@0xCAFE, 1, 1);
        assert!(games_played == 1, 0);
        assert!(games_won == 1, 1);
        assert!(total_earnings == 50, 2);
        // Points: 100 (win) + 50*10/100 (earnings) = 105
        assert!(points == 105, 3);

        // Record a perfect game (100 cents)
        record_game_result(@0xCAFE, @0xBEEF, 1, true, 100);

        let (_, _, _, _, points2) = get_agent_season_stats(@0xCAFE, 1, 1);
        // Previous 105 + 100 (win) + 100*10/100 (earnings) + 500 (perfect) = 715
        assert!(points2 == 715, 4);

        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);
    }
}
