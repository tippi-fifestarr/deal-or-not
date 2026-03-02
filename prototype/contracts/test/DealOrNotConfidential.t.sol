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
    address public functionsRouter;

    uint256 public subscriptionId;
    bytes32 public keyHash;
    uint64 public functionsSubscriptionId = 1;
    bytes32 public donId = 0x66756e2d626173652d7365706f6c69612d310000000000000000000000000000;

    // Game phases
    uint8 constant PHASE_WAITING_FOR_VRF = 0;
    uint8 constant PHASE_CREATED = 1;
    uint8 constant PHASE_ROUND = 2;
    uint8 constant PHASE_WAITING_FOR_REVEAL = 3;
    uint8 constant PHASE_REQUESTING_VALUE = 4;
    uint8 constant PHASE_AWAITING_OFFER = 5;
    uint8 constant PHASE_BANKER_OFFER = 6;

    function setUp() public {
        owner = address(this);
        player = makeAddr("player");
        functionsRouter = makeAddr("functionsRouter");

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

        // Deploy game contract
        keyHash = bytes32(uint256(1));
        game = new DealOrNotConfidential(
            address(vrfCoordinator),
            subscriptionId,
            keyHash,
            address(priceFeed),
            functionsRouter,
            functionsSubscriptionId,
            donId
        );

        // Add contract as consumer
        vrfCoordinator.addConsumer(subscriptionId, address(game));

        // Set Functions source code (mock)
        string memory mockSource = "return Functions.encodeUint256(50);";
        game.setFunctionsSource(mockSource);

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
            ,,,,,,,,
        ) = game.getGameState(gameId);

        assertEq(host, player, "Host should be player");
        assertEq(gamePlayer, player, "Player should be player");
        assertEq(mode, 0, "Mode should be SinglePlayer");
        assertEq(phase, PHASE_WAITING_FOR_VRF, "Phase should be WaitingForVRF");
    }

    function test_VRFFulfillment() public {
        vm.prank(player);
        uint256 gameId = game.createGame();

        // Get VRF request ID
        uint256 vrfRequestId = game.getVRFRequestId(gameId);

        // Fulfill VRF request
        vrfCoordinator.fulfillRandomWords(vrfRequestId, address(game));

        // Check phase changed to Created
        (,,, uint8 phase,,,,,,,,,) = game.getGameState(gameId);
        assertEq(phase, PHASE_CREATED, "Phase should be Created after VRF");
    }

    /*//////////////////////////////////////////////////////////////
                            CASE PICKING TESTS
    //////////////////////////////////////////////////////////////*/

    function test_PickCase() public {
        uint256 gameId = _createGameAndFulfillVRF();

        vm.prank(player);
        game.pickCase(gameId, 2);

        (,,,uint8 phase, uint8 playerCase,,,,,,,,) = game.getGameState(gameId);

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
        game.pickCase(gameId, 5); // Only 0-4 valid
    }

    /*//////////////////////////////////////////////////////////////
                         COMMIT-REVEAL TESTS
    //////////////////////////////////////////////////////////////*/

    function test_CommitCase() public {
        uint256 gameId = _createGameAndPickCase();

        uint8 caseIndex = 0;
        uint256 salt = 12345;
        uint256 commitHash = uint256(keccak256(abi.encodePacked(caseIndex, salt)));

        vm.prank(player);
        game.commitCase(gameId, commitHash);

        (,,,uint8 phase,,,,,,, uint256 commitBlock,,) = game.getGameState(gameId);

        assertEq(phase, PHASE_WAITING_FOR_REVEAL, "Phase should be WaitingForReveal");
        assertEq(commitBlock, block.number, "Commit block should be current block");
    }

    function test_RevealCase_SendsFunctionsRequest() public {
        uint256 gameId = _createGameAndPickCase();

        uint8 caseIndex = 0;
        uint256 salt = 12345;
        uint256 commitHash = uint256(keccak256(abi.encodePacked(caseIndex, salt)));

        vm.prank(player);
        game.commitCase(gameId, commitHash);

        // Roll forward 1 block
        vm.roll(block.number + 1);

        // Reveal should trigger Functions request
        vm.prank(player);
        bytes32 requestId = game.revealCase(gameId, caseIndex, salt);

        (,,,uint8 phase,,,,,,,,) = game.getGameState(gameId);

        assertEq(phase, PHASE_REQUESTING_VALUE, "Phase should be RequestingValue");
        assertTrue(requestId != bytes32(0), "Request ID should be non-zero");
    }

    function test_RevealCase_RevertIfTooEarly() public {
        uint256 gameId = _createGameAndPickCase();

        uint8 caseIndex = 0;
        uint256 salt = 12345;
        uint256 commitHash = uint256(keccak256(abi.encodePacked(caseIndex, salt)));

        vm.prank(player);
        game.commitCase(gameId, commitHash);

        // Try to reveal in same block
        vm.expectRevert();
        vm.prank(player);
        game.revealCase(gameId, caseIndex, salt);
    }

    function test_RevealCase_RevertIfWrongSalt() public {
        uint256 gameId = _createGameAndPickCase();

        uint8 caseIndex = 0;
        uint256 salt = 12345;
        uint256 commitHash = uint256(keccak256(abi.encodePacked(caseIndex, salt)));

        vm.prank(player);
        game.commitCase(gameId, commitHash);

        vm.roll(block.number + 1);

        // Wrong salt
        vm.expectRevert();
        vm.prank(player);
        game.revealCase(gameId, caseIndex, 99999);
    }

    function test_RevealCase_RevertIfPlayerCase() public {
        uint256 gameId = _createGameAndPickCase(); // Picked case 2

        uint8 caseIndex = 2; // Try to open player's own case
        uint256 salt = 12345;
        uint256 commitHash = uint256(keccak256(abi.encodePacked(caseIndex, salt)));

        vm.prank(player);
        game.commitCase(gameId, commitHash);

        vm.roll(block.number + 1);

        vm.expectRevert();
        vm.prank(player);
        game.revealCase(gameId, caseIndex, salt);
    }

    /*//////////////////////////////////////////////////////////////
                      FUNCTIONS CALLBACK TESTS
    //////////////////////////////////////////////////////////////*/

    function test_FulfillRequest_AssignsCaseValue() public {
        uint256 gameId = _createAndCommitCase();

        // Simulate Functions callback
        uint256 caseValue = 50; // $0.50 in cents
        bytes memory response = abi.encode(caseValue);
        bytes memory err = "";

        // Get request ID
        bytes32 requestId = game.getFunctionsRequestId(gameId);

        // Call fulfillRequest as Functions router
        vm.prank(functionsRouter);
        game.testFulfillRequest(requestId, response, err);

        // Check case value assigned
        (,,,uint8 phase,,,,,,, uint256 commitBlock, uint256[5] memory caseValues, bool[5] memory opened) = game.getGameState(gameId);

        assertEq(phase, PHASE_AWAITING_OFFER, "Phase should be AwaitingOffer");
        assertEq(caseValues[0], 50, "Case 0 should have value 50");
        assertTrue(opened[0], "Case 0 should be opened");
    }

    function test_FulfillRequest_EmitsCaseCollapsed() public {
        uint256 gameId = _createAndCommitCase();

        uint256 caseValue = 50;
        bytes memory response = abi.encode(caseValue);
        bytes memory err = "";

        bytes32 requestId = game.getFunctionsRequestId(gameId);

        vm.expectEmit(true, true, true, true);
        emit DealOrNotConfidential.CaseCollapsed(gameId, 0, 50);

        vm.prank(functionsRouter);
        game.testFulfillRequest(requestId, response, err);
    }

    /*//////////////////////////////////////////////////////////////
                         BANKER OFFER TESTS
    //////////////////////////////////////////////////////////////*/

    function test_SetBankerOffer() public {
        uint256 gameId = _revealCaseAndGetOffer();

        vm.prank(player); // Player is allowed banker (auto-added in createGame)
        game.setBankerOffer(gameId, 25); // Offer $0.25

        (,,,uint8 phase,, uint256 bankerOffer,,,,,,,) = game.getGameState(gameId);

        assertEq(phase, PHASE_BANKER_OFFER, "Phase should be BankerOffer");
        assertEq(bankerOffer, 25, "Banker offer should be 25 cents");
    }

    function test_AcceptDeal() public {
        uint256 gameId = _revealCaseAndGetOffer();

        vm.prank(player);
        game.setBankerOffer(gameId, 25);

        vm.prank(player);
        game.acceptDeal(gameId);

        (,,,uint8 phase,,, uint256 finalPayout,,,,,,) = game.getGameState(gameId);

        assertEq(phase, 10, "Phase should be GameOver");
        assertEq(finalPayout, 25, "Final payout should match offer");
    }

    function test_RejectDeal() public {
        uint256 gameId = _revealCaseAndGetOffer();

        vm.prank(player);
        game.setBankerOffer(gameId, 25);

        vm.prank(player);
        game.rejectDeal(gameId);

        (,,,uint8 phase, uint8 currentRound, uint256 bankerOffer,,,,,,) = game.getGameState(gameId);

        assertEq(phase, PHASE_ROUND, "Phase should be Round");
        assertEq(currentRound, 1, "Round should increment");
        assertEq(bankerOffer, 0, "Banker offer should reset");
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
        game.pickCase(gameId, 2); // Pick case 2
    }

    function _createAndCommitCase() internal returns (uint256 gameId) {
        gameId = _createGameAndPickCase();

        uint8 caseIndex = 0;
        uint256 salt = 12345;
        uint256 commitHash = uint256(keccak256(abi.encodePacked(caseIndex, salt)));

        vm.prank(player);
        game.commitCase(gameId, commitHash);

        vm.roll(block.number + 1);

        vm.prank(player);
        game.revealCase(gameId, caseIndex, salt);
    }

    function _revealCaseAndGetOffer() internal returns (uint256 gameId) {
        gameId = _createAndCommitCase();

        // Fulfill Functions request
        uint256 caseValue = 50;
        bytes memory response = abi.encode(caseValue);
        bytes memory err = "";

        bytes32 requestId = game.getFunctionsRequestId(gameId);

        vm.prank(functionsRouter);
        game.testFulfillRequest(requestId, response, err);
    }

    /*//////////////////////////////////////////////////////////////
                          INTEGRATION TESTS
    //////////////////////////////////////////////////////////////*/

    function test_FullGameFlow() public {
        // 1. Create game
        vm.prank(player);
        uint256 gameId = game.createGame();

        // 2. Fulfill VRF
        uint256 vrfRequestId = game.getVRFRequestId(gameId);
        vrfCoordinator.fulfillRandomWords(vrfRequestId, address(game));

        // 3. Pick case
        vm.prank(player);
        game.pickCase(gameId, 2);

        // 4. Open case 0
        uint256 salt = 12345;
        uint256 commitHash = uint256(keccak256(abi.encodePacked(uint8(0), salt)));

        vm.prank(player);
        game.commitCase(gameId, commitHash);

        vm.roll(block.number + 1);

        vm.prank(player);
        game.revealCase(gameId, 0, salt);

        // 5. Fulfill Functions
        bytes32 requestId = game.getFunctionsRequestId(gameId);
        vm.prank(functionsRouter);
        game.fulfillRequest(requestId, abi.encode(uint256(1)), "");

        // 6. Banker makes offer
        vm.prank(player);
        game.setBankerOffer(gameId, 25);

        // 7. Player accepts
        vm.prank(player);
        game.acceptDeal(gameId);

        // Check final state
        (,,,uint8 phase,,, uint256 finalPayout,,,,,,) = game.getGameState(gameId);

        assertEq(phase, 10, "Game should be over");
        assertEq(finalPayout, 25, "Payout should be 25 cents");
    }

    function test_CalculateBankerOffer() public {
        uint256 gameId = _createGameAndFulfillVRF();

        vm.prank(player);
        game.pickCase(gameId, 2);

        // Get initial offer (all values available)
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
}
