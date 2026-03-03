// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DealOrNotGateway} from "../src/DealOrNotGateway.sol";

/// @notice Deploy DealOrNotGateway on ETH Sepolia — CCIP spoke for cross-chain play
/// @dev Run: forge script script/DeployGateway.s.sol:DeployGateway --rpc-url $ETH_SEPOLIA_RPC --broadcast --verify
///
/// Required env vars:
///   HOME_BRIDGE_ADDRESS — DealOrNotBridge address on Base Sepolia (set after deploying bridge)
contract DeployGateway is Script {
    // ETH Sepolia CCIP Router
    address constant CCIP_ROUTER = 0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59;

    // ETH Sepolia ETH/USD Price Feed
    address constant ETH_USD_PRICE_FEED = 0x694AA1769357215DE4FAC081bf1f309aDC325306;

    // Base Sepolia CCIP chain selector
    uint64 constant BASE_SEPOLIA_CHAIN_SELECTOR = 10344971235874465080;

    function run() external {
        vm.startBroadcast();

        console.log("Deploying DealOrNotGateway on ETH Sepolia...");
        console.log("CCIP Router:", CCIP_ROUTER);
        console.log("Price Feed:", ETH_USD_PRICE_FEED);
        console.log("Home Chain Selector (Base Sepolia):", BASE_SEPOLIA_CHAIN_SELECTOR);

        DealOrNotGateway gateway = new DealOrNotGateway(
            CCIP_ROUTER,
            ETH_USD_PRICE_FEED,
            BASE_SEPOLIA_CHAIN_SELECTOR
        );

        console.log("\n==============================================");
        console.log("DealOrNotGateway deployed at:", address(gateway));
        console.log("==============================================\n");

        // Set home bridge if env var is provided
        address homeBridge = vm.envOr("HOME_BRIDGE_ADDRESS", address(0));
        if (homeBridge != address(0)) {
            gateway.setHomeBridge(homeBridge);
            console.log("Home bridge set to:", homeBridge);
        } else {
            console.log("HOME_BRIDGE_ADDRESS not set - call setHomeBridge() after deploying DealOrNotBridge");
        }

        vm.stopBroadcast();

        console.log("\nNext steps:");
        console.log("1. Deploy DealOrNotBridge on Base Sepolia");
        console.log("2. Call gateway.setHomeBridge(bridgeAddress)");
        console.log("3. Call bridge.setGateway(ethSepoliaSelector, gatewayAddress)");
        console.log("4. Call game.setCCIPBridge(bridgeAddress) on Base Sepolia");
    }
}
