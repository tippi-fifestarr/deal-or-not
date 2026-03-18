/// @title agent_staking — Stake APT on AI agents, earn revenue share
/// @notice Users stake APT on agents; earn a share of agent winnings (20% revenue share).
/// 7-day lockup period. Uses reward-per-share accumulator pattern.
/// Ported from AgentStaking.sol.
///
/// Key differences from Solidity:
/// - APT (8 decimals) vs ETH (18 decimals) — SCALE stays 1e18 for precision
/// - Resource account not needed — staked APT held in module's coin store
/// - Uses aptos_framework::coin for APT transfers
/// - No payable modifier — explicit coin::transfer calls
module deal_or_not::agent_staking {
    use std::signer;
    use std::vector;
    use aptos_framework::aptos_account;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::coin;
    use aptos_framework::timestamp;
    use aptos_framework::account::{Self, SignerCapability};
    use aptos_std::smart_table::{Self, SmartTable};

    friend deal_or_not::deal_or_not_agents;

    // ── Error Codes ──
    const E_AGENT_NOT_ELIGIBLE: u64 = 400;
    const E_INSUFFICIENT_STAKE: u64 = 401;
    const E_STAKE_LOCKED: u64 = 402;
    const E_STAKE_NOT_ACTIVE: u64 = 403;
    const E_NO_REWARDS: u64 = 404;
    const E_UNAUTHORIZED: u64 = 405;
    const E_ZERO_AMOUNT: u64 = 406;
    const E_ALREADY_INITIALIZED: u64 = 407;
    const E_STAKE_NOT_FOUND: u64 = 408;

    // ── Constants ──
    const LOCKUP_PERIOD: u64 = 604800; // 7 days in seconds
    const AGENT_REVENUE_SHARE: u64 = 2000; // 20% in basis points
    const SCALE: u128 = 1_000_000_000_000_000_000; // 1e18 for reward precision

    // Resource account seed
    const STAKING_SEED: vector<u8> = b"DEAL_OR_NOT_STAKING";

    // ── State ──

    struct Stake has store, copy, drop {
        staker: address,
        agent_id: u64,
        amount: u64, // octas
        staked_at: u64,
        last_claim_at: u64,
        active: bool,
    }

    struct AgentPool has store, copy, drop {
        total_staked: u64,
        total_rewards: u64,
        reward_per_share: u128, // scaled by SCALE
        last_update_at: u64,
    }

    struct StakingState has key {
        admin: address,
        vault_signer_cap: SignerCapability,
        vault_address: address,
        registry_addr: address,
        stakes: SmartTable<u64, Stake>,
        agent_pools: SmartTable<u64, AgentPool>,
        staker_stakes: SmartTable<address, vector<u64>>,
        reward_debt: SmartTable<u64, u128>, // stake_id → debt (scaled)
        next_stake_id: u64,
        total_staked: u64,
        total_rewards_distributed: u64,
        authorized_callers: SmartTable<address, bool>,
    }

    // ── Events ──

    #[event]
    struct Staked has drop, store {
        stake_id: u64,
        staker: address,
        agent_id: u64,
        amount: u64,
    }

    #[event]
    struct Unstaked has drop, store {
        stake_id: u64,
        staker: address,
        amount: u64,
    }

    #[event]
    struct RewardsClaimed has drop, store {
        stake_id: u64,
        staker: address,
        amount: u64,
    }

    #[event]
    struct AgentRewardAdded has drop, store {
        agent_id: u64,
        amount: u64,
    }

    // ── Initialization ──

