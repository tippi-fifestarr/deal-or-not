#!/usr/bin/env node

/**
 * Create Game with ZK Proofs
 *
 * Example script showing how to generate all proofs for a new game.
 * This is what the host API would do when a new game is created.
 */

const proofGenerator = require("../src/proof-generator");
const fs = require("fs");
const path = require("path");

async function createGameWithProofs() {
    console.log("═══════════════════════════════════════════════════════");
    console.log("  Create Game with ZK Proofs");
    console.log("═══════════════════════════════════════════════════════\n");

    // ═══════════════════════════════════════════════════════
    // Step 1: Define game parameters
    // ═══════════════════════════════════════════════════════

    console.log("Step 1/5: Defining game parameters...\n");

    const prizePool = 1000000000000000000n; // 1 ETH
    const salt = proofGenerator.generateSalt();

    console.log(`Prize pool: ${prizePool} wei (${Number(prizePool) / 1e18} ETH)`);
    console.log(`Salt: ${salt.toString()}\n`);

    // ═══════════════════════════════════════════════════════
    // Step 2: Generate prize distribution
    // ═══════════════════════════════════════════════════════

    console.log("Step 2/5: Generating prize distribution...\n");

    const caseValues = proofGenerator.generateStandardPrizeDistribution(prizePool);

    console.log("Case values:");
    caseValues.forEach((value, i) => {
        const eth = Number(value) / 1e18;
        console.log(`  Case ${i.toString().padStart(2)}: ${eth.toFixed(6)} ETH`);
    });
    console.log();

    // ═══════════════════════════════════════════════════════
    // Step 3: Generate ZK proofs for all cases
    // ═══════════════════════════════════════════════════════

    console.log("Step 3/5: Generating ZK proofs (this takes ~30 seconds)...\n");

    const startTime = Date.now();
    const gameData = await proofGenerator.generateGameProofs(caseValues, salt);
    const totalTime = Date.now() - startTime;

    console.log(`Total generation time: ${(totalTime / 1000).toFixed(1)}s\n`);

    // ═══════════════════════════════════════════════════════
    // Step 4: Verify proofs
    // ═══════════════════════════════════════════════════════

    console.log("Step 4/5: Verifying generated proofs...\n");

    let verifiedCount = 0;
    for (let i = 0; i < gameData.proofs.length; i++) {
        const valid = await proofGenerator.verifyProof(gameData.proofs[i]);
        if (valid) {
            verifiedCount++;
        } else {
            console.error(`❌ Proof ${i} failed verification!`);
        }

        if ((i + 1) % 5 === 0 || i === 25) {
            console.log(`  ✓ Verified ${i + 1}/26 proofs`);
        }
    }

    if (verifiedCount === 26) {
        console.log("\n✅ All 26 proofs verified successfully!\n");
    } else {
        console.error(`\n❌ Only ${verifiedCount}/26 proofs verified!\n`);
        process.exit(1);
    }

    // ═══════════════════════════════════════════════════════
    // Step 5: Save game data
    // ═══════════════════════════════════════════════════════

    console.log("Step 5/5: Saving game data...\n");

    const outputDir = path.join(__dirname, "../build");
    const outputFile = path.join(outputDir, "example-game.json");

    const gameOutput = {
        merkleRoot: gameData.merkleRoot,
        salt: gameData.salt,
        caseValues: gameData.caseValues,
        prizePool: prizePool.toString(),
        generatedAt: new Date().toISOString(),
        proofs: gameData.proofs,
        metadata: {
            totalCases: 26,
            proofGenerationTime: `${(totalTime / 1000).toFixed(1)}s`,
            avgProofTime: `${(totalTime / 26).toFixed(0)}ms`,
            verified: verifiedCount === 26
        }
    };

    fs.writeFileSync(outputFile, JSON.stringify(gameOutput, null, 2));
    console.log(`✓ Game data saved to: ${outputFile}\n`);

    // ═══════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════

    console.log("═══════════════════════════════════════════════════════");
    console.log("  Game Creation Complete!");
    console.log("═══════════════════════════════════════════════════════\n");

    console.log("📊 Game Summary:");
    console.log(`  Merkle Root: ${gameData.merkleRoot}`);
    console.log(`  Prize Pool: ${Number(prizePool) / 1e18} ETH`);
    console.log(`  Proofs Generated: 26`);
    console.log(`  All Proofs Verified: ${verifiedCount === 26 ? '✅ Yes' : '❌ No'}`);
    console.log(`  Generation Time: ${(totalTime / 1000).toFixed(1)}s`);
    console.log();

    console.log("📝 Next Steps:");
    console.log("  1. Deploy game contract with merkleRoot");
    console.log("  2. Store proofs in database/IPFS");
    console.log("  3. Expose proof API: GET /game/:merkleRoot/proof/:caseIndex");
    console.log("  4. Test with frontend/agents");
    console.log();

    console.log("💡 Example API Response:");
    console.log("  GET /game/" + gameData.merkleRoot.substring(0, 10) + ".../proof/5");
    console.log("  →", JSON.stringify({
        caseIndex: 5,
        proof: {
            pA: ["0x...", "0x..."],
            pB: [["0x...", "0x..."], ["0x...", "0x..."]],
            pC: ["0x...", "0x..."],
            publicSignals: gameData.proofs[5].publicSignals
        }
    }, null, 2).split('\n').map((line, i) => i === 0 ? line : '  ' + line).join('\n'));
    console.log();
}

// Run
createGameWithProofs()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Error:", error.message);
        console.error(error.stack);
        process.exit(1);
    });
