// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {DealOrNotConfidential} from "../src/DealOrNotConfidential.sol";
import {VRFCoordinatorV2_5Mock} from "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";
import {MockV3Aggregator} from "@chainlink/contracts/src/v0.8/tests/MockV3Aggregator.sol";

contract DealOrNotConfidentialTest is Test {
    DealOrNotConfidential public game;
    VRFCoordinatorV2_5Mock public vrfCoordinator;
    MockV3Aggregator public priceFeed;

    address public owner;
    address public player;
    address public creForwarder;

    uint256 public subscriptionId;
    bytes32 public keyHash;

    // Game phases (CRE-based — no commit-reveal)
    uint8 constant PHASE_WAITING_FOR_VRF = 0;
    uint8 constant PHASE_CREATED = 1;
    uint8 constant PHASE_ROUND = 2;
    uint8 constant PHASE_WAITING_FOR_CRE = 3;
    uint8 constant PHASE_AWAITING_OFFER = 4;
    uint8 constant PHASE_BANKER_OFFER = 5;
    uint8 constant PHASE_FINAL_ROUND = 6;
    uint8 constant PHASE_WAITING_FOR_FINAL_CRE = 7;
    uint8 constant PHASE_GAME_OVER = 8;

    function setUp() public {
        owner = address(this);
        player = makeAddr("player");
        creForwarder = makeAddr("creForwarder");

        // Deploy mock VRF coordinator
        vrfCoordinator = new VRFCoordinatorV2_5Mock(
            0.1 ether, // base fee
            1e9,       // gas price
            1e18       // wei per unit link
        );

        // Create VRF subscription
        subscriptionId = vrfCoordinator.createSubscription();
        vrfCoordinator.fundSubscription(subscriptionId, 100 ether);

        // Deploy mock price feed (ETH/USD = $2000)
        priceFeed = new MockV3Aggregator(8, 2000e8);

        // Deploy game contract (5 params — no Functions!)
        keyHash = bytes32(uint256(1));
        game = new DealOrNotConfidential(
            address(vrfCoordinator),
            subscriptionId,
            keyHash,
            address(priceFeed),
            creForwarder
        );

        // Add contract as consumer
        vrfCoordinator.addConsumer(subscriptionId, address(game));

        vm.deal(player, 1 ether);
    }

    /*//////////////////////////////////////////////////////////////
                        GAME CREATION TESTS
    //////////////////////////////////////////////////////////////*/

    function test_CreateGame() public {
        vm.prank(player);
        uint256 gameId = game.createGame();

        assertEq(gameId, 0, "First game should be ID 0");

        (
            address host,
            address gamePlayer,
            uint8 mode,
            uint8 phase,
            ,,,,,,,
        ) = game.getGameState(gameId);

        assertEq(host, player, "Host should be player");
        assertEq(gamePlayer, player, "Player should be player");
        assertEq(mode, 0, "Mode should be SinglePlayer");
        assertEq(phase, PHASE_WAITING_FOR_VRF, "Phase should be WaitingForVRF");
    }

    function test_VRFFulfillment() public {
        vm.prank(player);
        uint256 gameId = game.createGame();

        uint256 vrfRequestId = game.getVRFRequestId(gameId);
        vrfCoordinator.fulfillRandomWords(vrfRequestId, address(game));

        // Check phase changed to Created
        (,,, uint8 phase,,,,,,,,) = game.getGameState(gameId);
        assertEq(phase, PHASE_CREATED, "Phase should be Created after VRF");
    }

    /*//////////////////////////////////////////////////////////////
                        CASE PICKING TESTS
    //////////////////////////////////////////////////////////////*/

    function test_PickCase() public {
        uint256 gameId = _createGameAndFulfillVRF();

        vm.prank(player);
        game.pickCase(gameId, 2);

        (,,, uint8 phase, uint8 playerCase,,,,,,,) = game.getGameState(gameId);

        assertEq(phase, PHASE_ROUND, "Phase should be Round");
        assertEq(playerCase, 2, "Player case should be 2");
    }

    function test_PickCase_RevertIfNotCreated() public {
        vm.prank(player);
        uint256 gameId = game.createGame();

        vm.expectRevert();
        vm.prank(player);
        game.pickCase(gameId, 0);
    }

    function test_PickCase_RevertIfInvalidCase() public {
        uint256 gameId = _createGameAndFulfillVRF();

        vm.expectRevert();
        vm.prank(player);
        game.pickCase(gameId, 5);
    }

    /*//////////////////////////////////////////////////////////////
                    OPEN CASE + CRE REVEAL TESTS
    //////////////////////////////////////////////////////////////*/

    function test_OpenCase() public {
        uint256 gameId = _createGameAndPickCase();

        // Player opens case 0 — single TX, no commit-reveal!
        vm.prank(player);
        game.openCase(gameId, 0);

        (,,, uint8 phase,,,,,,,,) = game.getGameState(gameId);
        assertEq(phase, PHASE_WAITING_FOR_CRE, "Phase should be WaitingForCRE");
    }

    function test_OpenCase_RevertIfOwnCase() public {
        uint256 gameId = _createGameAndPickCase(); // Picked case 2

        vm.expectRevert();
        vm.prank(player);
        game.openCase(gameId, 2); // Can't open own case
    }

    function test_OpenCase_RevertIfAlreadyOpened() public {
        uint256 gameId = _openCaseAndFulfillCRE();

        // Case 0 already opened — can't open again
        vm.expectRevert();
        vm.prank(player);
        game.openCase(gameId, 0);
    }

    function test_FulfillCaseValue() public {
        uint256 gameId = _createGameAndPickCase();

        vm.prank(player);
        game.openCase(gameId, 0);

        // CRE fulfills with value 50 ($0.50)
        vm.prank(creForwarder);
        game.fulfillCaseValue(gameId, 0, 50);

        (,,, uint8 phase,,,,,,,
         uint256[5] memory caseValues,
         bool[5] memory opened
        ) = game.getGameState(gameId);

        assertEq(phase, PHASE_AWAITING_OFFER, "Phase should be AwaitingOffer");
        assertEq(caseValues[0], 50, "Case 0 should have value 50");
        assertTrue(opened[0], "Case 0 should be opened");
    }

    function test_FulfillCaseValue_RevertIfNotCRE() public {
        uint256 gameId = _createGameAndPickCase();

        vm.prank(player);
        game.openCase(gameId, 0);

        // Random address tries to fulfill — should revert
        vm.expectRevert();
        vm.prank(player);
        game.fulfillCaseValue(gameId, 0, 50);
    }

    function test_FulfillCaseValue_RevertIfInvalidValue() public {
        uint256 gameId = _createGameAndPickCase();

        vm.prank(player);
        game.openCase(gameId, 0);

        // CRE tries to fulfill with a value not in the pool (999)
        vm.expectRevert();
        vm.prank(creForwarder);
        game.fulfillCaseValue(gameId, 0, 999);
    }

    /*//////////////////////////////////////////////////////////////
                        BANKER OFFER TESTS
    //////////////////////////////////////////////////////////////*/

    function test_SetBankerOffer() public {
        uint256 gameId = _openCaseAndFulfillCRE();

        vm.prank(player);
        game.setBankerOffer(gameId, 25);

        (,,, uint8 phase,,,,
         uint256 bankerOffer,,,,) = game.getGameState(gameId);

        assertEq(phase, PHASE_BANKER_OFFER, "Phase should be BankerOffer");
        assertEq(bankerOffer, 25, "Banker offer should be 25 cents");
    }

    function test_AcceptDeal() public {
        uint256 gameId = _openCaseAndFulfillCRE();

        vm.prank(player);
        game.setBankerOffer(gameId, 25);

        vm.prank(player);
        game.acceptDeal(gameId);

        (,,, uint8 phase,,,,,
         uint256 finalPayout,,,) = game.getGameState(gameId);

        assertEq(phase, PHASE_GAME_OVER, "Phase should be GameOver");
        assertEq(finalPayout, 25, "Final payout should match offer");
    }

    function test_RejectDeal() public {
        uint256 gameId = _openCaseAndFulfillCRE();

        vm.prank(player);
        game.setBankerOffer(gameId, 25);

        vm.prank(player);
        game.rejectDeal(gameId);

        (,,, uint8 phase,,
         uint8 currentRound,,
         uint256 bankerOffer,,,,) = game.getGameState(gameId);

        assertEq(phase, PHASE_ROUND, "Phase should be Round");
        assertEq(currentRound, 1, "Round should increment");
        assertEq(bankerOffer, 0, "Banker offer should reset");
    }

    /*//////////////////////////////////////////////////////////////
                      FINAL ROUND TESTS
    //////////////////////////////////////////////////////////////*/

    function test_KeepCase_FinalRound() public {
        uint256 gameId = _playToFinalRound();

        (,,, uint8 phase,,,,,,,,) = game.getGameState(gameId);
        assertEq(phase, PHASE_FINAL_ROUND, "Should be in FinalRound");

        // Player keeps their case
        vm.prank(player);
        game.keepCase(gameId);

        (,,, phase,,,,,,,,) = game.getGameState(gameId);
        assertEq(phase, PHASE_WAITING_FOR_FINAL_CRE, "Should be WaitingForFinalCRE");
    }

    function test_GameSecret_Published() public {
        uint256 gameId = _openCaseAndFulfillCRE();

        // Accept deal to end game
        vm.prank(player);
        game.setBankerOffer(gameId, 25);
        vm.prank(player);
        game.acceptDeal(gameId);

        // CRE publishes the game secret
        bytes32 secret = bytes32(uint256(0xdead));
        vm.prank(creForwarder);
        game.publishGameSecret(gameId, secret);

        bytes32 publishedSecret = game.getGameSecret(gameId);
        assertEq(publishedSecret, secret, "Secret should be published");
    }

    function test_GameSecret_RevertIfNotGameOver() public {
        uint256 gameId = _createGameAndPickCase();

        vm.expectRevert();
        vm.prank(creForwarder);
        game.publishGameSecret(gameId, bytes32(uint256(0xdead)));
    }

    /*//////////////////////////////////////////////////////////////
                     FULL INTEGRATION TEST
    //////////////////////////////////////////////////////////////*/

    function test_FullGameFlow_DealAccepted() public {
        // 1. Create game
        vm.prank(player);
        uint256 gameId = game.createGame();

        // 2. Fulfill VRF
        uint256 vrfRequestId = game.getVRFRequestId(gameId);
        vrfCoordinator.fulfillRandomWords(vrfRequestId, address(game));

        // 3. Pick case
        vm.prank(player);
        game.pickCase(gameId, 2);

        // 4. Open case 0 — ONE TX, no commit-reveal!
        vm.prank(player);
        game.openCase(gameId, 0);

        // 5. CRE fulfills value (simulating enclave computation)
        vm.prank(creForwarder);
        game.fulfillCaseValue(gameId, 0, 1); // $0.01

        // 6. Banker makes offer
        vm.prank(player);
        game.setBankerOffer(gameId, 25);

        // 7. Player accepts
        vm.prank(player);
        game.acceptDeal(gameId);

        // Check final state
        (,,, uint8 phase,,,,,
         uint256 finalPayout,,,) = game.getGameState(gameId);

        assertEq(phase, PHASE_GAME_OVER, "Game should be over");
        assertEq(finalPayout, 25, "Payout should be 25 cents");

        // 8. CRE publishes secret for auditability
        bytes32 secret = bytes32(uint256(0xbeef));
        vm.prank(creForwarder);
        game.publishGameSecret(gameId, secret);

        bytes32 publishedSecret = game.getGameSecret(gameId);
        assertEq(publishedSecret, secret, "Secret should be published");
    }

    function test_CalculateBankerOffer() public {
        uint256 gameId = _createGameAndFulfillVRF();

        vm.prank(player);
        game.pickCase(gameId, 2);

        uint256 offer = game.calculateBankerOffer(gameId);

        assertTrue(offer > 0, "Offer should be positive");
        assertTrue(offer < 33, "Offer should be less than EV (33 cents avg)");
    }

    function test_ConvertCentsToWei() public {
        uint256 gameId = _createGameAndFulfillVRF();

        // 100 cents = $1.00
        // At $2000 ETH/USD, $1 = 0.0005 ETH = 5e14 wei
        uint256 expectedWei = 5e14;
        uint256 actualWei = game.centsToWei(gameId, 100);

        assertEq(actualWei, expectedWei, "Conversion should be correct");
    }

    /*//////////////////////////////////////////////////////////////
              SET BANKER OFFER WITH MESSAGE TESTS
    //////////////////////////////////////////////////////////////*/

    function test_SetBankerOfferWithMessage() public {
        uint256 gameId = _openCaseAndFulfillCRE();

        // Player (host) is auto-added as banker
        vm.prank(player);
        game.setBankerOfferWithMessage(gameId, 25, "The DON has spoken. Deal or no deal?");

        (,,, uint8 phase,,,,
         uint256 bankerOffer,,,,) = game.getGameState(gameId);

        assertEq(phase, PHASE_BANKER_OFFER, "Phase should be BankerOffer");
        assertEq(bankerOffer, 25, "Banker offer should be 25 cents");
    }

    function test_SetBankerOfferWithMessage_EmptyMessage() public {
        uint256 gameId = _openCaseAndFulfillCRE();

        vm.prank(player);
        game.setBankerOfferWithMessage(gameId, 25, "");

        (,,, uint8 phase,,,,,,,,) = game.getGameState(gameId);
        assertEq(phase, PHASE_BANKER_OFFER, "Empty message should be valid");
    }

    function test_SetBankerOfferWithMessage_MaxLength() public {
        uint256 gameId = _openCaseAndFulfillCRE();

        // Build exactly 512-byte message
        bytes memory msg512 = new bytes(512);
        for (uint256 i = 0; i < 512; i++) {
            msg512[i] = "A";
        }

        vm.prank(player);
        game.setBankerOfferWithMessage(gameId, 25, string(msg512));

        (,,, uint8 phase,,,,,,,,) = game.getGameState(gameId);
        assertEq(phase, PHASE_BANKER_OFFER, "512-byte message should be valid");
    }

    function test_SetBankerOfferWithMessage_RevertIfMessageTooLong() public {
        uint256 gameId = _openCaseAndFulfillCRE();

        // Build 513-byte message
        bytes memory msg513 = new bytes(513);
        for (uint256 i = 0; i < 513; i++) {
            msg513[i] = "A";
        }

        vm.prank(player);
        vm.expectRevert(DealOrNotConfidential.MessageTooLong.selector);
        game.setBankerOfferWithMessage(gameId, 25, string(msg513));
    }

    function test_SetBankerOfferWithMessage_RevertIfNotBanker() public {
        uint256 gameId = _openCaseAndFulfillCRE();

        address rando = makeAddr("rando");
        vm.prank(rando);
        vm.expectRevert(DealOrNotConfidential.NotAllowedBanker.selector);
        game.setBankerOfferWithMessage(gameId, 25, "Hello");
    }

    function test_SetBankerOfferWithMessage_RevertIfWrongPhase() public {
        uint256 gameId = _createGameAndPickCase();
        // Phase is Round, not AwaitingOffer

        vm.prank(player);
        vm.expectRevert(); // WrongPhase
        game.setBankerOfferWithMessage(gameId, 25, "Hello");
    }

    function test_SetBankerOfferWithMessage_RevertIfBannedBanker() public {
        uint256 gameId = _openCaseAndFulfillCRE();

        // Add then ban a banker
        address banker = makeAddr("banker");
        vm.prank(player);
        game.addBanker(gameId, banker, false, true);
        vm.prank(player);
        game.banBanker(gameId, banker);

        vm.prank(banker);
        vm.expectRevert(DealOrNotConfidential.NotAllowedBanker.selector);
        game.setBankerOfferWithMessage(gameId, 25, "Banned banker");
    }

    /*//////////////////////////////////////////////////////////////
              ON REPORT DISPATCH TESTS
    //////////////////////////////////////////////////////////////*/

    function test_OnReport_SetBankerOfferWithMessage() public {
        uint256 gameId = _openCaseAndFulfillCRE();

        // Build the report payload: selector + abi.encode(gameId, offerCents, message)
        bytes memory report = abi.encodePacked(
            game.setBankerOfferWithMessage.selector,
            abi.encode(gameId, uint256(42), "AI Banker says hello!")
        );

        vm.prank(creForwarder);
        game.onReport("", report);

        (,,, uint8 phase,,,,
         uint256 bankerOffer,,,,) = game.getGameState(gameId);

        assertEq(phase, PHASE_BANKER_OFFER, "Phase should be BankerOffer via onReport");
        assertEq(bankerOffer, 42, "Offer should be 42 via onReport");
    }

    function test_OnReport_SetBankerOfferWithMessage_MessageTooLong() public {
        uint256 gameId = _openCaseAndFulfillCRE();

        // Build 513-byte message
        bytes memory longMsg = new bytes(513);
        for (uint256 i = 0; i < 513; i++) {
            longMsg[i] = "B";
        }

        bytes memory report = abi.encodePacked(
            game.setBankerOfferWithMessage.selector,
            abi.encode(gameId, uint256(42), string(longMsg))
        );

        vm.prank(creForwarder);
        vm.expectRevert(DealOrNotConfidential.MessageTooLong.selector);
        game.onReport("", report);
    }

    /*//////////////////////////////////////////////////////////////
              JOIN GAME CROSS CHAIN TESTS
    //////////////////////////////////////////////////////////////*/

    function test_JoinGameCrossChain() public {
        uint256 gameId = _createGameAndFulfillVRF();
        address ccipBridge = makeAddr("ccipBridge");

        game.setCCIPBridge(ccipBridge);

        address crossChainPlayer = makeAddr("crossChainPlayer");
        vm.prank(ccipBridge);
        game.joinGameCrossChain(gameId, crossChainPlayer);

        (, address gamePlayer,,,,,,,,,,) = game.getGameState(gameId);
        assertEq(gamePlayer, crossChainPlayer, "Player should be cross-chain player");
    }

    function test_JoinGameCrossChain_RevertIfNotBridge() public {
        uint256 gameId = _createGameAndFulfillVRF();
        address ccipBridge = makeAddr("ccipBridge");
        game.setCCIPBridge(ccipBridge);

        vm.prank(player);
        vm.expectRevert(DealOrNotConfidential.NotCCIPBridge.selector);
        game.joinGameCrossChain(gameId, makeAddr("someone"));
    }

    function test_JoinGameCrossChain_RevertIfWrongPhase() public {
        uint256 gameId = _createGameAndPickCase(); // Phase is Round
        address ccipBridge = makeAddr("ccipBridge");
        game.setCCIPBridge(ccipBridge);

        vm.prank(ccipBridge);
        vm.expectRevert(); // WrongPhase(Created, Round)
        game.joinGameCrossChain(gameId, makeAddr("someone"));
    }

    function test_JoinGameCrossChain_RevertIfAlreadyHasPlayer() public {
        uint256 gameId = _createGameAndFulfillVRF();
        address ccipBridge = makeAddr("ccipBridge");
        game.setCCIPBridge(ccipBridge);

        // First join succeeds
        address player1 = makeAddr("player1");
        vm.prank(ccipBridge);
        game.joinGameCrossChain(gameId, player1);

        // Second join should fail
        address player2 = makeAddr("player2");
        vm.prank(ccipBridge);
        vm.expectRevert(DealOrNotConfidential.GameAlreadyHasPlayer.selector);
        game.joinGameCrossChain(gameId, player2);
    }

    function test_JoinGameCrossChain_RevertIfBridgeNotSet() public {
        uint256 gameId = _createGameAndFulfillVRF();
        // ccipBridge is address(0) by default — any non-zero address should fail

        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert(DealOrNotConfidential.NotCCIPBridge.selector);
        game.joinGameCrossChain(gameId, makeAddr("someone"));
    }

    /*//////////////////////////////////////////////////////////////
              SET CCIP BRIDGE TESTS
    //////////////////////////////////////////////////////////////*/

    function test_SetCCIPBridge() public {
        address newBridge = makeAddr("newBridge");
        game.setCCIPBridge(newBridge);
        assertEq(game.ccipBridge(), newBridge, "Bridge should be updated");
    }

    function test_SetCCIPBridge_RevertIfNotOwner() public {
        vm.prank(player);
        vm.expectRevert(); // OwnableUnauthorizedAccount
        game.setCCIPBridge(makeAddr("newBridge"));
    }

    /*//////////////////////////////////////////////////////////////
              REGRESSION: Original setBankerOffer still works
    //////////////////////////////////////////////////////////////*/

    function test_SetBankerOffer_StillWorks() public {
        uint256 gameId = _openCaseAndFulfillCRE();

        vm.prank(player);
        game.setBankerOffer(gameId, 30);

        (,,, uint8 phase,,,,
         uint256 bankerOffer,,,,) = game.getGameState(gameId);

        assertEq(phase, PHASE_BANKER_OFFER, "Original setBankerOffer should still work");
        assertEq(bankerOffer, 30, "Offer should be 30");
    }

    /*//////////////////////////////////////////////////////////////
                        HELPER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _createGameAndFulfillVRF() internal returns (uint256 gameId) {
        vm.prank(player);
        gameId = game.createGame();

        uint256 vrfRequestId = game.getVRFRequestId(gameId);
        vrfCoordinator.fulfillRandomWords(vrfRequestId, address(game));
    }

    function _createGameAndPickCase() internal returns (uint256 gameId) {
        gameId = _createGameAndFulfillVRF();

        vm.prank(player);
        game.pickCase(gameId, 2);
    }

    function _openCaseAndFulfillCRE() internal returns (uint256 gameId) {
        gameId = _createGameAndPickCase();

        // Player opens case 0 — single TX
        vm.prank(player);
        game.openCase(gameId, 0);

        // CRE fulfills with value 50 ($0.50)
        vm.prank(creForwarder);
        game.fulfillCaseValue(gameId, 0, 50);
    }

    /// @dev Play through 3 cases to reach FinalRound (1 case left + player's case)
    function _playToFinalRound() internal returns (uint256 gameId) {
        gameId = _createGameAndPickCase(); // player case = 2

        // Open case 0
        vm.prank(player);
        game.openCase(gameId, 0);
        vm.prank(creForwarder);
        game.fulfillCaseValue(gameId, 0, 1); // $0.01

        // Reject deal round 0
        vm.prank(player);
        game.setBankerOffer(gameId, 10);
        vm.prank(player);
        game.rejectDeal(gameId);

        // Open case 1
        vm.prank(player);
        game.openCase(gameId, 1);
        vm.prank(creForwarder);
        game.fulfillCaseValue(gameId, 1, 5); // $0.05

        // Reject deal round 1
        vm.prank(player);
        game.setBankerOffer(gameId, 20);
        vm.prank(player);
        game.rejectDeal(gameId);

        // Open case 3
        vm.prank(player);
        game.openCase(gameId, 3);
        vm.prank(creForwarder);
        game.fulfillCaseValue(gameId, 3, 10); // $0.10

        // Now only case 4 + player's case 2 remain → FinalRound
    }
}
