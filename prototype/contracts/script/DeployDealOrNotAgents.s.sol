// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DealOrNotAgents} from "../src/DealOrNotAgents.sol";

/// @notice Minimal mock forwarder — relays onReport calls to the target contract
contract MockKeystoneForwarder {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    /// @notice Send a report to a target contract (simulates CRE forwarder)
    function writeReport(address target, bytes calldata metadata, bytes calldata report) external {
        (bool success, bytes memory ret) = target.call(
            abi.encodeWithSignature("onReport(bytes,bytes)", metadata, report)
        );
        if (!success) {
            assembly { revert(add(ret, 32), mload(ret)) }
        }
    }
}

/// @notice Deploy DealOrNotAgents with a fresh MockKeystoneForwarder
/// @dev Run: forge script script/DeployDealOrNotAgents.s.sol:DeployDealOrNotAgents --rpc-url $RPC_URL --broadcast
contract DeployDealOrNotAgents is Script {
    // Base Sepolia Chainlink Config (same as DealOrNotConfidential)
    address constant VRF_COORDINATOR = 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE;
    bytes32 constant VRF_KEY_HASH = 0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71;
    address constant ETH_USD_PRICE_FEED = 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1;
    uint256 constant VRF_SUBSCRIPTION_ID = 20136374336138753384898843390506225296052091906296406953567310616148092014984;

    // Agent Registry deployed on Base Sepolia
    address constant AGENT_REGISTRY = 0xf3B0d29416d3504c802bab4A799349746A37E788;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy fresh MockKeystoneForwarder for agent game
        console.log("1/2 Deploying MockKeystoneForwarder...");
        MockKeystoneForwarder forwarder = new MockKeystoneForwarder();
        console.log("    MockKeystoneForwarder:", address(forwarder));

        // 2. Deploy DealOrNotAgents pointing at the new forwarder
        console.log("2/2 Deploying DealOrNotAgents...");
        DealOrNotAgents agentGame = new DealOrNotAgents(
            VRF_COORDINATOR,
            VRF_SUBSCRIPTION_ID,
            VRF_KEY_HASH,
            ETH_USD_PRICE_FEED,
            address(forwarder),
            AGENT_REGISTRY
        );

        vm.stopBroadcast();

        console.log("\n==============================================");
        console.log("Deployment Summary");
        console.log("==============================================");
        console.log("MockKeystoneForwarder:", address(forwarder));
        console.log("DealOrNotAgents:      ", address(agentGame));
        console.log("AgentRegistry:        ", AGENT_REGISTRY);
        console.log("==============================================\n");

        console.log("Next steps:");
        console.log("1. Add DealOrNotAgents as VRF consumer: https://vrf.chain.link");
        console.log("2. Authorize DealOrNotAgents in AgentRegistry:");
        console.log("   cast send <REGISTRY> \"authorizeContract(address)\" <AGENT_GAME>");
        console.log("3. Point agent-gameplay-orchestrator at DealOrNotAgents + MockKeystoneForwarder");
        console.log("4. Test: createAgentGame(agentAddress) -> orchestrator -> onReport -> game completes");
    }
}
