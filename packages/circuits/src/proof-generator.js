/**
 * ZK Proof Generation Service
 *
 * Generates Groth16 proofs for case reveals in Deal or No Deal.
 * Used by hosts when creating games to pre-generate all 26 proofs.
 */

const snarkjs = require("snarkjs");
const path = require("path");
const fs = require("fs");

// Poseidon hash - loaded async
let poseidon;

/**
 * Initialize the proof generator (loads Poseidon hash)
 */
async function initialize() {
    if (poseidon) return; // Already initialized

    const circomlibjs = await import("circomlibjs");
    const poseidonHash = await circomlibjs.buildPoseidon();

    // Wrap to return BigInt
    poseidon = (inputs) => {
        const hash = poseidonHash(inputs);
        return poseidonHash.F.toObject(hash);
    };
    poseidon.F = poseidonHash.F;
}

/**
 * Build a Merkle tree from leaves
 * @param {BigInt[]} leaves - Array of leaf hashes (padded to 32)
 * @returns {BigInt[][]} - Tree structure [level0, level1, ..., root]
 */
function buildMerkleTree(leaves) {
    const depth = 5; // 2^5 = 32 leaves
    let tree = [leaves];

    for (let level = 0; level < depth; level++) {
        const currentLevel = tree[level];
        const nextLevel = [];

        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : 0n;
            const parent = poseidon([left, right]);
            nextLevel.push(parent);
        }

        tree.push(nextLevel);
    }

    return tree;
}

/**
 * Get Merkle proof for a specific leaf
 * @param {BigInt[][]} tree - Merkle tree
 * @param {number} leafIndex - Index of the leaf
 * @returns {{proof: BigInt[], indices: number[]}} - Sibling hashes and path bits
 */
function getMerkleProof(tree, leafIndex) {
    const proof = [];
    const indices = [];
    let index = leafIndex;

    for (let level = 0; level < tree.length - 1; level++) {
        const currentLevel = tree[level];
        const isLeft = index % 2 === 0;
        const siblingIndex = isLeft ? index + 1 : index - 1;

        const sibling = siblingIndex < currentLevel.length ? currentLevel[siblingIndex] : 0n;
        proof.push(sibling);
        indices.push(isLeft ? 0 : 1);

        index = Math.floor(index / 2);
    }

    return { proof, indices };
}

/**
 * Generate all ZK proofs for a game
 * @param {BigInt[]} caseValues - Array of 26 case values (in wei or scaled)
 * @param {BigInt} salt - Random salt (host's secret)
 * @param {Object} options - Configuration options
 * @returns {Promise<{merkleRoot: string, proofs: Array}>}
 */
async function generateGameProofs(caseValues, salt, options = {}) {
    await initialize();

    if (caseValues.length !== 26) {
        throw new Error(`Expected 26 case values, got ${caseValues.length}`);
    }

    const buildPath = options.buildPath || path.join(__dirname, "../build");
    const wasmFile = path.join(buildPath, "case-reveal_js/case-reveal.wasm");
    const zkeyFile = path.join(buildPath, "case-reveal_final.zkey");

    // Check files exist
    if (!fs.existsSync(wasmFile)) {
        throw new Error(`WASM file not found: ${wasmFile}. Run 'npm run build' first.`);
    }
    if (!fs.existsSync(zkeyFile)) {
        throw new Error(`zKey file not found: ${zkeyFile}. Run 'npm run build' first.`);
    }

    console.log("🔐 Generating ZK proofs for 26 cases...\n");

    // Step 1: Build Merkle tree
    console.log("Step 1/3: Building Merkle tree...");
    const leaves = [];
    for (let i = 0; i < 26; i++) {
        const leaf = poseidon([BigInt(i), caseValues[i], salt]);
        leaves.push(leaf);
    }

    // Pad to 32 leaves
    while (leaves.length < 32) {
        leaves.push(0n);
    }

    const tree = buildMerkleTree(leaves);
    const root = tree[tree.length - 1][0];
    const merkleRoot = root.toString(); // root is already BigInt from our wrapper

    console.log(`✓ Merkle root: ${merkleRoot}\n`);

    // Step 2: Generate proofs for all 26 cases
    console.log("Step 2/3: Generating Groth16 proofs...");
    const proofs = [];
    const startTime = Date.now();

    for (let caseIndex = 0; caseIndex < 26; caseIndex++) {
        const { proof: merkleProof, indices } = getMerkleProof(tree, caseIndex);

        const input = {
            caseIndex: caseIndex.toString(),
            merkleRoot,
            value: caseValues[caseIndex].toString(),
            salt: salt.toString(),
            pathElements: merkleProof.map(p => p.toString()), // Already BigInt from wrapper
            pathIndices: indices.map(i => i.toString()),
        };

        // Generate proof
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input,
            wasmFile,
            zkeyFile
        );

        proofs.push({
            caseIndex,
            proof,
            publicSignals,
            input // Store input for debugging
        });

        // Progress indicator
        if ((caseIndex + 1) % 5 === 0 || caseIndex === 25) {
            console.log(`  ✓ Generated ${caseIndex + 1}/26 proofs`);
        }
    }

    const totalTime = Date.now() - startTime;
    console.log(`\n✓ All proofs generated in ${(totalTime / 1000).toFixed(1)}s (avg ${(totalTime / 26).toFixed(0)}ms per proof)\n`);

    // Step 3: Format for Solidity
    console.log("Step 3/3: Formatting proofs for Solidity...");
    const formattedProofs = proofs.map(p => formatProofForSolidity(p.proof, p.publicSignals));
    console.log("✓ Proofs formatted\n");

    return {
        merkleRoot,
        salt: salt.toString(),
        caseValues: caseValues.map(v => v.toString()),
        proofs: formattedProofs,
        rawProofs: proofs // Include raw proofs for verification
    };
}

