// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DealOrNotConfidential} from "../src/DealOrNotConfidential.sol";

/// @notice Deploy DealOrNotConfidential with Chainlink VRF + CRE Confidential Compute
/// @dev Run: forge script script/DeployConfidential.s.sol:DeployConfidential --rpc-url $RPC_URL --broadcast --verify
contract DeployConfidential is Script {
    // Base Sepolia Chainlink Config
    address constant VRF_COORDINATOR = 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE;
    bytes32 constant VRF_KEY_HASH = 0x9e9e46732b32662b9adc6f3abdf6c5e61eb4a4813c6c22dbb5923968e7f69b9f; // 500 gwei
    address constant ETH_USD_PRICE_FEED = 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1;

    // User-provided subscription IDs
    uint256 constant VRF_SUBSCRIPTION_ID = 33463597817054297358581832393667208607971753497855037687300387869698162762494;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // CRE Keystone Forwarder address — the authorized CRE workflow address
        address creForwarder = vm.envAddress("CRE_FORWARDER");

        vm.startBroadcast(deployerPrivateKey);

        console.log("Deploying DealOrNotConfidential (CRE Confidential)...");
        console.log("VRF Coordinator:", VRF_COORDINATOR);
        console.log("VRF Subscription ID:", VRF_SUBSCRIPTION_ID);
        console.log("CRE Forwarder:", creForwarder);

        DealOrNotConfidential game = new DealOrNotConfidential(
            VRF_COORDINATOR,
            VRF_SUBSCRIPTION_ID,
            VRF_KEY_HASH,
            ETH_USD_PRICE_FEED,
            creForwarder
        );

        vm.stopBroadcast();

        console.log("\n==============================================");
        console.log("DealOrNotConfidential deployed at:", address(game));
        console.log("==============================================\n");

        console.log("Next steps:");
        console.log("1. Add contract as consumer to VRF subscription:");
        console.log("   https://vrf.chain.link");
        console.log("2. Deploy CRE confidential-reveal workflow:");
        console.log("   cd prototype/workflows/confidential-reveal && cre deploy");
        console.log("3. Upload game secret to Vault DON:");
        console.log("   cre secrets create secrets.yaml");
        console.log("4. Test game creation and CRE reveal flow");
    }
}
