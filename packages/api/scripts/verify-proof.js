#!/usr/bin/env node

/**
 * Verify ZK Proof (Off-chain Verification)
 *
 * Verifies a ZK proof against the verification key without sending onchain.
 * Useful for testing proof generation before submitting transactions.
 *
 * Usage:
 *   node scripts/verify-proof.js --game ./game-setup.json --case 5
 *   node scripts/verify-proof.js --game ./game-setup.json --all
 */

const fs = require("fs");
const path = require("path");
const snarkjs = require("snarkjs");

// Verification key location
const VKEY_PATH = path.resolve(__dirname, "../../circuits/build/verification_key.json");

// CLI args
const args = process.argv.slice(2);
const gameFileArg = args[args.indexOf("--game") + 1];
const caseIndexArg = args[args.indexOf("--case") + 1];
const verifyAll = args.includes("--all");

if (!gameFileArg || (!caseIndexArg && !verifyAll)) {
  console.error("Usage: node verify-proof.js --game <file> --case <index>");
  console.error("   or: node verify-proof.js --game <file> --all");
  console.error("");
  console.error("Examples:");
  console.error("  node verify-proof.js --game ./game-setup.json --case 5");
  console.error("  node verify-proof.js --game ./game-setup.json --all");
  process.exit(1);
}

async function verifyProof(caseIndex, proofData, vkey) {
  if (proofData.mock) {
    return { valid: false, reason: "MOCK proof (circuits not built)" };
  }

  try {
    const valid = await snarkjs.groth16.verify(
      vkey,
      proofData.publicSignals,
      proofData.proof
    );

    return { valid, reason: valid ? "OK" : "Invalid proof" };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
}

async function main() {
  // Load game setup
  const gamePath = path.resolve(gameFileArg);
  const gameSetup = JSON.parse(fs.readFileSync(gamePath, "utf8"));

  // Load verification key
  if (!fs.existsSync(VKEY_PATH)) {
    console.error("❌ Verification key not found");
    console.error(`   Expected: ${VKEY_PATH}`);
    console.error("   Run: cd packages/circuits && npm run setup");
    process.exit(1);
  }

  const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));

  if (verifyAll) {
    // Verify all 26 proofs
    console.log("═══════════════════════════════════════════════════════");
    console.log("  Verifying All Proofs");
    console.log("═══════════════════════════════════════════════════════\n");

    let passed = 0;
    let failed = 0;

    for (let i = 0; i < gameSetup.proofs.length; i++) {
      const proofData = gameSetup.proofs[i];
      process.stdout.write(`Case ${String(i).padStart(2)}: `);

      const result = await verifyProof(i, proofData, vkey);

      if (result.valid) {
        process.stdout.write(`✅ VALID\n`);
        passed++;
      } else {
        process.stdout.write(`❌ FAILED (${result.reason})\n`);
        failed++;
      }
    }

    console.log("");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log("═══════════════════════════════════════════════════════");

    process.exit(failed > 0 ? 1 : 0);
  } else {
    // Verify single proof
    const caseIndex = parseInt(caseIndexArg, 10);
    const proofData = gameSetup.proofs.find(p => p.caseIndex === caseIndex);

    if (!proofData) {
      console.error(`❌ No proof found for case ${caseIndex}`);
      process.exit(1);
    }

    console.log("═══════════════════════════════════════════════════════");
    console.log("  Verifying Proof");
    console.log("═══════════════════════════════════════════════════════\n");

    console.log(`Case Index: ${caseIndex}`);
    console.log(`Value: ${proofData.value} wei`);
    console.log(`Mock: ${proofData.mock ? "YES (will fail onchain)" : "NO"}`);
    console.log("");

    const result = await verifyProof(caseIndex, proofData, vkey);

    if (result.valid) {
      console.log("✅ PROOF VALID");
      console.log("");
      console.log("This proof will verify onchain.");
      process.exit(0);
    } else {
      console.log("❌ PROOF INVALID");
      console.log(`Reason: ${result.reason}`);
      console.log("");
      console.log("This proof will FAIL onchain verification.");
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});
