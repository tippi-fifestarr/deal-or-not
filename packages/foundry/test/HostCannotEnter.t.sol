// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/DealOrNoDeal.sol";
import "../contracts/DealOrNoDealFactory.sol";
import "../contracts/BriefcaseNFT.sol";
import "../contracts/ZKGameVerifier.sol";
import {GameConfig, LotteryEntry, HostCannotEnterLottery, RandomnessMethod} from "../contracts/GameTypes.sol";

contract HostCannotEnterTest is Test {
    DealOrNoDealFactory factory;
    DealOrNoDeal game;

    address host = address(0x1);
    address player = address(0x2);

    uint256 constant ENTRY_FEE = 0.1 ether;

    function setUp() public {
        // Deploy mock verifier
        MockGroth16Verifier mockVerifier = new MockGroth16Verifier();
        ZKGameVerifier zkVerifier = new ZKGameVerifier(address(mockVerifier));

        // Deploy implementations
        DealOrNoDeal gameImpl = new DealOrNoDeal();
        BriefcaseNFT nftImpl = new BriefcaseNFT();

        // Deploy factory
        factory = new DealOrNoDealFactory(
            address(gameImpl),
            address(nftImpl),
            address(zkVerifier),
            address(this),
            200 // 2% jackpot
        );

        // Create game as host
        GameConfig memory config = GameConfig({
            entryFee: ENTRY_FEE,
            lotteryDuration: 1 hours,
            revealDuration: 30 minutes,
            turnTimeout: 1 hours,
            hostFeeBps: 500,
            protocolFeeBps: 500,
            refundBps: 5000,
            minPlayers: 2,
            randomnessMethod: RandomnessMethod.CommitReveal
        });

        vm.prank(host);
        (address gameAddr,) = factory.createGame(keccak256("test"), config, keccak256("salt"));
        game = DealOrNoDeal(payable(gameAddr));

        // Open lottery
        vm.prank(host);
        game.openLottery();

        // Fund addresses
        vm.deal(host, 10 ether);
        vm.deal(player, 10 ether);
    }

    function testHostCannotEnter() public {
        bytes32 hostSecret = keccak256("host-secret");
        bytes32 hostCommit = keccak256(abi.encodePacked(hostSecret, host));

        // Host tries to enter their own lottery
        vm.prank(host);
        vm.expectRevert(HostCannotEnterLottery.selector);
        game.enterLottery{value: ENTRY_FEE}(hostCommit);
    }

    function testPlayerCanEnter() public {
        bytes32 playerSecret = keccak256("player-secret");
        bytes32 playerCommit = keccak256(abi.encodePacked(playerSecret, player));

        // Regular player can enter
        vm.prank(player);
        game.enterLottery{value: ENTRY_FEE}(playerCommit);

        // Verify entry
        (address enteredPlayer,,,,) = game.lotteryEntries(0);
        assertEq(enteredPlayer, player);
    }
}

contract MockGroth16Verifier {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[4] calldata
    ) external pure returns (bool) {
        return true;
    }
}
