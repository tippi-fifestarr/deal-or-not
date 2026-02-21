#!/usr/bin/env node

const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

/**
 * Test Proof Generation for Case Reveal Circuit
 *
 * This script:
 * 1. Generates a Merkle tree for 26 cases
 * 2. Creates a valid input for a specific case
 * 3. Generates a ZK proof
 * 4. Verifies the proof
 */

const buildPath = path.join(__dirname, "../build");
const wasmFile = path.join(buildPath, "case-reveal_js/case-reveal.wasm");
const zkeyFile = path.join(buildPath, "case-reveal_final.zkey");
const vkeyFile = path.join(buildPath, "verification_key.json");

// Poseidon hash function (matching circomlib) - will be loaded async
let poseidon;

// ═══════════════════════════════════════════════════════
// Helper: Build Merkle Tree
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// Helper: Get Merkle Proof
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// Main Test Function
// ═══════════════════════════════════════════════════════

async function testProofGeneration() {
    console.log("═══════════════════════════════════════════════════════");
    console.log("  Testing Case Reveal Proof Generation");
    console.log("═══════════════════════════════════════════════════════\n");

    // Load poseidon hash
    const circomlibjs = await import("circomlibjs");
    const poseidonHash = await circomlibjs.buildPoseidon();

    // Wrap poseidon to return BigInt instead of Uint8Array
    poseidon = (inputs) => {
        const hash = poseidonHash(inputs);
        return poseidonHash.F.toObject(hash);
    };

    // Check files exist
    if (!fs.existsSync(wasmFile)) {
        console.error("❌ WASM file not found. Run 'npm run compile' first.");
        process.exit(1);
    }
    if (!fs.existsSync(zkeyFile)) {
        console.error("❌ zKey file not found. Run 'npm run setup' first.");
        process.exit(1);
    }

    // ═══════════════════════════════════════════════════════
    // Step 1: Generate game data
    // ═══════════════════════════════════════════════════════

    console.log("Step 1/5: Generating game data (26 cases)...");

    const NUM_CASES = 26;
    const salt = 123456789n; // Host's secret salt

    // Example prize values (in wei, scaled proportionally)
    const values = [
        1n,           // $0.01
        100n,         // $1
        500n,         // $5
        1000n,        // $10
        2500n,        // $25
        5000n,        // $50
        7500n,        // $75
        10000n,       // $100
        20000n,       // $200
        30000n,       // $300
        40000n,       // $400
        50000n,       // $500
        75000n,       // $750
        100000n,      // $1K
        500000n,      // $5K
        1000000n,     // $10K
        2500000n,     // $25K
        5000000n,     // $50K
        7500000n,     // $75K
        10000000n,    // $100K
        20000000n,    // $200K
        30000000n,    // $300K
        40000000n,    // $400K
        50000000n,    // $500K
        75000000n,    // $750K
        100000000n,   // $1M
    ];

    // Build Merkle tree
    const leaves = [];
    for (let i = 0; i < NUM_CASES; i++) {
        const leaf = poseidon([BigInt(i), values[i], salt]);
        leaves.push(leaf);
    }

    // Pad to 32 leaves (next power of 2)
    while (leaves.length < 32) {
        leaves.push(0n);
    }

    const tree = buildMerkleTree(leaves);
    const root = tree[tree.length - 1][0];

    console.log(`✓ Merkle root: ${typeof root === 'bigint' ? root.toString() : root}`);
    console.log(`✓ Tree depth: 5 levels, 32 leaves\n`);

    // ═══════════════════════════════════════════════════════
    // Step 2: Generate proof for a specific case
    // ═══════════════════════════════════════════════════════

    console.log("Step 2/5: Generating proof for Case #5...");

    const caseToReveal = 5;
    const { proof, indices } = getMerkleProof(tree, caseToReveal);

    const input = {
        caseIndex: caseToReveal.toString(),
        merkleRoot: root.toString(),
        value: values[caseToReveal].toString(),
        salt: salt.toString(),
        pathElements: proof.map(p => p.toString()),
        pathIndices: indices.map(i => i.toString()),
    };

    console.log(`✓ Case index: ${caseToReveal}`);
    console.log(`✓ Value: ${values[caseToReveal]}`);
    console.log(`✓ Input prepared\n`);

    // ═══════════════════════════════════════════════════════
    // Step 3: Generate proof (includes witness calculation)
    // ═══════════════════════════════════════════════════════

    console.log("Step 3/4: Generating ZK proof (Groth16)...");
    console.log("⏳ This may take 10-30 seconds...");

    const startTime = Date.now();
    const { proof: zkProof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        wasmFile,
        zkeyFile
    );
    const proofTime = Date.now() - startTime;

    console.log(`✓ Proof generated in ${proofTime}ms`);
    console.log(`✓ Public signals (outputs first, then inputs):`);
    console.log(`  - revealedValue: ${publicSignals[0]}`);
    console.log(`  - caseIndex: ${publicSignals[1]}`);
    console.log(`  - merkleRoot: ${publicSignals[2]}`);
    console.log(`  - value: ${publicSignals[3]}\n`);

    // ═══════════════════════════════════════════════════════
    // Step 5: Verify proof
    // ═══════════════════════════════════════════════════════

    console.log("Step 5/5: Verifying proof...");

    const vkey = JSON.parse(fs.readFileSync(vkeyFile));
    const verified = await snarkjs.groth16.verify(vkey, publicSignals, zkProof);

    if (verified) {
        console.log("✅ Proof verified successfully!\n");
    } else {
        console.log("❌ Proof verification FAILED!\n");
        process.exit(1);
    }

    // ═══════════════════════════════════════════════════════
    // Save outputs for Solidity testing
    // ═══════════════════════════════════════════════════════

    const outputDir = path.join(__dirname, "../build");
    fs.writeFileSync(
        path.join(outputDir, "test_proof.json"),
        JSON.stringify(zkProof, null, 2)
    );
    fs.writeFileSync(
        path.join(outputDir, "test_public.json"),
        JSON.stringify(publicSignals, null, 2)
    );
    fs.writeFileSync(
        path.join(outputDir, "test_input.json"),
        JSON.stringify(input, null, 2)
    );

    console.log("═══════════════════════════════════════════════════════");
    console.log("  Test Complete!");
    console.log("═══════════════════════════════════════════════════════");
    console.log("\nGenerated files:");
    console.log("  - build/test_proof.json (ZK proof)");
    console.log("  - build/test_public.json (Public signals)");
    console.log("  - build/test_input.json (Circuit input)");
    console.log("\n📝 Next steps:");
    console.log("  1. Copy build/Groth16Verifier.sol to foundry/contracts/");
    console.log("  2. Update deployment scripts to use real verifier");
    console.log("  3. Test on-chain verification with these proofs");
    console.log("");
}

// Run test
testProofGeneration()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Error:", error);
        process.exit(1);
    });
