// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {DealOrNotBridge} from "../src/DealOrNotBridge.sol";
import {DealOrNotConfidential} from "../src/DealOrNotConfidential.sol";
import {DealOrNotGateway} from "../src/DealOrNotGateway.sol";
import {MockCCIPRouter} from "@chainlink/contracts/src/v0.8/ccip/test/mocks/MockRouter.sol";
import {VRFCoordinatorV2_5Mock} from "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";
import {MockV3Aggregator} from "@chainlink/contracts/src/v0.8/tests/MockV3Aggregator.sol";
import {Client} from "@chainlink/contracts/src/v0.8/ccip/libraries/Client.sol";

contract DealOrNotBridgeTest is Test {
    DealOrNotBridge public bridge;
    DealOrNotConfidential public game;
    MockCCIPRouter public ccipRouter;
    VRFCoordinatorV2_5Mock public vrfCoordinator;
    MockV3Aggregator public priceFeed;

    address public owner;
    address public gateway;
    address public player;
    address public crossChainPlayer;
    address public creForwarder;

    // MockCCIPRouter hardcodes this as sourceChainSelector in ccipSend
    uint64 constant ETH_SEPOLIA_SELECTOR = 16015286601757825753;

    function setUp() public {
        owner = address(this);
        gateway = makeAddr("gateway");
        player = makeAddr("player");
        crossChainPlayer = makeAddr("crossChainPlayer");
        creForwarder = makeAddr("creForwarder");

        // Deploy mocks
        ccipRouter = new MockCCIPRouter();
        vrfCoordinator = new VRFCoordinatorV2_5Mock(0.1 ether, 1e9, 1e18);
        priceFeed = new MockV3Aggregator(8, 2000e8);

        // VRF subscription
        uint256 subId = vrfCoordinator.createSubscription();
        vrfCoordinator.fundSubscription(subId, 100 ether);

        // Deploy game contract
        game = new DealOrNotConfidential(
            address(vrfCoordinator),
            subId,
            bytes32(uint256(1)),
            address(priceFeed),
            creForwarder
        );
        vrfCoordinator.addConsumer(subId, address(game));

        // Deploy bridge
        bridge = new DealOrNotBridge(address(ccipRouter), address(game));

        // Register gateway for ETH Sepolia chain selector
        bridge.setGateway(ETH_SEPOLIA_SELECTOR, gateway);

        // Set bridge on game contract
        game.setCCIPBridge(address(bridge));

        vm.deal(player, 1 ether);
        vm.deal(crossChainPlayer, 1 ether);
    }

    /*//////////////////////////////////////////////////////////////
                    HELPER: Build CCIP message
    //////////////////////////////////////////////////////////////*/

    function _buildCCIPMessage(
        uint256 gameId,
        address _player,
        address sender
    ) internal pure returns (Client.Any2EVMMessage memory) {
        return Client.Any2EVMMessage({
            messageId: bytes32(uint256(1)),
            sourceChainSelector: ETH_SEPOLIA_SELECTOR,
            sender: abi.encode(sender),
            data: abi.encode(gameId, _player),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
    }

    function _createGameAndFulfillVRF() internal returns (uint256 gameId) {
        vm.prank(player);
        gameId = game.createGame();
        uint256 vrfRequestId = game.getVRFRequestId(gameId);
        vrfCoordinator.fulfillRandomWords(vrfRequestId, address(game));
    }

    /*//////////////////////////////////////////////////////////////
                        CCIP RECEIVE TESTS
    //////////////////////////////////////////////////////////////*/

    function test_CcipReceive_JoinsPlayer() public {
        uint256 gameId = _createGameAndFulfillVRF();

        // Simulate CCIP message delivery (only router can call ccipReceive)
        Client.Any2EVMMessage memory message = _buildCCIPMessage(gameId, crossChainPlayer, gateway);

        vm.prank(address(ccipRouter));
        bridge.ccipReceive(message);

        // Verify player was joined
        (,address gp,,,,,,,,,,) = game.getGameState(gameId);
        assertEq(gp, crossChainPlayer, "Cross-chain player should be joined");
    }

    function test_CcipReceive_UnauthorizedGateway() public {
        uint256 gameId = _createGameAndFulfillVRF();

        address fakeGateway = makeAddr("fakeGateway");
        Client.Any2EVMMessage memory message = _buildCCIPMessage(gameId, crossChainPlayer, fakeGateway);

        vm.prank(address(ccipRouter));
        vm.expectRevert(
            abi.encodeWithSelector(
                DealOrNotBridge.UnauthorizedGateway.selector,
                ETH_SEPOLIA_SELECTOR,
                fakeGateway
            )
        );
        bridge.ccipReceive(message);
    }

    function test_CcipReceive_FailedJoinEmitsEvent() public {
        uint256 gameId = _createGameAndFulfillVRF();

        // First join succeeds
        Client.Any2EVMMessage memory message1 = _buildCCIPMessage(gameId, crossChainPlayer, gateway);
        vm.prank(address(ccipRouter));
        bridge.ccipReceive(message1);

        // Second join should fail gracefully (game already has player)
        address anotherPlayer = makeAddr("anotherPlayer");
        Client.Any2EVMMessage memory message2 = _buildCCIPMessage(gameId, anotherPlayer, gateway);

        // Should NOT revert — try/catch emits CrossChainJoinFailed instead
        vm.prank(address(ccipRouter));
        bridge.ccipReceive(message2);

        // Player should still be the first one
        (,address gp2,,,,,,,,,,) = game.getGameState(gameId);
        assertEq(gp2, crossChainPlayer, "Player should not have changed");
    }

    function test_CcipReceive_OnlyRouter() public {
        uint256 gameId = _createGameAndFulfillVRF();

        Client.Any2EVMMessage memory message = _buildCCIPMessage(gameId, crossChainPlayer, gateway);

        // Non-router address tries to call ccipReceive
        vm.prank(player);
        vm.expectRevert(); // InvalidRouter from CCIPReceiver
        bridge.ccipReceive(message);
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN TESTS
    //////////////////////////////////////////////////////////////*/

    function test_SetGateway_OnlyOwner() public {
        address notOwner = makeAddr("notOwner");
        vm.prank(notOwner);
        vm.expectRevert(DealOrNotBridge.NotOwner.selector);
        bridge.setGateway(ETH_SEPOLIA_SELECTOR, makeAddr("newGateway"));
    }

    function test_RemoveGateway() public {
        bridge.removeGateway(ETH_SEPOLIA_SELECTOR);

        // Now messages from ETH Sepolia should fail
        uint256 gameId = _createGameAndFulfillVRF();
        Client.Any2EVMMessage memory message = _buildCCIPMessage(gameId, crossChainPlayer, gateway);

        vm.prank(address(ccipRouter));
        vm.expectRevert(
            abi.encodeWithSelector(
                DealOrNotBridge.UnauthorizedGateway.selector,
                ETH_SEPOLIA_SELECTOR,
                gateway
            )
        );
        bridge.ccipReceive(message);
    }

    function test_SetGameContract_OnlyOwner() public {
        address notOwner = makeAddr("notOwner");
        vm.prank(notOwner);
        vm.expectRevert(DealOrNotBridge.NotOwner.selector);
        bridge.setGameContract(makeAddr("newGame"));
    }

    /*//////////////////////////////////////////////////////////////
              FULL INTEGRATION: Gateway → Bridge → Game
    //////////////////////////////////////////////////////////////*/

    function test_FullFlow_GatewayToBridgeToGame() public {
        // Deploy gateway using the SAME MockCCIPRouter
        DealOrNotGateway gw = new DealOrNotGateway(
            address(ccipRouter),
            address(priceFeed),
            ETH_SEPOLIA_SELECTOR // Note: in local test we just need a chain selector
        );
        gw.setHomeBridge(address(bridge));

        // Register the gateway in the bridge (using the mock's hardcoded source chain selector)
        // MockCCIPRouter.ccipSend hardcodes sourceChainSelector = 16015286601757825753
        bridge.setGateway(ETH_SEPOLIA_SELECTOR, address(gw));

        // Create a game
        uint256 gameId = _createGameAndFulfillVRF();

        // Player enters from the gateway
        uint256 entryFee = gw.usdToWei(25);
        uint256 withSlippage = (entryFee * 10500) / 10000;

        vm.deal(crossChainPlayer, 1 ether);
        vm.prank(crossChainPlayer);
        gw.enterGame{value: withSlippage}(gameId);

        // The MockCCIPRouter routes locally: gateway.ccipSend → bridge.ccipReceive
        // Verify the player was joined into the game
        (,address gp3,,,,,,,,,,) = game.getGameState(gameId);
        assertEq(gp3, crossChainPlayer, "Cross-chain player should be joined via gateway");
    }
}
