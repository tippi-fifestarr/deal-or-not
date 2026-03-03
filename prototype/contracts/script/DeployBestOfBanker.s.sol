// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BestOfBanker} from "../src/BestOfBanker.sol";

/// @notice Deploy BestOfBanker to Base Sepolia
/// Usage:
///   cd prototype/contracts
///   forge script script/DeployBestOfBanker.s.sol:DeployBestOfBanker \
///     --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify
contract DeployBestOfBanker is Script {
    // Base Sepolia ETH/USD Chainlink Price Feed
    address constant ETH_USD_PRICE_FEED = 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1;

    function run() external {
        vm.startBroadcast();

        BestOfBanker bob = new BestOfBanker(ETH_USD_PRICE_FEED);
        console.log("BestOfBanker deployed at:", address(bob));
        console.log("Price Feed:", ETH_USD_PRICE_FEED);
        console.log("Owner:", msg.sender);

        vm.stopBroadcast();
    }
}
