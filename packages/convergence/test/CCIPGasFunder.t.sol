// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CCIPGasFunder} from "../contracts/CCIPGasFunder.sol";
import {MockCCIPRouter} from "@chainlink/contracts/src/v0.8/ccip/test/mocks/MockRouter.sol";

contract CCIPGasFunderTest is Test {
    CCIPGasFunder public funder;
    MockCCIPRouter public ccipRouter;

    address public deployer;
    address public user;
    address public recipient;
    address public gasReceiver;

    uint64 constant BASE_SEPOLIA_SELECTOR = 10344971235874465080;

    function setUp() public {
        deployer = address(this);
        user = makeAddr("user");
        recipient = makeAddr("recipient");
        gasReceiver = makeAddr("gasReceiver");

        ccipRouter = new MockCCIPRouter();
        funder = new CCIPGasFunder(address(ccipRouter), BASE_SEPOLIA_SELECTOR);
        funder.setGasReceiver(gasReceiver);

        vm.deal(user, 10 ether);
    }

    /*//////////////////////////////////////////////////////////////
                        CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    function test_Constructor_SetsValues() public view {
        assertEq(address(funder.router()), address(ccipRouter));
        assertEq(funder.destinationChainSelector(), BASE_SEPOLIA_SELECTOR);
        assertEq(funder.owner(), deployer);
        assertEq(funder.GAS_AMOUNT(), 0.001 ether);
    }

    /*//////////////////////////////////////////////////////////////
                        SEND GAS
    //////////////////////////////////////////////////////////////*/

    function test_SendGas_RevertsIfGasReceiverNotSet() public {
        CCIPGasFunder freshFunder = new CCIPGasFunder(address(ccipRouter), BASE_SEPOLIA_SELECTOR);

        vm.deal(user, 1 ether);
        vm.prank(user);
        vm.expectRevert(CCIPGasFunder.GasReceiverNotSet.selector);
        freshFunder.sendGas{value: 0.1 ether}(recipient);
    }

    function test_SendGas_Success() public {
        // MockCCIPRouter.getFee returns 0 by default, so any value works
        vm.prank(user);
        funder.sendGas{value: 0.1 ether}(recipient);
    }

    function test_SendGas_EmitsEvent() public {
        vm.prank(user);
        vm.expectEmit(true, true, false, false);
        emit CCIPGasFunder.GasFundingSent(user, recipient, bytes32(0));
        funder.sendGas{value: 0.1 ether}(recipient);
    }

    function test_SendGas_RefundsExcess() public {
        // With mock fee = 0, all value should be refunded
        uint256 balBefore = user.balance;

        vm.prank(user);
        funder.sendGas{value: 0.5 ether}(recipient);

        uint256 balAfter = user.balance;
        assertEq(balBefore - balAfter, 0, "All ETH should be refunded when fee is 0");
    }

    function test_SendGas_RevertsWithInsufficientFee() public {
        // Set a non-zero fee on the mock
        ccipRouter.setFee(0.05 ether);

        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(CCIPGasFunder.InsufficientFee.selector, 0.01 ether, 0.05 ether));
        funder.sendGas{value: 0.01 ether}(recipient);
    }

    /*//////////////////////////////////////////////////////////////
                        ESTIMATE FEE
    //////////////////////////////////////////////////////////////*/

    function test_EstimateFee_ReturnsZeroByDefault() public view {
        uint256 fee = funder.estimateFee();
        assertEq(fee, 0, "Mock CCIP fee should be 0 by default");
    }

    function test_EstimateFee_ReturnsSetFee() public {
        ccipRouter.setFee(0.03 ether);
        uint256 fee = funder.estimateFee();
        assertEq(fee, 0.03 ether, "Should return the mock fee");
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN
    //////////////////////////////////////////////////////////////*/

    function test_SetGasReceiver_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert(CCIPGasFunder.NotOwner.selector);
        funder.setGasReceiver(makeAddr("newReceiver"));
    }

    function test_SetGasReceiver_Success() public {
        address newReceiver = makeAddr("newReceiver");
        funder.setGasReceiver(newReceiver);
        assertEq(funder.gasReceiver(), newReceiver);
    }

    function test_Withdraw_OnlyOwner() public {
        vm.deal(address(funder), 1 ether);

        vm.prank(user);
        vm.expectRevert(CCIPGasFunder.NotOwner.selector);
        funder.withdraw(user);
    }

    function test_Withdraw_RevertsIfEmpty() public {
        vm.expectRevert(CCIPGasFunder.TransferFailed.selector);
        funder.withdraw(deployer);
    }

    function test_Withdraw_Success() public {
        vm.deal(address(funder), 1 ether);

        address payoutAddr = makeAddr("payout");
        uint256 balBefore = payoutAddr.balance;

        funder.withdraw(payoutAddr);

        assertEq(payoutAddr.balance - balBefore, 1 ether);
        assertEq(address(funder).balance, 0);
    }

    /*//////////////////////////////////////////////////////////////
                        RECEIVE
    //////////////////////////////////////////////////////////////*/

    function test_ReceiveETH() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        (bool ok, ) = address(funder).call{value: 0.5 ether}("");
        assertTrue(ok);
        assertEq(address(funder).balance, 0.5 ether);
    }
}
