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

    /// @notice Calculate the banker's offer for a given round
    /// @param remainingValues Array of values still in play
    /// @param round Current round (0-indexed)
    /// @return offer The banker's offer amount
    function calculateOffer(uint256[] memory remainingValues, uint256 round) internal pure returns (uint256 offer) {
        uint256 ev = expectedValue(remainingValues);
        uint256 discount = bankerDiscountBps(round);
        offer = (ev * discount) / 10000;
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
