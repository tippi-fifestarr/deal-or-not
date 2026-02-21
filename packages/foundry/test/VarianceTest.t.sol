// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {BankerAlgorithm} from "../contracts/BankerAlgorithm.sol";

/// @title VarianceTest
/// @notice Test the new variance-enabled banker algorithm
contract VarianceTest is Test {
    function setUp() public {}

    /// @notice Test that variance system produces different offers for different seeds
    function testVarianceProducesDifferentOffers() public {
        uint256[] memory values = new uint256[](10);
        // Sample case values (0.1 ETH each for simplicity)
        for (uint256 i = 0; i < 10; i++) {
            values[i] = 0.1 ether;
        }

        uint256 initialEV = BankerAlgorithm.expectedValue(values);
        uint256 round = 4;

        // Different seeds should produce different offers
        bytes32 seed1 = keccak256("seed1");
        bytes32 seed2 = keccak256("seed2");

        uint256 offer1 = BankerAlgorithm.calculateOfferWithVariance(values, round, initialEV, seed1);
        uint256 offer2 = BankerAlgorithm.calculateOfferWithVariance(values, round, initialEV, seed2);

        console.log("Offer 1:", offer1);
        console.log("Offer 2:", offer2);
        console.log("EV:", initialEV);

        // Offers should be different (variance working)
        assertTrue(offer1 != offer2, "Offers should differ with different seeds");

        // Both offers should be > 0
        assertTrue(offer1 > 0, "Offer 1 should be positive");
        assertTrue(offer2 > 0, "Offer 2 should be positive");
    }

    /// @notice Test that offers stay within bounds (20-98% of EV)
    function testVarianceRespectsBounds() public {
        uint256[] memory values = new uint256[](10);
        for (uint256 i = 0; i < 10; i++) {
            values[i] = 1 ether;
        }

        uint256 initialEV = BankerAlgorithm.expectedValue(values);

        // Test 100 different seeds across all rounds
        for (uint256 round = 0; round < 9; round++) {
            for (uint256 i = 0; i < 100; i++) {
                bytes32 seed = keccak256(abi.encodePacked("test", round, i));
                uint256 offer = BankerAlgorithm.calculateOfferWithVariance(values, round, initialEV, seed);

                uint256 minBound = (initialEV * 20) / 100; // 20% floor
                uint256 maxBound = (initialEV * 98) / 100; // 98% ceiling

                assertGe(offer, minBound, "Offer below 20% floor");
                assertLe(offer, maxBound, "Offer above 98% ceiling");
            }
        }
    }

    /// @notice Test context adjustment triggers correctly
    function testContextAdjustment() public {
        uint256[] memory values = new uint256[](5);
        for (uint256 i = 0; i < 5; i++) {
            values[i] = 1 ether;
        }

        uint256 initialEV = 5 ether;
        uint256 currentEV = 3 ether; // EV dropped 40%
        uint256 round = 5; // Round 5+ enables context adjustment

        bytes32 seed = keccak256("test");

        // Manually test context adjustment function
        int256 adjustment = BankerAlgorithm.calculateContextAdjustment(currentEV, initialEV, round);

        console.log("Initial EV:", initialEV);
        console.log("Current EV:", currentEV);
        console.logInt(adjustment);

        // EV dropped >30%, should get +300 bps bonus
        assertEq(adjustment, 300, "Should get +3% bonus for 40% EV drop");
    }

    /// @notice Test that average offer over many trials stays within expected range
    function testAverageOfferMaintainsHouseEdge() public {
        uint256[] memory values = new uint256[](10);
        for (uint256 i = 0; i < 10; i++) {
            values[i] = 1 ether;
        }

        uint256 initialEV = BankerAlgorithm.expectedValue(values);
        uint256 round = 4; // Mid-game

        uint256 totalOffer;
        uint256 numTrials = 1000;

        for (uint256 i = 0; i < numTrials; i++) {
            bytes32 seed = keccak256(abi.encodePacked("trial", i));
            uint256 offer = BankerAlgorithm.calculateOfferWithVariance(values, round, initialEV, seed);
            totalOffer += offer;
        }

        uint256 avgOffer = totalOffer / numTrials;
        uint256 baseExpected = (initialEV * 6500) / 10000; // 65% base for round 4

        console.log("Average offer:", avgOffer);
        console.log("Base expected:", baseExpected);
        console.log("EV:", initialEV);

        // Average should be close to base (within ±2% due to variance being centered)
        uint256 tolerance = (initialEV * 300) / 10000; // ±3%
        assertApproxEqAbs(avgOffer, baseExpected, tolerance, "Average offer should match base");
    }

    /// @notice Test offer range calculation
    function testGetOfferRange() public {
        uint256[] memory values = new uint256[](10);
        for (uint256 i = 0; i < 10; i++) {
            values[i] = 1 ether;
        }

        uint256 initialEV = BankerAlgorithm.expectedValue(values);
        uint256 round = 7;

        (uint256 minOffer, uint256 avgOffer, uint256 maxOffer) =
            BankerAlgorithm.getOfferRange(values, round, initialEV);

        console.log("Min offer:", minOffer);
        console.log("Avg offer:", avgOffer);
        console.log("Max offer:", maxOffer);

        // Sanity checks
        assertTrue(minOffer < avgOffer, "Min should be less than avg");
        assertTrue(avgOffer < maxOffer, "Avg should be less than max");
        assertTrue(maxOffer <= (initialEV * 98) / 100, "Max should not exceed 98%");
    }

    /// @notice Test that same seed produces deterministic result
    function testDeterministicForSameSeed() public {
        uint256[] memory values = new uint256[](10);
        for (uint256 i = 0; i < 10; i++) {
            values[i] = 1 ether;
        }

        uint256 initialEV = BankerAlgorithm.expectedValue(values);
        bytes32 seed = keccak256("deterministic");

        uint256 offer1 = BankerAlgorithm.calculateOfferWithVariance(values, 4, initialEV, seed);
        uint256 offer2 = BankerAlgorithm.calculateOfferWithVariance(values, 4, initialEV, seed);

        assertEq(offer1, offer2, "Same seed should produce same offer");
    }

    /// @notice Test variance increases with round
    function testVarianceIncreasesWithRound() public {
        uint256[] memory values = new uint256[](20);
        for (uint256 i = 0; i < 20; i++) {
            values[i] = 1 ether;
        }

        uint256 initialEV = BankerAlgorithm.expectedValue(values);

        // Measure variance for early vs late rounds
        uint256 earlyVariance = measureVariance(values, 1, initialEV, 100);
        uint256 lateVariance = measureVariance(values, 7, initialEV, 100);

        console.log("Early round (1) variance:", earlyVariance);
        console.log("Late round (7) variance:", lateVariance);

        assertTrue(lateVariance > earlyVariance, "Late game should have higher variance");
    }

    /// @notice Helper: measure variance across N trials
    function measureVariance(
        uint256[] memory values,
        uint256 round,
        uint256 initialEV,
        uint256 trials
    ) internal view returns (uint256 variance) {
        uint256[] memory offers = new uint256[](trials);
        uint256 sum;

        // Calculate mean
        for (uint256 i = 0; i < trials; i++) {
            bytes32 seed = keccak256(abi.encodePacked("variance", round, i));
            offers[i] = BankerAlgorithm.calculateOfferWithVariance(values, round, initialEV, seed);
            sum += offers[i];
        }
        uint256 mean = sum / trials;

        // Calculate variance
        uint256 sumSquaredDiff;
        for (uint256 i = 0; i < trials; i++) {
            uint256 diff = offers[i] > mean ? offers[i] - mean : mean - offers[i];
            sumSquaredDiff += diff * diff;
        }
        variance = sumSquaredDiff / trials;
    }
}
