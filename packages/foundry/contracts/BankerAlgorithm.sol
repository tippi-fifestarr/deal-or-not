// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NUM_CASES, NUM_ROUNDS, bankerDiscountBps} from "./GameTypes.sol";

/// @title BankerAlgorithm
/// @notice Pure library for computing banker offers in Deal or No Deal
/// @dev Show-accurate: low-balls early (30% EV), approaches fair value (100% EV) in final rounds
library BankerAlgorithm {
    /// @notice Calculate the expected value of remaining cases
    /// @param remainingValues Array of values still in play (unopened cases)
    /// @return ev The expected value (sum / count)
    function expectedValue(uint256[] memory remainingValues) internal pure returns (uint256 ev) {
        uint256 len = remainingValues.length;
        if (len == 0) return 0;
        uint256 sum;
        for (uint256 i; i < len; ++i) {
            sum += remainingValues[i];
        }
        ev = sum / len;
    }

    /// @notice Calculate the banker's offer for a given round (legacy, no variance)
    /// @param remainingValues Array of values still in play
    /// @param round Current round (0-indexed)
    /// @return offer The banker's offer amount
    function calculateOffer(uint256[] memory remainingValues, uint256 round) internal pure returns (uint256 offer) {
        uint256 ev = expectedValue(remainingValues);
        uint256 discount = bankerDiscountBps(round);
        offer = (ev * discount) / 10000;
    }

    /// @notice Calculate offer with strategic variance (recommended)
    /// @param remainingValues Array of values still in play
    /// @param round Current round (0-indexed)
    /// @param initialEV The EV at game start (after prize distribution)
    /// @param randomSeed Entropy source for variance (e.g., merkle root)
    /// @return offer The banker's offer with variance applied
    function calculateOfferWithVariance(
        uint256[] memory remainingValues,
        uint256 round,
        uint256 initialEV,
        bytes32 randomSeed
    ) internal pure returns (uint256 offer) {
        uint256 ev = expectedValue(remainingValues);
        if (ev == 0) return 0;

        // 1. Base discount (reduced to compensate for variance)
        int256 baseDiscount = int256(baseDiscountBps(round));

        // 2. Random variance (±5-12% depending on round)
        int256 randomVariance = calculateRandomVariance(randomSeed, round);

        // 3. Context-aware adjustment (banker psychology)
        int256 contextAdjustment = calculateContextAdjustment(ev, initialEV, round);

        // 4. Combine and clamp
        int256 finalDiscount = baseDiscount + randomVariance + contextAdjustment;
        finalDiscount = clamp(finalDiscount, 2000, 9800); // 20% - 98%

        offer = (ev * uint256(finalDiscount)) / 10000;
    }

    /// @notice Base discount with variance compensation
    function baseDiscountBps(uint256 round) internal pure returns (uint256) {
        if (round == 0) return 2700;  // 27% (vs old 30%)
        if (round == 1) return 3700;  // 37% (vs old 40%)
        if (round == 2) return 4600;  // 46% (vs old 50%)
        if (round == 3) return 5600;  // 56% (vs old 60%)
        if (round == 4) return 6500;  // 65% (vs old 70%)
        if (round == 5) return 7500;  // 75% (vs old 80%)
        if (round == 6) return 8000;  // 80% (vs old 85%)
        if (round == 7) return 8400;  // 84% (vs old 90%)
        if (round == 8) return 8900;  // 89% (vs old 95%)
        return 9500; // Fallback
    }

    /// @notice Calculate pseudo-random variance
    function calculateRandomVariance(bytes32 randomSeed, uint256 round) internal pure returns (int256 variance) {
        // Hash seed with round for unique randomness per round
        uint256 entropy = uint256(keccak256(abi.encodePacked(randomSeed, round)));

        // Variance increases with round (more drama late game)
        uint256 maxVarianceBps;
        if (round <= 2) {
            maxVarianceBps = 500;  // ±5% early
        } else if (round <= 5) {
            maxVarianceBps = 800;  // ±8% mid
        } else {
            maxVarianceBps = 1200; // ±12% late
        }

        // Map to symmetric ±range
        uint256 range = maxVarianceBps * 2;
        uint256 rawVariance = entropy % range;
        variance = int256(rawVariance) - int256(maxVarianceBps);
    }

    /// @notice Context-aware adjustment based on game state
    function calculateContextAdjustment(
        uint256 currentEV,
        uint256 initialEV,
        uint256 round
    ) internal pure returns (int256 adjustment) {
        // Early rounds: insufficient data
        if (round < 2 || initialEV == 0) return 0;

        // Calculate EV change percentage (scaled by 10000)
        int256 evChange = int256(currentEV) - int256(initialEV);
        int256 evChangePercent = (evChange * 10000) / int256(initialEV);

        // Banker psychology: generous when player is losing, stingy when winning
        if (evChangePercent < -3000) {
            // EV dropped >30%: +3% bonus (banker smells weakness)
            adjustment = 300;
        } else if (evChangePercent < -1500) {
            // EV dropped 15-30%: +2%
            adjustment = 200;
        } else if (evChangePercent < -500) {
            // EV dropped 5-15%: +1%
            adjustment = 100;
        } else if (evChangePercent > 3000) {
            // EV rose >30%: -3% penalty (player got lucky)
            adjustment = -300;
        } else if (evChangePercent > 1500) {
            // EV rose 15-30%: -2%
            adjustment = -200;
        } else if (evChangePercent > 500) {
            // EV rose 5-15%: -1%
            adjustment = -100;
        } else {
            // EV stable: no adjustment
            adjustment = 0;
        }
    }

    /// @notice Clamp value to range
    function clamp(int256 value, int256 min, int256 max) internal pure returns (int256) {
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }

    /// @notice Get min/avg/max possible offer range (for UI)
    function getOfferRange(
        uint256[] memory remainingValues,
        uint256 round,
        uint256 initialEV
    ) internal pure returns (uint256 minOffer, uint256 avgOffer, uint256 maxOffer) {
        uint256 ev = expectedValue(remainingValues);
        if (ev == 0) return (0, 0, 0);

        // Calculate base discount
        int256 baseDiscount = int256(baseDiscountBps(round));

        // Max variance for this round
        uint256 maxVarianceBps;
        if (round <= 2) maxVarianceBps = 500;
        else if (round <= 5) maxVarianceBps = 800;
        else maxVarianceBps = 1200;

        // Max context adjustment
        int256 maxContextAdj = 300;

        // Calculate extremes
        int256 minDiscount = clamp(baseDiscount - int256(maxVarianceBps) - maxContextAdj, 2000, 9800);
        int256 maxDiscount = clamp(baseDiscount + int256(maxVarianceBps) + maxContextAdj, 2000, 9800);

        minOffer = (ev * uint256(minDiscount)) / 10000;
        avgOffer = (ev * uint256(baseDiscount)) / 10000;
        maxOffer = (ev * uint256(maxDiscount)) / 10000;
    }

    /// @notice Calculate EV and standard deviation for analysis dashboard
    /// @param remainingValues Array of values still in play
    /// @return ev Expected value
    /// @return variance Statistical variance (for computing std dev off-chain)
    function evAnalysis(uint256[] memory remainingValues) internal pure returns (uint256 ev, uint256 variance) {
        uint256 len = remainingValues.length;
        if (len == 0) return (0, 0);
        ev = expectedValue(remainingValues);
        uint256 sumSquaredDiff;
        for (uint256 i; i < len; ++i) {
            uint256 diff = remainingValues[i] > ev ? remainingValues[i] - ev : ev - remainingValues[i];
            sumSquaredDiff += diff * diff;
        }
        variance = sumSquaredDiff / len;
    }

    /// @notice Evaluate how good a deal is relative to EV
    /// @param offer The banker's offer
    /// @param remainingValues Array of values still in play
    /// @return qualityBps The deal quality in basis points (10000 = fair, >10000 = above EV)
    function dealQuality(uint256 offer, uint256[] memory remainingValues) internal pure returns (uint256 qualityBps) {
        uint256 ev = expectedValue(remainingValues);
        if (ev == 0) return 0;
        qualityBps = (offer * 10000) / ev;
    }

    /// @notice Calculate the sum of remaining values
    /// @param remainingValues Array of values still in play
    /// @return sum Total of all remaining values
    function sumValues(uint256[] memory remainingValues) internal pure returns (uint256 sum) {
        for (uint256 i; i < remainingValues.length; ++i) {
            sum += remainingValues[i];
        }
    }
}