    public entry fun initialize(
        admin: &signer,
        registry_addr: address,
    ) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<StakingState>(admin_addr), E_ALREADY_INITIALIZED);

        let (vault_signer, vault_signer_cap) = account::create_resource_account(
            admin,
            STAKING_SEED,
        );
        let vault_address = signer::address_of(&vault_signer);
        coin::register<AptosCoin>(&vault_signer);

        move_to(admin, StakingState {
            admin: admin_addr,
            vault_signer_cap,
            vault_address,
            registry_addr,
            stakes: smart_table::new(),
            agent_pools: smart_table::new(),
            staker_stakes: smart_table::new(),
            reward_debt: smart_table::new(),
            next_stake_id: 1,
            total_staked: 0,
            total_rewards_distributed: 0,
            authorized_callers: smart_table::new(),
        });
    }

    // ── Admin ──

    public entry fun set_authorized_caller(
        admin: &signer,
        caller: address,
        authorized: bool,
    ) acquires StakingState {
        let admin_addr = signer::address_of(admin);
        let state = borrow_global_mut<StakingState>(admin_addr);
        assert!(state.admin == admin_addr, E_UNAUTHORIZED);
        smart_table::upsert(&mut state.authorized_callers, caller, authorized);
    }

    // ── Staking ──

    public entry fun stake(
        staker: &signer,
        staking_addr: address,
        agent_id: u64,
        amount: u64,
    ) acquires StakingState {
        assert!(amount > 0, E_ZERO_AMOUNT);

        let staker_addr = signer::address_of(staker);
        let state = borrow_global_mut<StakingState>(staking_addr);

        // Check agent eligibility
        assert!(
            deal_or_not::agent_registry::is_agent_eligible(state.registry_addr, agent_id),
            E_AGENT_NOT_ELIGIBLE,
        );

        // Transfer APT to vault
        aptos_account::transfer(staker, state.vault_address, amount);

        // Initialize agent pool if needed
        if (!smart_table::contains(&state.agent_pools, agent_id)) {
            smart_table::add(&mut state.agent_pools, agent_id, AgentPool {
                total_staked: 0,
                total_rewards: 0,
                reward_per_share: 0,
                last_update_at: timestamp::now_seconds(),
            });
        };

        let pool = smart_table::borrow_mut(&mut state.agent_pools, agent_id);
        pool.total_staked = pool.total_staked + amount;

        let stake_id = state.next_stake_id;
        let stake_obj = Stake {
            staker: staker_addr,
            agent_id,
            amount,
            staked_at: timestamp::now_seconds(),
            last_claim_at: timestamp::now_seconds(),
            active: true,
        };

        smart_table::add(&mut state.stakes, stake_id, stake_obj);

        // Track reward debt for this stake
        let current_rps = pool.reward_per_share;
        smart_table::add(
            &mut state.reward_debt,
            stake_id,
            (amount as u128) * current_rps / SCALE,
        );

        // Track staker's stakes
        if (!smart_table::contains(&state.staker_stakes, staker_addr)) {
            smart_table::add(&mut state.staker_stakes, staker_addr, vector[stake_id]);
        } else {
            let ids = smart_table::borrow_mut(&mut state.staker_stakes, staker_addr);
            vector::push_back(ids, stake_id);
        };

        state.next_stake_id = stake_id + 1;
        state.total_staked = state.total_staked + amount;

        std::event::emit(Staked {
            stake_id,
            staker: staker_addr,
            agent_id,
            amount,
        });
    }

    public entry fun unstake(
        staker: &signer,
        staking_addr: address,
        stake_id: u64,
    ) acquires StakingState {
        let staker_addr = signer::address_of(staker);
        let state = borrow_global_mut<StakingState>(staking_addr);

        assert!(smart_table::contains(&state.stakes, stake_id), E_STAKE_NOT_FOUND);
        let stake_obj = smart_table::borrow(&state.stakes, stake_id);
        assert!(stake_obj.staker == staker_addr, E_UNAUTHORIZED);
        assert!(stake_obj.active, E_STAKE_NOT_ACTIVE);
        assert!(
            timestamp::now_seconds() >= stake_obj.staked_at + LOCKUP_PERIOD,
            E_STAKE_LOCKED,
        );

        // Claim pending rewards first
        let pending = calculate_pending(state, stake_id);
        let amount = stake_obj.amount;
        let agent_id = stake_obj.agent_id;

        // Update stake
        let stake_mut = smart_table::borrow_mut(&mut state.stakes, stake_id);
        stake_mut.active = false;

        // Update pool
        let pool = smart_table::borrow_mut(&mut state.agent_pools, agent_id);
        pool.total_staked = pool.total_staked - amount;

        // Transfer stake + rewards back
        let vault_signer = account::create_signer_with_capability(&state.vault_signer_cap);
        let total_return = amount + pending;
        if (total_return > 0) {
            aptos_account::transfer(&vault_signer, staker_addr, total_return);
        };

        state.total_staked = state.total_staked - amount;
        if (pending > 0) {
            state.total_rewards_distributed = state.total_rewards_distributed + pending;
        };

        std::event::emit(Unstaked {
            stake_id,
            staker: staker_addr,
            amount,
        });
    }

    public entry fun claim_rewards(
        staker: &signer,
        staking_addr: address,
        stake_id: u64,
    ) acquires StakingState {
        let staker_addr = signer::address_of(staker);
        let state = borrow_global_mut<StakingState>(staking_addr);

        assert!(smart_table::contains(&state.stakes, stake_id), E_STAKE_NOT_FOUND);
        let stake_obj = smart_table::borrow(&state.stakes, stake_id);
        assert!(stake_obj.staker == staker_addr, E_UNAUTHORIZED);
        assert!(stake_obj.active, E_STAKE_NOT_ACTIVE);

        let pending = calculate_pending(state, stake_id);
        assert!(pending > 0, E_NO_REWARDS);

        // Update reward debt
        let agent_id = stake_obj.agent_id;
        let pool = smart_table::borrow(&state.agent_pools, agent_id);
        let new_debt = (stake_obj.amount as u128) * pool.reward_per_share / SCALE;
        smart_table::upsert(&mut state.reward_debt, stake_id, new_debt);

        // Update last claim
        let stake_mut = smart_table::borrow_mut(&mut state.stakes, stake_id);
        stake_mut.last_claim_at = timestamp::now_seconds();

        // Transfer rewards
        let vault_signer = account::create_signer_with_capability(&state.vault_signer_cap);
        aptos_account::transfer(&vault_signer, staker_addr, pending);

        state.total_rewards_distributed = state.total_rewards_distributed + pending;

        std::event::emit(RewardsClaimed {
            stake_id,
            staker: staker_addr,
            amount: pending,
        });
    }

    // ── Reward Distribution (authorized callers or friend modules) ──

    // Called when an agent earns rewards from a game
    public(friend) fun add_agent_reward(
        staking_addr: address,
        agent_id: u64,
        reward_octas: u64,
    ) acquires StakingState {
        if (reward_octas == 0) return;

        let state = borrow_global_mut<StakingState>(staking_addr);
        if (!smart_table::contains(&state.agent_pools, agent_id)) return;

        let pool = smart_table::borrow_mut(&mut state.agent_pools, agent_id);
        if (pool.total_staked == 0) return;

        // 20% revenue share goes to stakers
        let staker_share = reward_octas * AGENT_REVENUE_SHARE / 10000;
        pool.total_rewards = pool.total_rewards + staker_share;
        pool.reward_per_share = pool.reward_per_share
            + (staker_share as u128) * SCALE / (pool.total_staked as u128);
        pool.last_update_at = timestamp::now_seconds();

        std::event::emit(AgentRewardAdded {
            agent_id,
            amount: staker_share,
        });
    }

    // ── Internal ──

    fun calculate_pending(state: &StakingState, stake_id: u64): u64 {
        let stake_obj = smart_table::borrow(&state.stakes, stake_id);
        if (!stake_obj.active) return 0;
        if (!smart_table::contains(&state.agent_pools, stake_obj.agent_id)) return 0;

        let pool = smart_table::borrow(&state.agent_pools, stake_obj.agent_id);
        let accumulated = (stake_obj.amount as u128) * pool.reward_per_share / SCALE;
        let debt = if (smart_table::contains(&state.reward_debt, stake_id)) {
            *smart_table::borrow(&state.reward_debt, stake_id)
        } else { 0 };

        if (accumulated > debt) {
            ((accumulated - debt) as u64)
        } else {
            0
        }
    }

    // ── View Functions ──

    #[view]
    public fun get_pending_rewards(
        staking_addr: address,
        stake_id: u64,
    ): u64 acquires StakingState {
        let state = borrow_global<StakingState>(staking_addr);
        calculate_pending(state, stake_id)
    }

    #[view]
    public fun get_agent_total_staked(
        staking_addr: address,
        agent_id: u64,
    ): u64 acquires StakingState {
        let state = borrow_global<StakingState>(staking_addr);
        if (!smart_table::contains(&state.agent_pools, agent_id)) return 0;
        smart_table::borrow(&state.agent_pools, agent_id).total_staked
    }

    #[view]
    public fun can_unstake(
        staking_addr: address,
        stake_id: u64,
    ): bool acquires StakingState {
        let state = borrow_global<StakingState>(staking_addr);
        if (!smart_table::contains(&state.stakes, stake_id)) return false;
        let stake_obj = smart_table::borrow(&state.stakes, stake_id);
        stake_obj.active && timestamp::now_seconds() >= stake_obj.staked_at + LOCKUP_PERIOD
    }

    // ── Tests ──

    #[test_only]
    use aptos_framework::aptos_coin;

    #[test(admin = @0xCAFE, framework = @aptos_framework)]
    fun test_initialize(admin: &signer, framework: &signer) acquires StakingState {
        timestamp::set_time_has_started_for_testing(framework);
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(framework);
        account::create_account_for_test(signer::address_of(admin));

        // Initialize registry first (required dependency)
        deal_or_not::agent_registry::initialize(admin);

        initialize(admin, @0xCAFE);

        let state = borrow_global<StakingState>(@0xCAFE);
        assert!(state.total_staked == 0, 0);
        assert!(state.next_stake_id == 1, 1);

        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);
    }
}
