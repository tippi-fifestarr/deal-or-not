// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

contract PredictionMarketTest is Test {
    PredictionMarket public market;

    address public admin = address(this);
    address public resolver = address(0x7E50);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public carol = address(0xCA201);

    uint256 public marketId;

    function setUp() public {
        market = new PredictionMarket();
        market.authorizeResolver(resolver);

        // Create a market
        vm.prank(resolver);
        marketId = market.createMarket(
            1,      // gameId
            1,      // agentId
            PredictionMarket.MarketType.WillWin,
            0,      // targetValue
            block.timestamp + 1 hours // lockTime
        );
    }

    // ── Market Creation ──

    function test_CreateMarket() public {
        assertEq(marketId, 1);

        PredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(m.gameId, 1);
        assertEq(m.agentId, 1);
        assertTrue(m.status == PredictionMarket.MarketStatus.Open);
        assertFalse(m.resolved);
    }

    function test_CreateMarket_Unauthorized_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.Unauthorized.selector);
        market.createMarket(2, 1, PredictionMarket.MarketType.WillWin, 0, block.timestamp + 1 hours);
    }

    function test_CreateMarket_MultipleTyoes() public {
        vm.startPrank(resolver);
        uint256 m2 = market.createMarket(1, 1, PredictionMarket.MarketType.EarningsOver, 50, block.timestamp + 1 hours);
        uint256 m3 = market.createMarket(1, 1, PredictionMarket.MarketType.WillAcceptOffer, 0, block.timestamp + 1 hours);
        uint256 m4 = market.createMarket(1, 1, PredictionMarket.MarketType.RoundPrediction, 3, block.timestamp + 1 hours);
        vm.stopPrank();

        assertEq(m2, 2);
        assertEq(m3, 3);
        assertEq(m4, 4);

        // All linked to game 1
        uint256[] memory gameMarkets = market.getGameMarkets(1);
        assertEq(gameMarkets.length, 4);
    }

    // ── Betting ──

    function test_PlaceBet_Yes() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        uint256 betId = market.placeBet{value: 0.1 ether}(marketId, true);

        assertEq(betId, 1);

        PredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(m.yesPool, 0.1 ether);
        assertEq(m.noPool, 0);
        assertEq(m.totalPool, 0.1 ether);
        assertEq(market.totalVolume(), 0.1 ether);
    }

    function test_PlaceBet_No() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        market.placeBet{value: 0.05 ether}(marketId, false);

        PredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(m.noPool, 0.05 ether);
    }

    function test_PlaceBet_TooSmall_Reverts() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.BetTooSmall.selector);
        market.placeBet{value: 0.0001 ether}(marketId, true);
    }

    function test_PlaceBet_AfterLock_Reverts() public {
        vm.warp(block.timestamp + 2 hours); // past lock time

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketLocked.selector);
        market.placeBet{value: 0.1 ether}(marketId, true);
    }

    function test_PlaceBet_ClosedMarket_Reverts() public {
        vm.prank(resolver);
        market.lockMarket(marketId);

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotOpen.selector);
        market.placeBet{value: 0.1 ether}(marketId, true);
    }

    function test_PlaceBet_MultipleBettors() public {
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        vm.prank(alice);
        market.placeBet{value: 0.3 ether}(marketId, true);  // YES
        vm.prank(bob);
        market.placeBet{value: 0.2 ether}(marketId, false); // NO

        PredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(m.totalPool, 0.5 ether);
        assertEq(m.yesPool, 0.3 ether);
        assertEq(m.noPool, 0.2 ether);
    }

    // ── Odds ──

    function test_GetMarketOdds_NoBets() public view {
        (uint256 yesOdds, uint256 noOdds) = market.getMarketOdds(marketId);
        assertEq(yesOdds, 5000); // 50/50
        assertEq(noOdds, 5000);
    }

    function test_GetMarketOdds_WithBets() public {
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        vm.prank(alice);
        market.placeBet{value: 0.75 ether}(marketId, true);
        vm.prank(bob);
        market.placeBet{value: 0.25 ether}(marketId, false);

        (uint256 yesOdds, uint256 noOdds) = market.getMarketOdds(marketId);
        assertEq(yesOdds, 7500); // 75%
        assertEq(noOdds, 2500);  // 25%
    }

    // ── Resolution ──

    function test_LockMarket() public {
        vm.prank(resolver);
        market.lockMarket(marketId);

        PredictionMarket.Market memory m = market.getMarket(marketId);
        assertTrue(m.status == PredictionMarket.MarketStatus.Locked);
    }

    function test_ResolveMarket_YesWins() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        market.placeBet{value: 0.1 ether}(marketId, true);

        vm.prank(resolver);
        market.lockMarket(marketId);

        vm.prank(resolver);
        market.resolveMarket(marketId, true);

        PredictionMarket.Market memory m = market.getMarket(marketId);
        assertTrue(m.resolved);
        assertTrue(m.outcome);
        assertTrue(m.status == PredictionMarket.MarketStatus.Resolved);
    }

    function test_ResolveMarket_Unauthorized_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.Unauthorized.selector);
        market.resolveMarket(marketId, true);
    }

    // ── Payouts ──

    function test_ClaimPayout_Winner() public {
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        // Alice bets YES (0.3), Bob bets NO (0.2)
        vm.prank(alice);
        uint256 aliceBetId = market.placeBet{value: 0.3 ether}(marketId, true);
        vm.prank(bob);
        market.placeBet{value: 0.2 ether}(marketId, false);

        // YES wins
        vm.startPrank(resolver);
        market.lockMarket(marketId);
        market.resolveMarket(marketId, true);
        vm.stopPrank();

        // Alice claims: total pool 0.5 ETH, 2% fee = 0.01 ETH, payout pool = 0.49 ETH
        // Alice is only YES bettor, gets full payout pool
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        market.claimPayout(aliceBetId);
        uint256 payout = alice.balance - balBefore;

        // 0.5 * 0.98 = 0.49 ETH (minus 2% fee)
        assertEq(payout, 0.49 ether);
    }

    function test_ClaimPayout_Loser_Reverts() public {
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        vm.prank(alice);
        market.placeBet{value: 0.1 ether}(marketId, true);
        vm.prank(bob);
        uint256 bobBetId = market.placeBet{value: 0.1 ether}(marketId, false);

        vm.startPrank(resolver);
        market.lockMarket(marketId);
        market.resolveMarket(marketId, true); // YES wins, Bob loses
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(PredictionMarket.NotWinner.selector);
        market.claimPayout(bobBetId);
    }

    function test_ClaimPayout_AlreadyClaimed_Reverts() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        uint256 betId = market.placeBet{value: 0.1 ether}(marketId, true);

        vm.startPrank(resolver);
        market.lockMarket(marketId);
        market.resolveMarket(marketId, true);
        vm.stopPrank();

        vm.prank(alice);
        market.claimPayout(betId);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.BetAlreadyClaimed.selector);
        market.claimPayout(betId);
    }

    function test_ClaimPayout_NotBettor_Reverts() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        uint256 betId = market.placeBet{value: 0.1 ether}(marketId, true);

        vm.startPrank(resolver);
        market.lockMarket(marketId);
        market.resolveMarket(marketId, true);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(PredictionMarket.Unauthorized.selector);
        market.claimPayout(betId);
    }

    function test_ClaimPayout_ProportionalSplit() public {
        vm.deal(alice, 2 ether);
        vm.deal(bob, 2 ether);
        vm.deal(carol, 2 ether);

        // Alice bets YES 0.6, Bob bets YES 0.2, Carol bets NO 0.2
        vm.prank(alice);
        uint256 aliceBet = market.placeBet{value: 0.6 ether}(marketId, true);
        vm.prank(bob);
        uint256 bobBet = market.placeBet{value: 0.2 ether}(marketId, true);
        vm.prank(carol);
        market.placeBet{value: 0.2 ether}(marketId, false);

        // Total: 1 ETH. YES pool: 0.8, NO pool: 0.2
        // YES wins. Payout pool = 1 * 0.98 = 0.98 ETH
        // Alice gets 0.6/0.8 * 0.98 = 0.735 ETH
        // Bob gets 0.2/0.8 * 0.98 = 0.245 ETH

        vm.startPrank(resolver);
        market.lockMarket(marketId);
        market.resolveMarket(marketId, true);
        vm.stopPrank();

        uint256 aliceBal = alice.balance;
        vm.prank(alice);
        market.claimPayout(aliceBet);
        assertEq(alice.balance - aliceBal, 0.735 ether);

        uint256 bobBal = bob.balance;
        vm.prank(bob);
        market.claimPayout(bobBet);
        assertEq(bob.balance - bobBal, 0.245 ether);
    }

    // ── Cancellation ──

    function test_CancelMarket_Refund() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        uint256 betId = market.placeBet{value: 0.5 ether}(marketId, true);

        vm.prank(resolver);
        market.cancelMarket(marketId);

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        market.claimPayout(betId);

        // Full refund, no fee
        assertEq(alice.balance - balBefore, 0.5 ether);
    }

    // ── Fees ──

    function test_WithdrawFees() public {
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        vm.prank(alice);
        market.placeBet{value: 0.5 ether}(marketId, true);
        vm.prank(bob);
        market.placeBet{value: 0.5 ether}(marketId, false);

        // Resolve — this calculates fees (2% of 1 ETH = 0.02 ETH)
        vm.startPrank(resolver);
        market.lockMarket(marketId);
        market.resolveMarket(marketId, true);
        vm.stopPrank();

        assertEq(market.totalFeesCollected(), 0.02 ether);

        uint256 balBefore = admin.balance;
        market.withdrawFees();
        assertEq(admin.balance - balBefore, 0.02 ether);
        assertEq(market.totalFeesCollected(), 0);
    }

    function test_WithdrawFees_ZeroFees_Reverts() public {
        vm.expectRevert(PredictionMarket.ZeroAmount.selector);
        market.withdrawFees();
    }

    function test_WithdrawFees_NotAdmin_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.Unauthorized.selector);
        market.withdrawFees();
    }

    // ── View Functions ──

    function test_GetUserBets() public {
        vm.deal(alice, 1 ether);
        vm.startPrank(alice);
        market.placeBet{value: 0.1 ether}(marketId, true);
        market.placeBet{value: 0.05 ether}(marketId, false);
        vm.stopPrank();

        uint256[] memory bets = market.getUserBets(alice);
        assertEq(bets.length, 2);
    }

    function test_GetMarketStats() public {
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        vm.prank(alice);
        market.placeBet{value: 0.6 ether}(marketId, true);
        vm.prank(bob);
        market.placeBet{value: 0.4 ether}(marketId, false);

        (uint256 totalBets, uint256 totalPool, uint256 yesPool, uint256 noPool, uint256 yesOdds, uint256 noOdds) =
            market.getMarketStats(marketId);

        assertEq(totalBets, 2);
        assertEq(totalPool, 1 ether);
        assertEq(yesPool, 0.6 ether);
        assertEq(noPool, 0.4 ether);
        assertEq(yesOdds, 6000);
        assertEq(noOdds, 4000);
    }

    function test_CalculatePotentialPayout() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        market.placeBet{value: 0.5 ether}(marketId, true);

        // If bob bets 0.5 YES on a market with 0.5 YES already:
        // newTotal = 1.0, newWinning = 1.0, fee = 0.02, payoutPool = 0.98
        // payout = 0.5 * 0.98 / 1.0 = 0.49
        uint256 potential = market.calculatePotentialPayout(marketId, true, 0.5 ether);
        assertEq(potential, 0.49 ether);
    }

    function test_CanClaimBet() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        uint256 betId = market.placeBet{value: 0.1 ether}(marketId, true);

        // Not resolved yet
        assertFalse(market.canClaimBet(betId));

        vm.startPrank(resolver);
        market.lockMarket(marketId);
        market.resolveMarket(marketId, true);
        vm.stopPrank();

        // Winner
        assertTrue(market.canClaimBet(betId));

        // After claim
        vm.prank(alice);
        market.claimPayout(betId);
        assertFalse(market.canClaimBet(betId));
    }

    // ── Admin ──

    function test_AuthorizeResolver() public {
        address newResolver = address(0x1234);
        market.authorizeResolver(newResolver);
        assertTrue(market.authorizedResolvers(newResolver));
    }

    function test_RevokeResolver() public {
        market.revokeResolver(resolver);
        assertFalse(market.authorizedResolvers(resolver));
    }

    // Needed to receive ETH from fee withdrawal
    receive() external payable {}
}
