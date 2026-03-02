// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract HashDebug {
    function hashRound(uint8[] calldata caseIndices, uint256 salt) external pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(caseIndices, salt)));
    }

    function hashFinal(bool swap, uint256 salt) external pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(swap, salt)));
    }

    function packRound(uint8[] calldata caseIndices, uint256 salt) external pure returns (bytes memory) {
        return abi.encodePacked(caseIndices, salt);
    }
}
