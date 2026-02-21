pragma circom 2.1.6;

include "poseidon.circom";
include "./merkle-proof.circom";

/// @title CaseReveal
/// @notice Proves that a briefcase contains a specific value, verified against
///         a committed Merkle root. The host pre-generates these proofs at game
///         creation time. Salt prevents brute-forcing the 26 known amounts.
/// @param depth Merkle tree depth (5 for 32 leaves)
template CaseReveal(depth) {
    // Private inputs (host's witness)
    signal input salt;               // random salt to prevent brute-force
    signal input pathElements[depth]; // Merkle siblings
    signal input pathIndices[depth];  // path direction bits

    // Public inputs (verified onchain)
    signal input caseIndex;          // which case (0-25)
    signal input merkleRoot;         // committed root from game creation

    // Public output
    signal output revealedValue;     // the ETH value in this case

    // Also a public input but declared as signal input for cleaner interface
    signal input value;              // the case value (becomes public via circuit output)

    // Step 1: Compute the leaf = Poseidon(caseIndex, value, salt)
    component leafHasher = Poseidon(3);
    leafHasher.inputs[0] <== caseIndex;
    leafHasher.inputs[1] <== value;
    leafHasher.inputs[2] <== salt;

    // Step 2: Verify Merkle proof
    component merkle = MerkleProof(depth);
    merkle.leaf <== leafHasher.out;
    for (var i = 0; i < depth; i++) {
        merkle.pathElements[i] <== pathElements[i];
        merkle.pathIndices[i] <== pathIndices[i];
    }

    // Step 3: Constrain: computed root must match committed root
    merkle.root === merkleRoot;

    // Step 4: Output the revealed value
    revealedValue <== value;
}

// Main: public inputs are caseIndex, merkleRoot, value
// The verifier checks all 3 public signals + revealedValue output
component main {public [caseIndex, merkleRoot, value]} = CaseReveal(5);
