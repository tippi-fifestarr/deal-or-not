// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InvalidProof} from "./GameTypes.sol";

/// @notice Interface for the auto-generated Groth16 verifier
interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[4] calldata _pubSignals
    ) external view returns (bool);
}

/// @title ZKGameVerifier
/// @notice Wrapper around the auto-generated Groth16 verifier for case reveal proofs
/// @dev Public signals layout: [caseIndex, merkleRoot, value, revealedValue]
contract ZKGameVerifier {
    IGroth16Verifier public immutable groth16Verifier;

    constructor(address _groth16Verifier) {
        groth16Verifier = IGroth16Verifier(_groth16Verifier);
    }

    /// @notice Verify a case reveal proof
    /// @param pA Proof element A
    /// @param pB Proof element B
    /// @param pC Proof element C
    /// @param caseIndex The case being revealed (0-25)
    /// @param merkleRoot The committed Merkle root for this game
    /// @param value The claimed value of the case
    /// @return valid Whether the proof is valid
    function verifyCaseReveal(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256 caseIndex,
        uint256 merkleRoot,
        uint256 value
    ) external view returns (bool valid) {
        // Public signals: [caseIndex, merkleRoot, value, revealedValue]
        // revealedValue == value (circuit constraint)
        uint256[4] memory pubSignals;
        pubSignals[0] = caseIndex;
        pubSignals[1] = merkleRoot;
        pubSignals[2] = value;
        pubSignals[3] = value; // revealedValue output matches value input

        valid = groth16Verifier.verifyProof(pA, pB, pC, pubSignals);
    }
}
