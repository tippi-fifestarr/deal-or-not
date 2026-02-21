pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

/// @title MerkleProof
/// @notice Verifies a Poseidon Merkle proof for a given leaf and root
/// @param depth The depth of the Merkle tree
template MerkleProof(depth) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth]; // 0 = left, 1 = right

    signal output root;

    signal hashes[depth + 1];
    hashes[0] <== leaf;

    component hashers[depth];
    component muxLeft[depth];
    component muxRight[depth];

    for (var i = 0; i < depth; i++) {
        // If pathIndices[i] == 0, leaf is on left: hash(leaf, sibling)
        // If pathIndices[i] == 1, leaf is on right: hash(sibling, leaf)
        pathIndices[i] * (1 - pathIndices[i]) === 0; // constrain to 0 or 1

        muxLeft[i] = Mux1();
        muxLeft[i].c[0] <== hashes[i];
        muxLeft[i].c[1] <== pathElements[i];
        muxLeft[i].s <== pathIndices[i];

        muxRight[i] = Mux1();
        muxRight[i].c[0] <== pathElements[i];
        muxRight[i].c[1] <== hashes[i];
        muxRight[i].s <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== muxLeft[i].out;
        hashers[i].inputs[1] <== muxRight[i].out;

        hashes[i + 1] <== hashers[i].out;
    }

    root <== hashes[depth];
}
