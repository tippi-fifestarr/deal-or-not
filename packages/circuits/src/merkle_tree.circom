pragma circom 2.1.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

// Verifies a Merkle proof for a leaf in a tree of depth 5 (32 leaves)
// Using Poseidon hash for better ZK performance
template MerkleTreeChecker(levels) {
    // Public inputs
    signal input leaf;
    signal input root;

    // Private inputs
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // Internal signals for hash computation
    component hashers[levels];
    component mux[levels];

    signal levelHashes[levels + 1];
    levelHashes[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        // Determine left and right based on path index
        // pathIndices[i] = 0 means current hash is left child
        // pathIndices[i] = 1 means current hash is right child
        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== levelHashes[i];
        mux[i].c[0][1] <== pathElements[i];
        mux[i].c[1][0] <== pathElements[i];
        mux[i].c[1][1] <== levelHashes[i];
        mux[i].s <== pathIndices[i];

        // Hash(left, right)
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== mux[i].out[0];
        hashers[i].inputs[1] <== mux[i].out[1];

        levelHashes[i + 1] <== hashers[i].out;
    }

    // Constrain root to match computed root
    root === levelHashes[levels];
}
