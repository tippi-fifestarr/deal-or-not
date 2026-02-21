// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BankerAlgorithm} from "../contracts/BankerAlgorithm.sol";
import {bankerDiscountBps} from "../contracts/GameTypes.sol";

contract BankerAlgorithmTest is Test {
    using BankerAlgorithm for uint256[];

    function test_expectedValue_basic() public pure {
        uint256[] memory values = new uint256[](3);
        values[0] = 100;
        values[1] = 200;
        values[2] = 300;
        assertEq(values.expectedValue(), 200);
    }

    function test_expectedValue_empty() public pure {
        uint256[] memory values = new uint256[](0);
        assertEq(values.expectedValue(), 0);
    }

    function test_expectedValue_single() public pure {
        uint256[] memory values = new uint256[](1);
        values[0] = 1 ether;
        assertEq(values.expectedValue(), 1 ether);
    }

    function test_calculateOffer_round0_lowball() public pure {
        uint256[] memory values = new uint256[](4);
        values[0] = 1 ether;
        values[1] = 2 ether;
        values[2] = 3 ether;
        values[3] = 4 ether;
        // EV = 2.5 ether, round 0 discount = 3000 bps (30%)
        uint256 offer = values.calculateOffer(0);
        assertEq(offer, 2.5 ether * 3000 / 10000); // 0.75 ether
    }

    function test_calculateOffer_round9_fairValue() public pure {
        uint256[] memory values = new uint256[](2);
        values[0] = 1 ether;
        values[1] = 3 ether;
        // EV = 2 ether, round 9 discount = 10000 bps (100%)
        uint256 offer = values.calculateOffer(9);
        assertEq(offer, 2 ether);
    }

    function test_calculateOffer_increasesPerRound() public pure {
        uint256[] memory values = new uint256[](3);
        values[0] = 1 ether;
        values[1] = 5 ether;
        values[2] = 10 ether;

        uint256 prevOffer;
        for (uint256 round; round < 10; round++) {
            uint256 offer = values.calculateOffer(round);
            assertGe(offer, prevOffer, "Offer should increase each round");
            prevOffer = offer;
        }
    }

    function test_dealQuality() public pure {
        uint256[] memory values = new uint256[](2);
        values[0] = 1 ether;
        values[1] = 3 ether;
        // EV = 2 ether
        // Offer of 2 ether = 10000 bps (100% = fair deal)
        assertEq(BankerAlgorithm.dealQuality(2 ether, values), 10000);
        // Offer of 1 ether = 5000 bps (50% = bad deal)
        assertEq(BankerAlgorithm.dealQuality(1 ether, values), 5000);
        // Offer of 3 ether = 15000 bps (150% = great deal)
        assertEq(BankerAlgorithm.dealQuality(3 ether, values), 15000);
    }

    function test_evAnalysis() public pure {
        uint256[] memory values = new uint256[](3);
        values[0] = 100;
        values[1] = 200;
        values[2] = 300;
        (uint256 ev, uint256 variance) = values.evAnalysis();
        assertEq(ev, 200);
        // variance = ((100-200)^2 + (200-200)^2 + (300-200)^2) / 3 = (10000 + 0 + 10000) / 3 = 6666
        assertEq(variance, 6666);
    }

    function test_bankerDiscountBps_values() public pure {
        assertEq(bankerDiscountBps(0), 3000);
        assertEq(bankerDiscountBps(1), 4000);
        assertEq(bankerDiscountBps(5), 8000);
        assertEq(bankerDiscountBps(9), 10000);
        assertEq(bankerDiscountBps(10), 10000); // overflow defaults to 100%
    }
}
