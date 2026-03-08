// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentStaking} from "../src/AgentStaking.sol";
import {SeasonalLeaderboard} from "../src/SeasonalLeaderboard.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @notice Deploy remaining Agent Infrastructure (Staking, Leaderboard, Markets)
/// @dev AgentRegistry already deployed at AGENT_REGISTRY on Base Sepolia
/// @dev Run: PRIVATE_KEY=$DEPLOYER_KEY forge script script/DeployAgentInfrastructure.s.sol:DeployAgentInfrastructure --rpc-url $RPC_URL --broadcast
contract DeployAgentInfrastructure is Script {
    // Existing AgentRegistry on Base Sepolia
    address constant AGENT_REGISTRY = 0xf3B0d29416d3504c802bab4A799349746A37E788;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("\n==============================================");
        console.log("Deploying Agent Infrastructure");
        console.log("==============================================");
        console.log("Deployer:", deployer);
        console.log("Using AgentRegistry:", AGENT_REGISTRY);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy AgentStaking
        console.log("1/3 Deploying AgentStaking...");
        AgentStaking agentStaking = new AgentStaking(AGENT_REGISTRY);
        console.log("   AgentStaking deployed at:", address(agentStaking));

        // 2. Deploy SeasonalLeaderboard
        console.log("2/3 Deploying SeasonalLeaderboard...");
        SeasonalLeaderboard leaderboard = new SeasonalLeaderboard(AGENT_REGISTRY);
        console.log("   SeasonalLeaderboard deployed at:", address(leaderboard));

        // 3. Deploy PredictionMarket
        console.log("3/3 Deploying PredictionMarket...");
        PredictionMarket predictionMarket = new PredictionMarket();
        console.log("   PredictionMarket deployed at:", address(predictionMarket));

        vm.stopBroadcast();

        console.log("\n==============================================");
        console.log("Deployment Summary");
        console.log("==============================================");
        console.log("AgentRegistry (existing):", AGENT_REGISTRY);
        console.log("AgentStaking:           ", address(agentStaking));
        console.log("SeasonalLeaderboard:    ", address(leaderboard));
        console.log("PredictionMarket:       ", address(predictionMarket));
        console.log("==============================================\n");

        console.log("Post-deploy steps:");
        console.log("1. Authorize DealOrNotAgents to add rewards in AgentStaking:");
        console.log("   cast send <STAKING> \"setAuthorizedCaller(address,bool)\" <AGENTS_CONTRACT> true");
        console.log("2. Authorize game contract as recorder in SeasonalLeaderboard:");
        console.log("   cast send <LEADERBOARD> \"authorizeRecorder(address)\" <AGENTS_CONTRACT>");
        console.log("3. Start first season:");
        console.log("   cast send <LEADERBOARD> \"startSeason()\"");
    }
}
