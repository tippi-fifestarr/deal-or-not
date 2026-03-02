// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DealOrNotConfidential} from "../src/DealOrNotConfidential.sol";

/// @notice Deploy DealOrNotConfidential with Chainlink VRF + Functions
/// @dev Run: forge script script/DeployConfidential.s.sol:DeployConfidential --rpc-url $RPC_URL --broadcast --verify
contract DeployConfidential is Script {
    // Base Sepolia Chainlink Config
    address constant VRF_COORDINATOR = 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE;
    bytes32 constant VRF_KEY_HASH = 0x9e9e46732b32662b9adc6f3abdf6c5e61eb4a4813c6c22dbb5923968e7f69b9f; // 500 gwei
    address constant ETH_USD_PRICE_FEED = 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1;
    address constant FUNCTIONS_ROUTER = 0xf9B8fc078197181C841c296C876945aaa425B278;
    bytes32 constant DON_ID = 0x66756e2d626173652d7365706f6c69612d310000000000000000000000000000; // "fun-base-sepolia-1"

    // User-provided subscription IDs
    uint256 constant VRF_SUBSCRIPTION_ID = 33463597817054297358581832393667208607971753497855037687300387869698162762494;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Get Functions subscription ID from env (must be created manually)
        uint64 functionsSubscriptionId = uint64(vm.envUint("FUNCTIONS_SUBSCRIPTION_ID"));

        vm.startBroadcast(deployerPrivateKey);

        console.log("Deploying DealOrNotConfidential...");
        console.log("VRF Coordinator:", VRF_COORDINATOR);
        console.log("VRF Subscription ID:", VRF_SUBSCRIPTION_ID);
        console.log("Functions Router:", FUNCTIONS_ROUTER);
        console.log("Functions Subscription ID:", functionsSubscriptionId);

        DealOrNotConfidential game = new DealOrNotConfidential(
            VRF_COORDINATOR,
            VRF_SUBSCRIPTION_ID,
            VRF_KEY_HASH,
            ETH_USD_PRICE_FEED,
            FUNCTIONS_ROUTER,
            functionsSubscriptionId,
            DON_ID
        );

        vm.stopBroadcast();

        console.log("\n==============================================");
        console.log("DealOrNotConfidential deployed at:", address(game));
        console.log("==============================================\n");

        console.log("Next steps:");
        console.log("1. Add contract as consumer to VRF subscription:");
        console.log("   https://vrf.chain.link");
        console.log("2. Add contract as consumer to Functions subscription:");
        console.log("   https://functions.chain.link");
        console.log("3. Set Functions source code:");
        console.log("   cd prototype/functions && node set-source.js --contract", address(game));
        console.log("4. Upload encrypted secrets:");
        console.log("   node upload-secrets.js --gameId 0");
        console.log("5. Test game creation and reveal flow");
    }
}
