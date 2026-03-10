/// @title game_math — Entry fee calculation + deposit validation
/// @notice Utilities for pricing game entry and validating APT deposits.
/// Ported from GameMath.sol. Uses octas (1 APT = 10^8 octas) instead of wei.
module deal_or_not::game_math {

    // ── Error Codes ──
    const E_INSUFFICIENT_DEPOSIT: u64 = 1;

    /// Validate that the sent amount covers the required amount with slippage.
    /// slippage_bps: tolerance in basis points (e.g., 500 = 5%)
    public fun validate_deposit(sent: u64, required_octas: u64, slippage_bps: u64) {
        let with_slippage = required_with_slippage(required_octas, slippage_bps);
        assert!(sent >= with_slippage, E_INSUFFICIENT_DEPOSIT);
    }

    /// Calculate required deposit with slippage included.
    public fun required_with_slippage(base_octas: u64, slippage_bps: u64): u64 {
        // Use u128 to avoid overflow on multiplication
        let base = (base_octas as u128);
        let multiplier = (10000u128 + (slippage_bps as u128));
        ((base * multiplier / 10000) as u64)
    }

    // ── Tests ──

    #[test]
    fun test_required_with_slippage_zero() {
        assert!(required_with_slippage(1000, 0) == 1000, 0);
    }

    #[test]
    fun test_required_with_slippage_5_percent() {
        // 1000 octas + 5% = 1050
        assert!(required_with_slippage(1000, 500) == 1050, 0);
    }

    #[test]
    fun test_required_with_slippage_10_percent() {
        assert!(required_with_slippage(10000, 1000) == 11000, 0);
    }

    #[test]
    fun test_validate_deposit_exact() {
        validate_deposit(1050, 1000, 500);
    }

    #[test]
    fun test_validate_deposit_over() {
        validate_deposit(2000, 1000, 500);
    }

    #[test]
    #[expected_failure(abort_code = E_INSUFFICIENT_DEPOSIT)]
    fun test_validate_deposit_insufficient() {
        validate_deposit(1049, 1000, 500);
    }
}
