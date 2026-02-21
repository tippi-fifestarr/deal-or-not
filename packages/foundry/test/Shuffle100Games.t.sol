// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {DealOrNoDeal} from "../contracts/DealOrNoDeal.sol";
import {DealOrNoDealFactory} from "../contracts/DealOrNoDealFactory.sol";
import {BriefcaseNFT} from "../contracts/BriefcaseNFT.sol";
import {ZKGameVerifier} from "../contracts/ZKGameVerifier.sol";
import {
    GameState,
    GameConfig,
    RandomnessMethod,
    NUM_CASES
} from "../contracts/GameTypes.sol";

contract MockVerifier100 {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[4] calldata)
        external
        pure
        returns (bool)
    {
        return true;
    }
}

contract Shuffle100GamesTest is Test {
    DealOrNoDealFactory public factory;
    ZKGameVerifier public zkVerifier;
    DealOrNoDeal public gameImpl;
    BriefcaseNFT public nftImpl;

    address host = makeAddr("host");
    address player1 = makeAddr("player1");
    address player2 = makeAddr("player2");
    address protocolFee = makeAddr("protocolFee");

    bytes32 constant MERKLE_ROOT = bytes32(uint256(12345));
    uint256 constant ENTRY_FEE = 0.1 ether;
    uint256 constant NUM_GAMES = 100;

    GameConfig defaultConfig;

    function setUp() public {
        MockVerifier100 mock = new MockVerifier100();
        zkVerifier = new ZKGameVerifier(address(mock));
        gameImpl = new DealOrNoDeal();
        nftImpl = new BriefcaseNFT();
        factory = new DealOrNoDealFactory(address(gameImpl), address(nftImpl), address(zkVerifier), protocolFee, 200);

        defaultConfig = GameConfig({
            entryFee: ENTRY_FEE,
            lotteryDuration: 1 hours,
            revealDuration: 30 minutes,
            turnTimeout: 1 hours,
            hostFeeBps: 500,
            protocolFeeBps: 500,
            refundBps: 5000,
            minPlayers: 2,
            randomnessMethod: RandomnessMethod.CommitReveal
        });

        vm.deal(host, 1000 ether);
        vm.deal(player1, 1000 ether);
        vm.deal(player2, 1000 ether);
    }

    function _runGame(uint256 gameNum) internal returns (DealOrNoDeal g) {
        bytes32 salt = bytes32(gameNum);

        // Use absolute timestamps to avoid optimizer caching block.timestamp
        uint256 baseTs = 10000 + gameNum * 100000;
        vm.warp(baseTs);

        vm.prank(host);
        (address gameAddr,) = factory.createGame(MERKLE_ROOT, defaultConfig, salt);
        g = DealOrNoDeal(payable(gameAddr));

        vm.prank(host);
        g.openLottery();

        bytes32 secret1 = keccak256(abi.encodePacked("s1", gameNum));
        bytes32 secret2 = keccak256(abi.encodePacked("s2", gameNum));

        vm.prank(player1);
        g.enterLottery{value: ENTRY_FEE}(keccak256(abi.encodePacked(secret1, player1)));
        vm.prank(player2);
        g.enterLottery{value: ENTRY_FEE}(keccak256(abi.encodePacked(secret2, player2)));

        // Warp past lottery end (baseTs + 1 hour + 1)
        vm.warp(baseTs + 1 hours + 1);
        g.closeLotteryEntries();

        vm.prank(player1);
        g.revealSecret(secret1);
        vm.prank(player2);
        g.revealSecret(secret2);

        // Warp past reveal end (baseTs + 1.5 hours + 2)
        vm.warp(baseTs + 1 hours + 30 minutes + 2);
        vm.roll(100 + gameNum);
        g.drawWinner();
    }

    function test_twoGames() public {
        DealOrNoDeal g1 = _runGame(0);
        console2.log("Game 0 done, maxCaseValue:", g1.maxCaseValue());
        DealOrNoDeal g2 = _runGame(1);
        console2.log("Game 1 done, maxCaseValue:", g2.maxCaseValue());
    }

    function test_100Games() public {
        // Track which index holds the max value in each game
        uint256[NUM_CASES] memory maxAtIndex; // count how many times each index holds the max
        // Track which index holds the min value in each game
        uint256[NUM_CASES] memory minAtIndex;
        // Track how many unique orderings we see (via fingerprint)
        bytes32[] memory fingerprints = new bytes32[](NUM_GAMES);

        for (uint256 i; i < NUM_GAMES; i++) {
            DealOrNoDeal g = _runGame(i);

            uint256 maxVal = g.maxCaseValue();
            uint256 minVal = type(uint256).max;

            // Read all briefcase values and find max/min indices
            uint256[NUM_CASES] memory vals;
            for (uint256 c; c < NUM_CASES; c++) {
                (uint256 v,,,) = g.briefcases(c);
                vals[c] = v;
                if (v == maxVal) maxAtIndex[c]++;
                if (v < minVal) minVal = v;
            }
            for (uint256 c; c < NUM_CASES; c++) {
                if (vals[c] == minVal) {
                    minAtIndex[c]++;
                    break; // only count first occurrence per game
                }
            }

            // Fingerprint = hash of the value ordering
            fingerprints[i] = keccak256(abi.encodePacked(vals));
        }

        // --- Report: Max value distribution ---
        console2.log("=== SHUFFLE RESULTS: 100 GAMES ===");
        console2.log("");
        console2.log("Max value (jackpot) landed at index:");
        uint256 indicesWithMax;
        for (uint256 c; c < NUM_CASES; c++) {
            if (maxAtIndex[c] > 0) {
                console2.log("  Case %d: %d times", c, maxAtIndex[c]);
                indicesWithMax++;
            }
        }
        console2.log("Spread across %d / 26 indices", indicesWithMax);

        console2.log("");
        console2.log("Min value (penny) landed at index:");
        uint256 indicesWithMin;
        for (uint256 c; c < NUM_CASES; c++) {
            if (minAtIndex[c] > 0) {
                console2.log("  Case %d: %d times", c, minAtIndex[c]);
                indicesWithMin++;
            }
        }
        console2.log("Spread across %d / 26 indices", indicesWithMin);

        // Count unique fingerprints
        uint256 uniqueOrderings;
        for (uint256 i; i < NUM_GAMES; i++) {
            bool isDuplicate;
            for (uint256 j; j < i; j++) {
                if (fingerprints[i] == fingerprints[j]) {
                    isDuplicate = true;
                    break;
                }
            }
            if (!isDuplicate) uniqueOrderings++;
        }
        console2.log("");
        console2.log("Unique orderings: %d / %d games", uniqueOrderings, NUM_GAMES);

        // --- Assertions ---
        // Max value should appear at more than 1 index (shuffle works)
        assertTrue(indicesWithMax > 1, "Max value stuck at one index -- shuffle broken");
        // Min value should appear at more than 1 index
        assertTrue(indicesWithMin > 1, "Min value stuck at one index -- shuffle broken");
        // All 100 orderings should be unique (collision probability ~0 with keccak entropy)
        assertEq(uniqueOrderings, NUM_GAMES, "Expected all unique orderings");
    }
}
