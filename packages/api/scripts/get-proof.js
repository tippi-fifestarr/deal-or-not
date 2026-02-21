#!/usr/bin/env node

/**
 * Get Proof for Case Opening
 *
 * Retrieves the ZK proof for a specific case from a game setup file.
 * Used by hosts during gameplay to submit proofs for openCase() transactions.
 *
 * Usage:
 *   node scripts/get-proof.js --game ./game-setup.json --case 5
 *   node scripts/get-proof.js --game ./game-setup.json --case 5 --format cast
 */

const fs = require("fs");
const path = require("path");

// CLI args
const args = process.argv.slice(2);
const gameFileArg = args[args.indexOf("--game") + 1];
const caseIndexArg = args[args.indexOf("--case") + 1];
const formatArg = args[args.indexOf("--format") + 1] || "json";

if (!gameFileArg || !caseIndexArg) {
  console.error("Usage: node get-proof.js --game <file> --case <index>");
  console.error("Options:");
  console.error("  --format json     Output JSON (default)");
  console.error("  --format cast     Output cast command arguments");
  console.error("");
  console.error("Example:");
  console.error("  node get-proof.js --game ./game-setup.json --case 5");
  process.exit(1);
}

const caseIndex = parseInt(caseIndexArg, 10);

try {
  // Load game setup
  const gamePath = path.resolve(gameFileArg);
  const gameSetup = JSON.parse(fs.readFileSync(gamePath, "utf8"));

  // Find proof for this case
  const proofData = gameSetup.proofs.find(p => p.caseIndex === caseIndex);

  if (!proofData) {
    console.error(`❌ No proof found for case ${caseIndex}`);
    console.error(`   Available cases: 0-${gameSetup.proofs.length - 1}`);
    process.exit(1);
  }

  if (proofData.mock) {
    console.error("⚠️  WARNING: This is a MOCK proof and will NOT verify onchain!");
  }

  // Output based on format
  if (formatArg === "cast") {
    // Format for cast send command
    const { pA, pB, pC } = proofData.proof;
    const value = proofData.value;

    console.log("Cast arguments for openCase():");
    console.log("");
    console.log(`  caseIndex: ${caseIndex}`);
    console.log(`  value: ${value}`);
    console.log(`  pA: [${pA[0]}, ${pA[1]}]`);
    console.log(`  pB: [[${pB[0][0]}, ${pB[0][1]}], [${pB[1][0]}, ${pB[1][1]}]]`);
    console.log(`  pC: [${pC[0]}, ${pC[1]}]`);
    console.log("");
    console.log("Full command:");
    console.log(`cast send $GAME "openCase(uint256,uint256,uint256[2],uint256[2][2],uint256[2])" \\`);
    console.log(`  ${caseIndex} \\`);
    console.log(`  ${value} \\`);
    console.log(`  "[${pA[0]},${pA[1]}]" \\`);
    console.log(`  "[[${pB[0][0]},${pB[0][1]}],[${pB[1][0]},${pB[1][1]}]]" \\`);
    console.log(`  "[${pC[0]},${pC[1]}]" \\`);
    console.log(`  --private-key $HOST_PK --rpc-url http://127.0.0.1:8545`);
  } else {
    // JSON format
    console.log(JSON.stringify({
      caseIndex: proofData.caseIndex,
      value: proofData.value,
      proof: proofData.proof,
      publicSignals: proofData.publicSignals,
      mock: proofData.mock,
    }, null, 2));
  }
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}
