/// @title banker_algorithm — Deal or NOT banker offer computation
/// @notice Pure library for computing banker offers. EV-based with discount
/// escalation, random variance, and banker psychology.
/// Ported from BankerAlgorithm.sol.
///
/// Key difference from Solidity: Move has no signed integers (int256).
/// We use a SignedU64 struct { value: u64, is_negative: bool } for
/// intermediate calculations, then resolve to unsigned at the end.
module deal_or_not::banker_algorithm {
    use std::vector;
    use aptos_std::aptos_hash;

    // ── Signed Integer Helpers ──
    // Move has no int256, so we represent signed values as (magnitude, is_negative)

    struct SignedU64 has copy, drop {
        value: u64,
        is_negative: bool,
    }

    fun signed(value: u64, is_negative: bool): SignedU64 {
        SignedU64 { value, is_negative }
    }

    fun signed_pos(value: u64): SignedU64 {
        SignedU64 { value, is_negative: false }
    }

    /// Add two signed values
    fun signed_add(a: SignedU64, b: SignedU64): SignedU64 {
        if (a.is_negative == b.is_negative) {
            // Same sign: add magnitudes, keep sign
            SignedU64 { value: a.value + b.value, is_negative: a.is_negative }
        } else {
            // Different signs: subtract smaller from larger
            if (a.value >= b.value) {
                SignedU64 { value: a.value - b.value, is_negative: a.is_negative }
            } else {
                SignedU64 { value: b.value - a.value, is_negative: b.is_negative }
            }
        }
    }

    /// Clamp a signed value to [min, max] (both positive)
    fun signed_clamp(val: SignedU64, min: u64, max: u64): u64 {
        if (val.is_negative) {
            // Negative values clamp to min
            min
        } else {
            if (val.value < min) { min }
            else if (val.value > max) { max }
            else { val.value }
        }
    }

    // ── Core Functions ──

    /// Calculate expected value of remaining case values (in cents)
    public fun expected_value(remaining_values: &vector<u64>): u64 {
        let len = vector::length(remaining_values);
        if (len == 0) return 0;
        let sum = 0u64;
        let i = 0;
        while (i < len) {
            sum = sum + *vector::borrow(remaining_values, i);
            i = i + 1;
        };
        sum / (len as u64)
    }

    /// Simple offer: EV * round discount
    public fun calculate_offer(remaining_values: &vector<u64>, round: u64): u64 {
        let ev = expected_value(remaining_values);
        let discount = discount_bps(round);
        (ev * discount) / 10000
    }

    /// Full offer with variance + psychology
    /// seed: random bytes for variance (e.g., from VRF or game state hash)
    public fun calculate_offer_with_variance(
        remaining_values: &vector<u64>,
        round: u64,
        initial_ev: u64,
        seed: vector<u8>,
    ): u64 {
        let ev = expected_value(remaining_values);
        if (ev == 0) return 0;

        // 1. Base discount (reduced to compensate for variance)
        let base = signed_pos(base_discount_bps(round));

        // 2. Random variance (+-5-15% depending on round)
        let variance = random_variance(&seed, round);

        // 3. Context adjustment (banker psychology)
        let context = context_adjustment(ev, initial_ev, round);

        // 4. Combine and clamp to [1500, 9500] bps
        let combined = signed_add(signed_add(base, variance), context);
        let final_discount = signed_clamp(combined, 1500, 9500);

        (ev * final_discount) / 10000
    }

    /// Discount per round — 4 rounds, escalating from lowball to near-fair
    /// Round 0: 30%, Round 1: 50%, Round 2: 70%, Round 3: 85%
    public fun discount_bps(round: u64): u64 {
        if (round == 0) { 3000 }
        else if (round == 1) { 5000 }
        else if (round == 2) { 7000 }
        else if (round == 3) { 8500 }
        else { 9000 } // fallback
    }

    /// Base discount with variance compensation (slightly lower than discount_bps)
    public fun base_discount_bps(round: u64): u64 {
        if (round == 0) { 2700 }
        else if (round == 1) { 4600 }
        else if (round == 2) { 6500 }
        else if (round == 3) { 8000 }
        else { 8500 }
    }

    /// Pseudo-random variance from seed. Returns signed value in bps.
    /// Uses keccak256 for consistency with Solidity version.
    fun random_variance(seed: &vector<u8>, round: u64): SignedU64 {
        // Pack seed + round for entropy
        let input = *seed;
        // Append round as a single byte (rounds are small)
        vector::push_back(&mut input, (round as u8));
        let hash = aptos_hash::keccak256(input);

        // Extract a u64 from the first 8 bytes of the hash
        let entropy = bytes_to_u64(&hash);

        // Variance increases with round (more drama late game)
        let max_bps = if (round <= 1) { 500u64 }
            else if (round == 2) { 1000 }
            else { 1500 };

        let range = max_bps * 2;
        let raw = entropy % range;

        // raw in [0, range). Center around 0: subtract max_bps
        if (raw >= max_bps) {
            signed(raw - max_bps, false) // positive
        } else {
            signed(max_bps - raw, true)  // negative
        }
    }

