// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SponsorJackpot} from "../src/SponsorJackpot.sol";

contract DeploySponsorJackpot is Script {
    function run() external {
        address gameContract = vm.envAddress("DEAL_OR_NOT_ADDRESS");

        vm.startBroadcast();

        SponsorJackpot jackpot = new SponsorJackpot(gameContract);
        console.log("SponsorJackpot deployed at:", address(jackpot));

        // Register "Chainlink" as the demo sponsor with 0.01 ETH
        jackpot.registerSponsor{value: 0.01 ether}(
            "Chainlink",
            "https://chain.link/favicon.ico"
        );
        console.log("Registered Chainlink as sponsor with 0.01 ETH");

        vm.stopBroadcast();
    }
}
