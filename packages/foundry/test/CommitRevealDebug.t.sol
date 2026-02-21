// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

contract CommitRevealDebugTest is Test {
    function testCommitRevealEncoding() public {
        bytes32 secret = 0x000000000000000000000000000000000000000000000000000000000000006f;
        address player = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

        // Test what the commit hash should be
        bytes32 commitHash = keccak256(abi.encodePacked(secret, player));

        console.log("Secret:");
        console.logBytes32(secret);
        console.log("Player:");
        console.logAddress(player);
        console.log("Expected commit hash:");
        console.logBytes32(commitHash);

        // Verify it matches
        assertEq(commitHash, 0xd5328e1f7a95a7380d898275c3e3cb3ef6e0d17d759ef72696146ab766b5e6c2, "Commit hash mismatch");
    }
}