    /// Banker psychology: generous when player losing, stingy when winning
    fun context_adjustment(current_ev: u64, initial_ev: u64, round: u64): SignedU64 {
        if (round < 1 || initial_ev == 0) return signed_pos(0);

        // Calculate EV change in bps: (currentEV - initialEV) * 10000 / initialEV
        // Since we can't use signed division, handle positive and negative cases separately
        if (current_ev >= initial_ev) {
            // EV rose: stingy banker
            let change_bps = ((current_ev - initial_ev) * 10000) / initial_ev;
            if (change_bps > 2000) { signed(300, true) }        // -300 bps (penalty)
            else if (change_bps > 1000) { signed(150, true) }   // -150 bps
            else { signed_pos(0) }
        } else {
            // EV dropped: generous banker
            let change_bps = ((initial_ev - current_ev) * 10000) / initial_ev;
            if (change_bps > 2000) { signed(300, false) }       // +300 bps (bonus)
            else if (change_bps > 1000) { signed(150, false) }  // +150 bps
            else { signed_pos(0) }
        }
    }

    /// Evaluate deal quality relative to EV (10000 = fair)
    public fun deal_quality(offer: u64, remaining_values: &vector<u64>): u64 {
        let ev = expected_value(remaining_values);
        if (ev == 0) return 0;
        (offer * 10000) / ev
    }

    /// Extract a u64 from the first 8 bytes of a byte vector
    fun bytes_to_u64(bytes: &vector<u8>): u64 {
        let result = 0u64;
        let i = 0;
        while (i < 8 && i < vector::length(bytes)) {
            result = (result << 8) | (*vector::borrow(bytes, i) as u64);
            i = i + 1;
        };
        result
    }

    // ── Tests ──

    #[test]
    fun test_expected_value_basic() {
        let vals = vector[1, 5, 10, 50, 100];
        // Sum = 166, len = 5, EV = 33 (integer division)
        assert!(expected_value(&vals) == 33, 0);
    }

    #[test]
    fun test_expected_value_empty() {
        let vals = vector::empty<u64>();
        assert!(expected_value(&vals) == 0, 0);
    }

    #[test]
    fun test_expected_value_single() {
        let vals = vector[42];
        assert!(expected_value(&vals) == 42, 0);
    }

    #[test]
    fun test_calculate_offer_round0() {
        let vals = vector[1, 5, 10, 50, 100];
        // EV = 33, discount = 30% (3000 bps)
        // offer = 33 * 3000 / 10000 = 9 (integer math)
        assert!(calculate_offer(&vals, 0) == 9, 0);
    }

    #[test]
    fun test_calculate_offer_round3() {
        let vals = vector[1, 5, 10, 50, 100];
        // EV = 33, discount = 85% (8500 bps)
        // offer = 33 * 8500 / 10000 = 28
        assert!(calculate_offer(&vals, 3) == 28, 0);
    }

    #[test]
    fun test_discount_bps_all_rounds() {
        assert!(discount_bps(0) == 3000, 0);
        assert!(discount_bps(1) == 5000, 0);
        assert!(discount_bps(2) == 7000, 0);
        assert!(discount_bps(3) == 8500, 0);
        assert!(discount_bps(4) == 9000, 0);
    }

    #[test]
    fun test_deal_quality() {
        let vals = vector[1, 5, 10, 50, 100];
        // EV = 33, offer = 33 → quality = 10000 (fair)
        assert!(deal_quality(33, &vals) == 10000, 0);
        // offer = 16 → quality = 4848 (underpaying)
        assert!(deal_quality(16, &vals) == 4848, 0);
    }

    #[test]
    fun test_calculate_offer_with_variance() {
        let vals = vector[1, 5, 10, 50, 100];
        let seed = b"test_seed_123";
        let offer = calculate_offer_with_variance(&vals, 2, 33, seed);
        // Should be in reasonable range: EV=33, discount ~65% +-10%
        // So roughly 33 * 0.55 to 33 * 0.75 = ~18 to ~25
        // With clamp: 33 * 0.15 to 33 * 0.95 = 4 to 31
        assert!(offer > 0 && offer <= 33, 0);
    }

    #[test]
    fun test_signed_add_same_sign() {
        let a = signed(100, false);
        let b = signed(200, false);
        let result = signed_add(a, b);
        assert!(result.value == 300 && !result.is_negative, 0);
    }

    #[test]
    fun test_signed_add_different_signs() {
        let a = signed(300, false);
        let b = signed(100, true);
        let result = signed_add(a, b);
        assert!(result.value == 200 && !result.is_negative, 0);

        // Flip: negative result
        let c = signed(100, false);
        let d = signed(300, true);
        let result2 = signed_add(c, d);
        assert!(result2.value == 200 && result2.is_negative, 0);
    }

    #[test]
    fun test_signed_clamp() {
        // Negative → clamp to min
        assert!(signed_clamp(signed(500, true), 1500, 9500) == 1500, 0);
        // Below min → clamp to min
        assert!(signed_clamp(signed(1000, false), 1500, 9500) == 1500, 0);
        // Above max → clamp to max
        assert!(signed_clamp(signed(10000, false), 1500, 9500) == 9500, 0);
        // In range → unchanged
        assert!(signed_clamp(signed(5000, false), 1500, 9500) == 5000, 0);
    }

    #[test]
    fun test_context_adjustment_ev_dropped() {
        // Initial EV = 33, current = 20 → dropped ~39% → should get +300 bonus
        let adj = context_adjustment(20, 33, 2);
        assert!(adj.value == 300 && !adj.is_negative, 0);
    }

    #[test]
    fun test_context_adjustment_ev_rose() {
        // Initial EV = 33, current = 50 → rose ~51% → should get -300 penalty
        let adj = context_adjustment(50, 33, 2);
        assert!(adj.value == 300 && adj.is_negative, 0);
    }

    #[test]
    fun test_context_adjustment_round_0() {
        // Round 0: no adjustment regardless of EV change
        let adj = context_adjustment(50, 33, 0);
        assert!(adj.value == 0, 0);
    }
}
