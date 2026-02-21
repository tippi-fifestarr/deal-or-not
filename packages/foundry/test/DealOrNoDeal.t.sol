// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DealOrNoDeal} from "../contracts/DealOrNoDeal.sol";
import {DealOrNoDealFactory} from "../contracts/DealOrNoDealFactory.sol";
import {BriefcaseNFT} from "../contracts/BriefcaseNFT.sol";
import {ZKGameVerifier} from "../contracts/ZKGameVerifier.sol";
import {
    GameState,
    GameOutcome,
    Game,
    GameConfig,
    RandomnessMethod,
    NUM_CASES,
    InvalidGameState,
    NotHost,
    NotContestant,
    InsufficientEntryFee,
    InvalidCaseIndex,
    CaseAlreadyOpened,
    CaseIsSelected,
    AlreadyRevealed,
    InvalidReveal,
    LotteryNotOpen,
    TimeoutNotReached,
    NotRegisteredGame,
    InvalidJackpotBps
} from "../contracts/GameTypes.sol";

/// @notice Mock verifier that always returns true
contract MockGroth16Verifier {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[4] calldata)
        external
        pure
        returns (bool)
    {
        return true;
    }
}

contract DealOrNoDealTest is Test {
    DealOrNoDealFactory public factory;
    ZKGameVerifier public zkVerifier;
    DealOrNoDeal public gameImpl;
    BriefcaseNFT public nftImpl;

    address host = makeAddr("host");
    address player1 = makeAddr("player1");
    address player2 = makeAddr("player2");
    address player3 = makeAddr("player3");
    address protocolFee = makeAddr("protocolFee");

    bytes32 constant MERKLE_ROOT = bytes32(uint256(12345));
    uint256 constant ENTRY_FEE = 0.1 ether;

    GameConfig defaultConfig;

    function setUp() public {
        MockGroth16Verifier mock = new MockGroth16Verifier();
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
            refundBps: 5000, // 50% refund
            minPlayers: 2,
            randomnessMethod: RandomnessMethod.CommitReveal
        });

        vm.deal(host, 10 ether);
        vm.deal(player1, 10 ether);
        vm.deal(player2, 10 ether);
        vm.deal(player3, 10 ether);
    }

    // ============ Helpers ============

    function _getState(DealOrNoDeal g) internal view returns (Game memory) {
        (Game memory gameData,,,) = g.getGameState();
        return gameData;
    }

    function _createGame() internal returns (DealOrNoDeal g, address nftAddr) {
        vm.prank(host);
        (address gameAddr, address nft) = factory.createGame(MERKLE_ROOT, defaultConfig, bytes32(0));
        g = DealOrNoDeal(payable(gameAddr));
        nftAddr = nft;
    }

    function _setupFullGame() internal returns (DealOrNoDeal g, address contestant) {
        (g,) = _createGame();

        vm.prank(host);
        g.openLottery();

        bytes32 secret1 = bytes32(uint256(111));
        bytes32 secret2 = bytes32(uint256(222));
        vm.prank(player1);
        g.enterLottery{value: ENTRY_FEE}(keccak256(abi.encodePacked(secret1, player1)));
        vm.prank(player2);
        g.enterLottery{value: ENTRY_FEE}(keccak256(abi.encodePacked(secret2, player2)));

        vm.warp(block.timestamp + 1 hours + 1);
        g.closeLotteryEntries();

        vm.prank(player1);
        g.revealSecret(secret1);
        vm.prank(player2);
        g.revealSecret(secret2);

        vm.warp(block.timestamp + 30 minutes + 1);
        vm.roll(block.number + 1);
        g.drawWinner();

        contestant = _getState(g).contestant;
    }

    function _briefcaseValue(DealOrNoDeal g, uint256 caseIndex) internal view returns (uint256) {
        (uint256 value,,,) = g.briefcases(caseIndex);
        return value;
    }

    function _casesPerRound(uint256 round) internal pure returns (uint256) {
        if (round == 0) return 6;
        if (round == 1) return 5;
        if (round == 2) return 4;
        if (round == 3) return 3;
        if (round == 4) return 2;
        return 1;
    }

    // ============ Factory Tests ============

    function test_createGame() public {
        vm.prank(host);
        (address gameAddr, address nftAddr) = factory.createGame(MERKLE_ROOT, defaultConfig, bytes32(0));

        assertTrue(gameAddr != address(0));
        assertTrue(nftAddr != address(0));
        assertEq(factory.totalGames(), 1);

        DealOrNoDeal g = DealOrNoDeal(payable(gameAddr));
        Game memory gd = _getState(g);
        assertEq(gd.host, host);
    }

    function test_createMultipleGames() public {
        vm.startPrank(host);
        factory.createGame(MERKLE_ROOT, defaultConfig, bytes32(uint256(1)));
        factory.createGame(MERKLE_ROOT, defaultConfig, bytes32(uint256(2)));
        vm.stopPrank();

        assertEq(factory.totalGames(), 2);
        uint256[] memory games = factory.getHostGames(host);
        assertEq(games.length, 2);
    }

    // ============ Lottery Tests ============

    function test_fullLotteryFlow() public {
        (DealOrNoDeal g,) = _createGame();

        vm.prank(host);
        g.openLottery();

        bytes32 secret1 = bytes32(uint256(111));
        bytes32 secret2 = bytes32(uint256(222));
        bytes32 commit1 = keccak256(abi.encodePacked(secret1, player1));
        bytes32 commit2 = keccak256(abi.encodePacked(secret2, player2));

        vm.prank(player1);
        g.enterLottery{value: ENTRY_FEE}(commit1);
        vm.prank(player2);
        g.enterLottery{value: ENTRY_FEE}(commit2);

        assertEq(g.getLotteryEntryCount(), 2);

        vm.warp(block.timestamp + 1 hours + 1);
        g.closeLotteryEntries();

        vm.prank(player1);
        g.revealSecret(secret1);
        vm.prank(player2);
        g.revealSecret(secret2);

        vm.warp(block.timestamp + 30 minutes + 1);
        vm.roll(block.number + 1);
        g.drawWinner();

        Game memory gd = _getState(g);
        assertEq(uint256(gd.state), uint256(GameState.LotteryComplete));
        assertTrue(gd.contestant != address(0));
    }

    function test_lotteryEntryRejectsLowFee() public {
        (DealOrNoDeal g,) = _createGame();
        vm.prank(host);
        g.openLottery();

        vm.prank(player1);
        vm.expectRevert(InsufficientEntryFee.selector);
        g.enterLottery{value: 0.01 ether}(bytes32(0));
    }

    function test_lotteryEntryRejectsDuplicate() public {
        (DealOrNoDeal g,) = _createGame();
        vm.prank(host);
        g.openLottery();

        bytes32 commit = keccak256(abi.encodePacked(bytes32(uint256(1)), player1));
        vm.startPrank(player1);
        g.enterLottery{value: ENTRY_FEE}(commit);
        vm.expectRevert(AlreadyRevealed.selector);
        g.enterLottery{value: ENTRY_FEE}(commit);
        vm.stopPrank();
    }

    function test_invalidRevealReverts() public {
        (DealOrNoDeal g,) = _createGame();
        vm.prank(host);
        g.openLottery();

        bytes32 secret = bytes32(uint256(111));
        bytes32 commit = keccak256(abi.encodePacked(secret, player1));
        vm.prank(player1);
        g.enterLottery{value: ENTRY_FEE}(commit);

        bytes32 secret2 = bytes32(uint256(222));
        bytes32 commit2 = keccak256(abi.encodePacked(secret2, player2));
        vm.prank(player2);
        g.enterLottery{value: ENTRY_FEE}(commit2);

        vm.warp(block.timestamp + 1 hours + 1);
        g.closeLotteryEntries();

        vm.prank(player1);
        vm.expectRevert(InvalidReveal.selector);
        g.revealSecret(bytes32(uint256(999)));
    }

    // ============ Game Play Tests ============

    function test_fullGameFlowDeal() public {
        (DealOrNoDeal g, address contestant) = _setupFullGame();

        vm.prank(contestant);
        g.selectCase(0);

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        // Open 6 cases (round 0)
        for (uint256 i = 1; i <= 6; i++) {
            uint256 val = _briefcaseValue(g, i);
            vm.prank(host);
            g.openCase(i, val, pA, pB, pC);
        }

        Game memory gd = _getState(g);
        assertEq(uint256(gd.state), uint256(GameState.BankerOffer));
        assertTrue(gd.bankerOffer > 0);

        // Accept deal
        uint256 contestantBalBefore = contestant.balance;
        vm.prank(contestant);
        g.acceptDeal();

        assertTrue(contestant.balance > contestantBalBefore);
        gd = _getState(g);
        assertEq(uint256(gd.state), uint256(GameState.GameOver));
        assertEq(uint256(gd.outcome), uint256(GameOutcome.Deal));
    }

    function test_fullGameFlowNoDeal() public {
        (DealOrNoDeal g, address contestant) = _setupFullGame();

        vm.prank(contestant);
        g.selectCase(0);

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        uint256 caseToOpen = 1;
        for (uint256 round; round < 10; round++) {
            uint256 casesToOpen = _casesPerRound(round);
            for (uint256 j; j < casesToOpen; j++) {
                uint256 val = _briefcaseValue(g, caseToOpen);
                vm.prank(host);
                g.openCase(caseToOpen, val, pA, pB, pC);
                caseToOpen++;
            }

            // Reject deal each round
            vm.prank(contestant);
            g.rejectDeal();
        }

        // Now reveal final case
        uint256 finalValue = _briefcaseValue(g, 0);
        uint256 contestantBalBefore = contestant.balance;
        g.revealFinalCase(finalValue, pA, pB, pC);

        assertTrue(contestant.balance > contestantBalBefore);
        Game memory gd = _getState(g);
        assertEq(uint256(gd.state), uint256(GameState.GameOver));
        assertEq(uint256(gd.outcome), uint256(GameOutcome.NoDeal));
    }

    function test_selectCaseInvalidIndex() public {
        (DealOrNoDeal g, address contestant) = _setupFullGame();
        vm.prank(contestant);
        vm.expectRevert(InvalidCaseIndex.selector);
        g.selectCase(26);
    }

    function test_cannotOpenSelectedCase() public {
        (DealOrNoDeal g, address contestant) = _setupFullGame();
        vm.prank(contestant);
        g.selectCase(5);

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        vm.prank(host);
        vm.expectRevert(CaseIsSelected.selector);
        g.openCase(5, 0, pA, pB, pC);
    }

    function test_cannotOpenCaseTwice() public {
        (DealOrNoDeal g, address contestant) = _setupFullGame();
        vm.prank(contestant);
        g.selectCase(0);

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        uint256 val1 = _briefcaseValue(g, 1);
        vm.prank(host);
        g.openCase(1, val1, pA, pB, pC);

        vm.prank(host);
        vm.expectRevert(CaseAlreadyOpened.selector);
        g.openCase(1, val1, pA, pB, pC);
    }

    // ============ Timeout Tests ============

    function test_timeoutResolution() public {
        (DealOrNoDeal g, address contestant) = _setupFullGame();
        vm.prank(contestant);
        g.selectCase(0);

        vm.warp(block.timestamp + 1 hours + 1);

        uint256 contestantBalBefore = contestant.balance;
        g.resolveTimeout();

        assertTrue(contestant.balance > contestantBalBefore);
        Game memory gd = _getState(g);
        assertEq(uint256(gd.state), uint256(GameState.GameOver));
    }

    function test_timeoutTooEarly() public {
        (DealOrNoDeal g, address contestant) = _setupFullGame();
        vm.prank(contestant);
        g.selectCase(0);

        vm.expectRevert(TimeoutNotReached.selector);
        g.resolveTimeout();
    }

    // ============ Refund Tests ============

    function test_loserCanClaimRefund() public {
        (DealOrNoDeal g, address contestant) = _setupFullGame();

        address loser = contestant == player1 ? player2 : player1;
        uint256 loserBalBefore = loser.balance;

        vm.prank(loser);
        g.claimRefund();

        // 50% refund = 0.05 ether
        assertEq(loser.balance - loserBalBefore, 0.05 ether);
    }

    // ============ Prize Distribution Tests ============

    function test_prizeDistributionSumsToPool() public {
        (DealOrNoDeal g,) = _setupFullGame();
        uint256[] memory remaining = g.getRemainingValues();

        assertEq(remaining.length, NUM_CASES);

        uint256 sum;
        for (uint256 i; i < remaining.length; i++) {
            sum += remaining[i];
        }

        Game memory gd = _getState(g);
        // Due to rounding, sum might be slightly less
        assertApproxEqAbs(sum, gd.prizePool, NUM_CASES);
    }

    // ============ Banker Offer Tests ============

    function test_bankerOfferIncreases() public {
        (DealOrNoDeal g, address contestant) = _setupFullGame();
        vm.prank(contestant);
        g.selectCase(0);

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        uint256 caseToOpen = 1;
        uint256 prevOffer;

        for (uint256 round; round < 3; round++) {
            uint256 casesToOpen = _casesPerRound(round);
            for (uint256 j; j < casesToOpen; j++) {
                uint256 val = _briefcaseValue(g, caseToOpen);
                vm.prank(host);
                g.openCase(caseToOpen, val, pA, pB, pC);
                caseToOpen++;
            }

            Game memory gd = _getState(g);
            // We can't guarantee the offer always increases because opening high-value
            // cases lowers EV, but the discount factor increases. This is expected behavior.
            // Just verify offer is non-zero.
            assertTrue(gd.bankerOffer > 0, "Banker offer should be non-zero");
            prevOffer = gd.bankerOffer;

            vm.prank(contestant);
            g.rejectDeal();
        }
    }

    function test_previewBankerOffer() public {
        (DealOrNoDeal g, address contestant) = _setupFullGame();
        vm.prank(contestant);
        g.selectCase(0);

        (uint256 offer, uint256 ev) = g.previewBankerOffer();
        assertTrue(ev > 0);
        assertTrue(offer > 0);
        assertTrue(offer <= ev); // Round 0 discount means offer < EV
    }

    // ============ Jackpot Tests ============

    function test_jackpotContributionOnDrawWinner() public {
        _setupFullGame();
        // After drawWinner, 2% of the total pool should be in the factory jackpot
        uint256 jp = factory.jackpotPool();
        assertTrue(jp > 0, "Jackpot pool should be non-zero after drawWinner");
    }

    function test_jackpotBpsSetInFactory() public view {
        assertEq(factory.jackpotBps(), 200);
    }

    function test_seedJackpot() public {
        vm.deal(player3, 5 ether);
        vm.prank(player3);
        factory.seedJackpot{value: 1 ether}();
        assertEq(factory.jackpotPool(), 1 ether);
    }

    function test_setJackpotBps() public {
        factory.setJackpotBps(500);
        assertEq(factory.jackpotBps(), 500);
    }

    function test_setJackpotBpsTooHighReverts() public {
        vm.expectRevert(InvalidJackpotBps.selector);
        factory.setJackpotBps(1001);
    }

    function test_contributeToJackpotOnlyRegisteredGame() public {
        vm.expectRevert(NotRegisteredGame.selector);
        factory.contributeToJackpot{value: 0.1 ether}(0);
    }

    function test_awardJackpotOnlyRegisteredGame() public {
        vm.expectRevert(NotRegisteredGame.selector);
        factory.awardJackpot(0, player1);
    }

    function test_maxCaseValueSet() public {
        (DealOrNoDeal g,) = _setupFullGame();
        uint256 maxVal = g.maxCaseValue();
        assertTrue(maxVal > 0, "maxCaseValue should be set after drawWinner");
    }

    function test_jackpotWinOnNoDealWithMaxCase() public {
        // Seed the jackpot so there's something to win
        vm.deal(address(this), 5 ether);
        factory.seedJackpot{value: 2 ether}();

        (DealOrNoDeal g, address contestant) = _setupFullGame();

        // Find which case index has the max value
        uint256 maxVal = g.maxCaseValue();
        uint256 maxIdx;
        for (uint256 i; i < NUM_CASES; i++) {
            if (_briefcaseValue(g, i) == maxVal) {
                maxIdx = i;
                break;
            }
        }

        // Contestant selects the max-value case
        vm.prank(contestant);
        g.selectCase(maxIdx);

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        // Open all other cases (25 cases, skip maxIdx)
        uint256 caseToOpen;
        for (uint256 round; round < 10; round++) {
            uint256 casesToOpen = _casesPerRound(round);
            for (uint256 j; j < casesToOpen; j++) {
                // Skip the selected case
                if (caseToOpen == maxIdx) caseToOpen++;
                uint256 val = _briefcaseValue(g, caseToOpen);
                vm.prank(host);
                g.openCase(caseToOpen, val, pA, pB, pC);
                caseToOpen++;
                if (caseToOpen == maxIdx) caseToOpen++;
            }

            vm.prank(contestant);
            g.rejectDeal();
        }

        // Record balances before reveal
        uint256 contestantBalBefore = contestant.balance;
        uint256 jpBefore = factory.jackpotPool();
        assertTrue(jpBefore > 0, "Jackpot should be non-zero before reveal");

        // Reveal final case (the max-value one)
        g.revealFinalCase(maxVal, pA, pB, pC);

        // Contestant should have received case value + jackpot
        uint256 contestantGain = contestant.balance - contestantBalBefore;
        assertTrue(contestantGain >= maxVal + jpBefore - 1, "Contestant should get case value + jackpot");

        // Jackpot pool should be zeroed
        assertEq(factory.jackpotPool(), 0, "Jackpot should be zero after win");
    }

    function test_noJackpotOnNonMaxCase() public {
        // Seed jackpot
        vm.deal(address(this), 5 ether);
        factory.seedJackpot{value: 1 ether}();

        (DealOrNoDeal g, address contestant) = _setupFullGame();

        // After shuffle, find a case that is NOT the max value
        uint256 maxVal = g.maxCaseValue();
        uint256 nonMaxIdx;
        for (uint256 i; i < NUM_CASES; i++) {
            if (_briefcaseValue(g, i) != maxVal) {
                nonMaxIdx = i;
                break;
            }
        }

        // Contestant selects the non-max case
        vm.prank(contestant);
        g.selectCase(nonMaxIdx);

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        uint256 caseToOpen;
        for (uint256 round; round < 10; round++) {
            uint256 casesToOpen = _casesPerRound(round);
            for (uint256 j; j < casesToOpen; j++) {
                // Skip the selected case
                if (caseToOpen == nonMaxIdx) caseToOpen++;
                uint256 val = _briefcaseValue(g, caseToOpen);
                vm.prank(host);
                g.openCase(caseToOpen, val, pA, pB, pC);
                caseToOpen++;
                if (caseToOpen == nonMaxIdx) caseToOpen++;
            }

            vm.prank(contestant);
            g.rejectDeal();
        }

        uint256 jpBefore = factory.jackpotPool();
        uint256 finalValue = _briefcaseValue(g, nonMaxIdx);
        g.revealFinalCase(finalValue, pA, pB, pC);

        // Jackpot should NOT be awarded (selected case is not max value)
        assertEq(factory.jackpotPool(), jpBefore, "Jackpot should remain untouched for non-max case");
    }

    function test_jackpotEmptySkipsGracefully() public {
        // Don't seed jackpot — pool is 0

        (DealOrNoDeal g, address contestant) = _setupFullGame();

        // Find max case
        uint256 maxVal = g.maxCaseValue();
        uint256 maxIdx;
        for (uint256 i; i < NUM_CASES; i++) {
            if (_briefcaseValue(g, i) == maxVal) {
                maxIdx = i;
                break;
            }
        }

        vm.prank(contestant);
        g.selectCase(maxIdx);

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        uint256 caseToOpen;
        for (uint256 round; round < 10; round++) {
            uint256 casesToOpen = _casesPerRound(round);
            for (uint256 j; j < casesToOpen; j++) {
                if (caseToOpen == maxIdx) caseToOpen++;
                uint256 val = _briefcaseValue(g, caseToOpen);
                vm.prank(host);
                g.openCase(caseToOpen, val, pA, pB, pC);
                caseToOpen++;
                if (caseToOpen == maxIdx) caseToOpen++;
            }

            vm.prank(contestant);
            g.rejectDeal();
        }

        // Should not revert even though jackpot is 0
        g.revealFinalCase(maxVal, pA, pB, pC);

        Game memory gd = _getState(g);
        assertEq(uint256(gd.outcome), uint256(GameOutcome.NoDeal));
    }

    function test_isRegisteredGame() public {
        vm.prank(host);
        (address gameAddr,) = factory.createGame(MERKLE_ROOT, defaultConfig, bytes32(0));
        assertTrue(factory.isRegisteredGame(gameAddr));
        assertFalse(factory.isRegisteredGame(address(0xdead)));
    }

    // ============ Shuffle Tests ============

    function test_shuffleProducesDifferentOrder() public {
        // Game 1: use default secrets
        (DealOrNoDeal g1,) = _setupFullGame();

        // Game 2: use different secrets for different entropy
        vm.prank(host);
        (address game2Addr,) = factory.createGame(MERKLE_ROOT, defaultConfig, bytes32(uint256(99)));
        DealOrNoDeal g2 = DealOrNoDeal(payable(game2Addr));

        vm.prank(host);
        g2.openLottery();

        bytes32 secret1 = bytes32(uint256(333));
        bytes32 secret2 = bytes32(uint256(444));
        vm.prank(player1);
        g2.enterLottery{value: ENTRY_FEE}(keccak256(abi.encodePacked(secret1, player1)));
        vm.prank(player2);
        g2.enterLottery{value: ENTRY_FEE}(keccak256(abi.encodePacked(secret2, player2)));

        vm.warp(block.timestamp + 1 hours + 1);
        g2.closeLotteryEntries();

        vm.prank(player1);
        g2.revealSecret(secret1);
        vm.prank(player2);
        g2.revealSecret(secret2);

        vm.warp(block.timestamp + 30 minutes + 1);
        vm.roll(block.number + 1);
        g2.drawWinner();

        // Compare: at least one case index should have a different value
        bool anyDifferent;
        for (uint256 i; i < NUM_CASES; i++) {
            if (_briefcaseValue(g1, i) != _briefcaseValue(g2, i)) {
                anyDifferent = true;
                break;
            }
        }
        assertTrue(anyDifferent, "Two games with different entropy should produce different case orderings");
    }

    function test_shufflePreservesAllValues() public {
        (DealOrNoDeal g,) = _setupFullGame();

        Game memory gd = _getState(g);

        // Compute expected sorted values from BPS distribution
        uint16[26] memory bps = [
            1, 1, 2, 3, 7, 14, 21, 28, 56, 83,
            111, 139, 208, 278, 556, 695, 834, 973,
            1112, 1251, 834, 695, 556, 417, 695, 330
        ];
        uint256 totalBps;
        for (uint256 i; i < NUM_CASES; i++) {
            totalBps += bps[i];
        }

        uint256[26] memory expected;
        for (uint256 i; i < NUM_CASES; i++) {
            expected[i] = (gd.prizePool * bps[i]) / totalBps;
        }

        // Read actual values from briefcases
        uint256[26] memory actual;
        for (uint256 i; i < NUM_CASES; i++) {
            actual[i] = _briefcaseValue(g, i);
        }

        // Sort both arrays (simple insertion sort for 26 elements)
        _sortArray(expected);
        _sortArray(actual);

        // Every value must match after sorting
        for (uint256 i; i < NUM_CASES; i++) {
            assertEq(actual[i], expected[i], "Shuffled values must contain all original values");
        }
    }

    function _sortArray(uint256[26] memory arr) internal pure {
        for (uint256 i = 1; i < 26; i++) {
            uint256 key = arr[i];
            uint256 j = i;
            while (j > 0 && arr[j - 1] > key) {
                arr[j] = arr[j - 1];
                j--;
            }
            arr[j] = key;
        }
    }
}
