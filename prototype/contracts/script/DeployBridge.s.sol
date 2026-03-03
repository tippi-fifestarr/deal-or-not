// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DealOrNotBridge} from "../src/DealOrNotBridge.sol";

/// @notice Deploy DealOrNotBridge on Base Sepolia — CCIP receiver for cross-chain joins
/// @dev Run: forge script script/DeployBridge.s.sol:DeployBridge --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify
///
/// Required env vars:
///   DEAL_OR_NOT_ADDRESS — DealOrNotConfidential address on Base Sepolia
///   GATEWAY_ADDRESS     — DealOrNotGateway address on ETH Sepolia (for gateway registration)
contract DeployBridge is Script {
    // Base Sepolia CCIP Router
    address constant CCIP_ROUTER = 0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93;

    // ETH Sepolia CCIP chain selector (source chain for gateway messages)
    uint64 constant ETH_SEPOLIA_CHAIN_SELECTOR = 16015286601757825753;

    function run() external {
        address gameContract = vm.envAddress("DEAL_OR_NOT_ADDRESS");

        vm.startBroadcast();

        console.log("Deploying DealOrNotBridge on Base Sepolia...");
        console.log("CCIP Router:", CCIP_ROUTER);
        console.log("Game Contract:", gameContract);

        DealOrNotBridge bridge = new DealOrNotBridge(
            CCIP_ROUTER,
            gameContract
        );

        console.log("\n==============================================");
        console.log("DealOrNotBridge deployed at:", address(bridge));
        console.log("==============================================\n");

        // Register ETH Sepolia gateway if env var is provided
        address gatewayAddress = vm.envOr("GATEWAY_ADDRESS", address(0));
        if (gatewayAddress != address(0)) {
            bridge.setGateway(ETH_SEPOLIA_CHAIN_SELECTOR, gatewayAddress);
            console.log("Registered ETH Sepolia gateway:", gatewayAddress);
        } else {
            console.log("GATEWAY_ADDRESS not set - call bridge.setGateway() after deploying gateway");
        }

        vm.stopBroadcast();

        console.log("\nNext steps:");
        console.log("1. Call game.setCCIPBridge(bridgeAddress) on Base Sepolia");
        console.log("2. Call gateway.setHomeBridge(bridgeAddress) on ETH Sepolia");
        console.log("3. Test: player on ETH Sepolia calls gateway.enterGame(gameId)");
    }
}
