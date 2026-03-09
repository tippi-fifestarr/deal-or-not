// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CCIPGasFunder} from "../contracts/CCIPGasFunder.sol";

/// @notice Deploy CCIPGasFunder on ETH Sepolia
/// @dev Run: forge script script/DeployCCIPGasFunder.s.sol --rpc-url $ETH_SEPOLIA_RPC --broadcast --private-key $DEPLOYER_KEY
contract DeployCCIPGasFunder is Script {
    // CCIP Router on ETH Sepolia
    address constant CCIP_ROUTER = 0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59;
    // Base Sepolia chain selector
    uint64 constant BASE_SEPOLIA_CHAIN_SELECTOR = 10344971235874465080;

    function run() external {
        vm.startBroadcast();

        CCIPGasFunder funder = new CCIPGasFunder(CCIP_ROUTER, BASE_SEPOLIA_CHAIN_SELECTOR);
        console.log("CCIPGasFunder deployed at:", address(funder));

        // Optionally set the gas receiver if provided
        address receiver = vm.envOr("GAS_RECEIVER_ADDRESS", address(0));
        if (receiver != address(0)) {
            funder.setGasReceiver(receiver);
            console.log("Gas receiver set to:", receiver);
        }

        vm.stopBroadcast();
    }
}
