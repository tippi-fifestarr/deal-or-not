// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/DealOrNoDeal.sol";
import "../contracts/DealOrNoDealFactory.sol";
import "../contracts/GameTypes.sol";

contract PlayFullGame is Script {
    uint256 constant NUM_PLAYERS = 9; // Anvil only has 10 test accounts (0-9), and we use one for deploying
    uint256 constant ENTRY_FEE = 0.1 ether;

    function run() external {
        vm.startBroadcast();

        address factory = 0x21106d1515DFE56291060661A6Be17c69f5059B5;
        DealOrNoDealFactory f = DealOrNoDealFactory(payable(factory));

        console.log("=== Creating Game with 0.1 ETH Entry ===");
        bytes32 merkleRoot = keccak256("game");
        GameConfig memory config = GameConfig({
            entryFee: ENTRY_FEE,
            lotteryDuration: 300,
            revealDuration: 300,
            turnTimeout: 3600,
            hostFeeBps: 500,
            protocolFeeBps: 500,
            refundBps: 5000,
            minPlayers: 2
        });

        (address game, address nftAddr) = f.createGame(merkleRoot, config, keccak256("salt"));
        console.log("Game created at:", game);
        console.log("NFT created at:", nftAddr);

        DealOrNoDeal g = DealOrNoDeal(payable(game));

        console.log("=== Opening Lottery ===");
        g.openLottery();

        vm.stopBroadcast();

        // Fund and enter 9 players (use Anvil test accounts)
        console.log("=== Entering 9 Players ===");

        // Anvil test account private keys (first 9 after the deployer)
        uint256[9] memory playerPks = [
            uint256(0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d),
            0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a,
            0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6,
            0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a,
            0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba,
            0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e,
            0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356,
            0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97,
            0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6
        ];

        for (uint256 i = 0; i < NUM_PLAYERS; i++) {
            uint256 pk = playerPks[i];
            address player = vm.addr(pk);
            bytes32 secret = bytes32(uint256(100 + i));

            vm.startBroadcast(pk);
            g.enterLottery{value: ENTRY_FEE}(keccak256(abi.encodePacked(secret, player)));
            vm.stopBroadcast();

            console.log("Player", i + 1, "entered:", player);
        }

        // Close lottery (wait for lottery duration to pass)
        console.log("=== Closing Lottery ===");
        vm.warp(block.timestamp + 310);  // lotteryDuration = 300, add 10 for buffer
        vm.startBroadcast();
        g.closeLotteryEntries();
        vm.stopBroadcast();

        // Reveal all secrets (must be done during reveal window)
        console.log("=== Revealing Secrets ===");
        for (uint256 i = 0; i < NUM_PLAYERS; i++) {
            uint256 pk = playerPks[i];
            bytes32 secret = bytes32(uint256(100 + i));

            vm.startBroadcast(pk);
            g.revealSecret(secret);
            vm.stopBroadcast();
        }

        // Draw winner (wait for reveal duration to pass)
        console.log("=== Drawing Winner ===");
        vm.warp(block.timestamp + 311);  // revealDuration = 300, add extra buffer
        vm.roll(block.number + 1);
        vm.startBroadcast();
        g.drawWinner();
        vm.stopBroadcast();

        (address host, address contestant, GameState state,,,,,,,,,,,,,) = g.game();
        console.log("Winner:", contestant);

        // Winner selects case
        console.log("=== Winner Selects Case #13 ===");
        uint256 winnerPk = 0;
        for (uint256 i = 0; i < NUM_PLAYERS; i++) {
            uint256 pk = playerPks[i];
            if (vm.addr(pk) == contestant) {
                winnerPk = pk;
                break;
            }
        }

        vm.startBroadcast(winnerPk);
        g.selectCase(13);
        vm.stopBroadcast();

        // Play round 1 (open 6 cases)
        console.log("=== Playing Round 1 (opening 6 cases) ===");
        vm.startBroadcast();
        for (uint256 i = 0; i < 6; i++) {
            if (i == 13) continue;  // skip selected case
            (uint256 value,,,) = g.briefcases(i);
            g.openCase(i, value, [uint256(0), 0], [[uint256(0), 0], [uint256(0), 0]], [uint256(0), 0]);
            console.log("Opened case", i);
        }
        vm.stopBroadcast();

        console.log("=== Round 1 Complete! ===");
        console.log("Game Address:", game);
        console.log("View at: http://localhost:3003/game/", game);
    }
}
