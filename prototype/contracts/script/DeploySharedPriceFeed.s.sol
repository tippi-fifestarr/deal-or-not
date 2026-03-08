// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SharedPriceFeed} from "../src/SharedPriceFeed.sol";

/// @notice Deploy SharedPriceFeed — one per chain
/// @dev Run:
///   Base Sepolia: forge script script/DeploySharedPriceFeed.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast
///   ETH Sepolia:  PRICE_FEED=0x694AA1769357215DE4FAC081bf1f309aDC325306 forge script script/DeploySharedPriceFeed.s.sol --rpc-url $ETH_SEPOLIA_RPC --broadcast
contract DeploySharedPriceFeed is Script {
    // Default: Base Sepolia ETH/USD feed
    address constant BASE_SEPOLIA_ETH_USD = 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Allow overriding feed address via env var (for deploying on different chains)
        address feedAddress = vm.envOr("PRICE_FEED", BASE_SEPOLIA_ETH_USD);

        vm.startBroadcast(deployerPrivateKey);

        console.log("Deploying SharedPriceFeed...");
        console.log("Price Feed:", feedAddress);

        SharedPriceFeed sharedFeed = new SharedPriceFeed(feedAddress);

        console.log("SharedPriceFeed deployed at:", address(sharedFeed));

        vm.stopBroadcast();
    }
}
