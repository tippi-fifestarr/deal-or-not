//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import {DealOrNoDeal} from "../contracts/DealOrNoDeal.sol";
import {DealOrNoDealFactory} from "../contracts/DealOrNoDealFactory.sol";
import {BriefcaseNFT} from "../contracts/BriefcaseNFT.sol";
import {ZKGameVerifier} from "../contracts/ZKGameVerifier.sol";
import {CaseRevealVerifier} from "../contracts/CaseRevealVerifier.sol";

contract DeployDealOrNoDeal is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        // 1. Deploy real Groth16 verifier (auto-generated from circuit)
        CaseRevealVerifier caseRevealVerifier = new CaseRevealVerifier();
        deployments.push(Deployment("CaseRevealVerifier", address(caseRevealVerifier)));

        // 2. Deploy ZK wrapper
        ZKGameVerifier zkVerifier = new ZKGameVerifier(address(caseRevealVerifier));
        deployments.push(Deployment("ZKGameVerifier", address(zkVerifier)));

        // 3. Deploy implementation contracts (not used directly, only as clone templates)
        DealOrNoDeal gameImpl = new DealOrNoDeal();
        deployments.push(Deployment("DealOrNoDeal_Implementation", address(gameImpl)));

        BriefcaseNFT nftImpl = new BriefcaseNFT();
        deployments.push(Deployment("BriefcaseNFT_Implementation", address(nftImpl)));

        // 4. Deploy factory (200 = 2% jackpot contribution)
        DealOrNoDealFactory factory = new DealOrNoDealFactory(
            address(gameImpl),
            address(nftImpl),
            address(zkVerifier),
            deployer, // protocol fee recipient = deployer for now
            200 // jackpotBps = 2%
        );
        deployments.push(Deployment("DealOrNoDealFactory", address(factory)));
    }
}
