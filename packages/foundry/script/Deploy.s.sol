//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import {DeployDealOrNoDeal} from "./DeployDealOrNoDeal.s.sol";

contract DeployScript is ScaffoldETHDeploy {
    function run() external {
        DeployDealOrNoDeal deployDOND = new DeployDealOrNoDeal();
        deployDOND.run();
    }
}
