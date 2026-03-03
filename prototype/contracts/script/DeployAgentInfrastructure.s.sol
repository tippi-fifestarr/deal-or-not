// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {AgentStaking} from "../src/AgentStaking.sol";
import {SeasonalLeaderboard} from "../src/SeasonalLeaderboard.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @notice Deploy Agent Infrastructure for Deal or NOT
/// @dev Deploys AgentRegistry, AgentStaking, SeasonalLeaderboard, PredictionMarket
/// @dev Run: forge script script/DeployAgentInfrastructure.s.sol:DeployAgentInfrastructure --rpc-url $RPC_URL --broadcast --verify
contract DeployAgentInfrastructure is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("\n==============================================");
        console.log("Deploying Agent Infrastructure");
        console.log("==============================================");
        console.log("Deployer:", deployer);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy AgentRegistry
        console.log("1/4 Deploying AgentRegistry...");
        AgentRegistry agentRegistry = new AgentRegistry();
        console.log("   AgentRegistry deployed at:", address(agentRegistry));

        // 2. Deploy AgentStaking
        console.log("2/4 Deploying AgentStaking...");
        AgentStaking agentStaking = new AgentStaking(address(agentRegistry));
        console.log("   AgentStaking deployed at:", address(agentStaking));

        // 3. Deploy SeasonalLeaderboard
        console.log("3/4 Deploying SeasonalLeaderboard...");
        SeasonalLeaderboard leaderboard = new SeasonalLeaderboard(address(agentRegistry));
        console.log("   SeasonalLeaderboard deployed at:", address(leaderboard));

        // 4. Deploy PredictionMarket
        console.log("4/4 Deploying PredictionMarket...");
        PredictionMarket predictionMarket = new PredictionMarket();
        console.log("   PredictionMarket deployed at:", address(predictionMarket));

        vm.stopBroadcast();

        console.log("\n==============================================");
        console.log("Deployment Summary");
        console.log("==============================================");
        console.log("AgentRegistry:        ", address(agentRegistry));
        console.log("AgentStaking:         ", address(agentStaking));
        console.log("SeasonalLeaderboard:  ", address(leaderboard));
        console.log("PredictionMarket:     ", address(predictionMarket));
        console.log("==============================================\n");

        console.log("Next steps:");
        console.log("1. Authorize DealOrNotConfidential to update AgentRegistry:");
        console.log("   cast send", address(agentRegistry), '"authorizeContract(address)"', "<DEAL_OR_NOT_ADDRESS>", "--private-key $PRIVATE_KEY");
        console.log("");
        console.log("2. Authorize SeasonalLeaderboard to record game results:");
        console.log("   cast send", address(leaderboard), '"authorizeRecorder(address)"', "<DEAL_OR_NOT_ADDRESS>", "--private-key $PRIVATE_KEY");
        console.log("");
        console.log("3. Authorize PredictionMarket resolver:");
        console.log("   cast send", address(predictionMarket), '"authorizeResolver(address)"', "<CRE_WORKFLOW_ADDRESS>", "--private-key $PRIVATE_KEY");
        console.log("");
        console.log("4. Start first season:");
        console.log("   cast send", address(leaderboard), '"startSeason()"', "--private-key $PRIVATE_KEY");
        console.log("");
        console.log("5. Register test agents:");
        console.log("   cast send", address(agentRegistry), '"registerAgent(string,string,string)"', '"TestAgent"', '"https://agent.example.com/api"', '"{}"', "--private-key $PRIVATE_KEY");
        console.log("");
        console.log("6. Deploy CRE agent-gameplay workflow");
        console.log("");
    }
}