/**
 * Format a Groth16 proof for Solidity verification
 * @param {Object} proof - SnarkJS proof object
 * @param {string[]} publicSignals - Public signals array
 * @returns {Object} - Formatted proof
 */
function formatProofForSolidity(proof, publicSignals) {
    return {
        pA: [proof.pi_a[0], proof.pi_a[1]],
        pB: [
            [proof.pi_b[0][1], proof.pi_b[0][0]], // Note: reversed for Solidity
            [proof.pi_b[1][1], proof.pi_b[1][0]]
        ],
        pC: [proof.pi_c[0], proof.pi_c[1]],
        publicSignals: publicSignals
    };
}

/**
 * Verify a proof off-chain
 * @param {Object} proof - Formatted proof
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} - Whether the proof is valid
 */
async function verifyProof(proof, options = {}) {
    const buildPath = options.buildPath || path.join(__dirname, "../build");
    const vkeyFile = path.join(buildPath, "verification_key.json");

    if (!fs.existsSync(vkeyFile)) {
        throw new Error(`Verification key not found: ${vkeyFile}`);
    }

    const vkey = JSON.parse(fs.readFileSync(vkeyFile));

    // Convert back to SnarkJS format
    const snarkjsProof = {
        pi_a: proof.pA,
        pi_b: [
            [proof.pB[0][1], proof.pB[0][0]],
            [proof.pB[1][1], proof.pB[1][0]]
        ],
        pi_c: proof.pC,
        protocol: "groth16",
        curve: "bn128"
    };

    return await snarkjs.groth16.verify(vkey, proof.publicSignals, snarkjsProof);
}

/**
 * Generate random salt
 * @returns {BigInt} - Random 256-bit number
 */
function generateSalt() {
    const crypto = require('crypto');
    const randomBytes = crypto.randomBytes(32);
    return BigInt('0x' + randomBytes.toString('hex'));
}

/**
 * Example prize distribution (26 standard Deal or No Deal values)
 * @param {BigInt} prizePool - Total prize pool in wei
 * @returns {BigInt[]} - Array of 26 case values
 */
function generateStandardPrizeDistribution(prizePool) {
    // Standard percentages (totals 100%)
    const percentages = [
        0.001,  // $0.01
        0.01,   // $1
        0.05,   // $5
        0.1,    // $10
        0.25,   // $25
        0.5,    // $50
        0.75,   // $75
        1.0,    // $100
        2.0,    // $200
        3.0,    // $300
        4.0,    // $400
        5.0,    // $500
        7.5,    // $750
        10.0,   // $1K
        15.0,   // $5K (reduced)
        10.0,   // $10K
        8.0,    // $25K
        7.0,    // $50K
        6.0,    // $75K
        5.0,    // $100K
        4.0,    // $200K
        3.0,    // $300K
        2.0,    // $400K
        1.5,    // $500K
        1.0,    // $750K
        0.5     // $1M
    ];

    const total = percentages.reduce((a, b) => a + b, 0);
    return percentages.map(pct => (prizePool * BigInt(Math.floor(pct * 10000))) / BigInt(Math.floor(total * 10000)));
}

module.exports = {
    initialize,
    generateGameProofs,
    verifyProof,
    formatProofForSolidity,
    generateSalt,
    generateStandardPrizeDistribution,
    buildMerkleTree,
    getMerkleProof
};
