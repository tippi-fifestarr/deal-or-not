pragma circom 2.1.0;

include "./merkle_tree.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/**
 * CaseReveal Circuit
 *
 * Proves that a case has a specific value in a Deal or No Deal game
 * without revealing the host's salt or the full case assignment.
 *
 * Public Inputs:
 *   - caseIndex: Which briefcase (0-25)
 *   - merkleRoot: Committed root from game creation
 *
 * Private Inputs:
 *   - value: The actual value in this case
 *   - salt: Host's secret salt
 *   - merkleProof: Path elements to prove inclusion
 *   - merkleIndices: Path indices (left/right) for Merkle proof
 *
 * Public Outputs:
 *   - value: The revealed value (must match private value)
 *
 * Circuit guarantees:
 *   1. The leaf = Poseidon(caseIndex, value, salt) is in the Merkle tree
 *   2. The Merkle root matches the committed root
 *   3. The output value matches the private value
 */
template CaseReveal() {
    // Public inputs
    signal input caseIndex;
    signal input merkleRoot;

    // Private inputs
    signal input value;
    signal input salt;
    signal input merkleProof[5];    // Depth 5 = 32 leaves
    signal input merkleIndices[5];  // 0 or 1 for each level

    // Public output
    signal output revealedValue;

    // ═══════════════════════════════════════════════════════
    // CONSTRAINT 1: Validate case index is in valid range
    // ═══════════════════════════════════════════════════════
    component validCase = LessThan(8);  // 8 bits supports 0-255
    validCase.in[0] <== caseIndex;
    validCase.in[1] <== 26;  // Must be < 26
    validCase.out === 1;

    // ═══════════════════════════════════════════════════════
    // CONSTRAINT 2: Compute leaf hash
    // leaf = Poseidon(caseIndex, value, salt)
    // ═══════════════════════════════════════════════════════
    component leafHasher = Poseidon(3);
    leafHasher.inputs[0] <== caseIndex;
    leafHasher.inputs[1] <== value;
    leafHasher.inputs[2] <== salt;

    // ═══════════════════════════════════════════════════════
    // CONSTRAINT 3: Verify Merkle proof
    // Proves this leaf is in the committed tree
    // ═══════════════════════════════════════════════════════
    component merkleChecker = MerkleTreeChecker(5);
    merkleChecker.leaf <== leafHasher.out;
    merkleChecker.root <== merkleRoot;
    merkleChecker.pathElements <== merkleProof;
    merkleChecker.pathIndices <== merkleIndices;

    // ═══════════════════════════════════════════════════════
    // CONSTRAINT 4: Output value matches private value
    // This is the "reveal" - proof is only valid if value is correct
    // ═══════════════════════════════════════════════════════
    revealedValue <== value;
}

// Main component with public signals specified
component main {public [caseIndex, merkleRoot]} = CaseReveal();
