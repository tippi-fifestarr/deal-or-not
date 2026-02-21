#!/usr/bin/env node

/**
 * Host Game Creation Script
 *
 * Generates a complete Deal or No Deal game setup including:
 * - Random salts for all 26 cases
 * - Prize distribution across cases
 * - Merkle tree commitment
 * - Pre-generated ZK proofs for all cases
 *
 * Usage:
 *   node scripts/create-game.js --prize-pool 1.0
 *   node scripts/create-game.js --prize-pool 0.5 --output ./my-game.json
 */

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

// Import ZK service
const zkService = require("../src/zk-service");

// CLI args
const args = process.argv.slice(2);
const prizePoolArg = args[args.indexOf("--prize-pool") + 1];
const outputArg = args[args.indexOf("--output") + 1] || "./game-setup.json";

if (!prizePoolArg) {
  console.error("Usage: node create-game.js --prize-pool <ETH>");
  console.error("Example: node create-game.js --prize-pool 1.0");
  process.exit(1);
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Deal or No Deal — Game Setup Generator");
  console.log("═══════════════════════════════════════════════════════\n");

  const prizePoolEth = parseFloat(prizePoolArg);
  const prizePoolWei = ethers.parseEther(prizePoolEth.toString());

  console.log(`Prize Pool: ${prizePoolEth} ETH (${prizePoolWei} wei)`);
  console.log("");

  // Step 1: Setup game (generate salts, distribute prizes, build tree)
  console.log("Step 1/4: Generating game data...");
  const { caseValues, salts, tree, merkleRoot } = await zkService.setupGame(prizePoolWei);

  console.log(`✓ Generated 26 random salts`);
  console.log(`✓ Distributed prize pool across cases`);
  console.log(`✓ Built Merkle tree`);
  console.log(`✓ Merkle Root: ${merkleRoot.toString()}`);
  console.log("");

  // Step 2: Preview case distribution
  console.log("Step 2/4: Case value distribution:");
  console.log("┌──────┬─────────────┬──────────┐");
  console.log("│ Case │    Value    │  % Pool  │");
  console.log("├──────┼─────────────┼──────────┤");

  for (let i = 0; i < zkService.NUM_CASES; i++) {
    const valueEth = ethers.formatEther(caseValues[i]);
    const pct = (Number(caseValues[i]) * 100 / Number(prizePoolWei)).toFixed(2);
    console.log(`│  ${String(i).padStart(2)}  │ ${valueEth.padStart(11)} │ ${String(pct).padStart(6)}%  │`);
  }

  console.log("└──────┴─────────────┴──────────┘");
  console.log("");

  // Step 3: Generate proofs for all cases
  console.log("Step 3/4: Generating ZK proofs (this may take 30-60s)...");
  const proofs = [];
  const startTime = Date.now();

  for (let i = 0; i < zkService.NUM_CASES; i++) {
    process.stdout.write(`  Generating proof ${i + 1}/26...`);

    const proofData = await zkService.generateProof(
      i,
      caseValues[i],
      salts[i],
      tree
    );

    proofs.push({
      caseIndex: i,
      value: caseValues[i].toString(),
      proof: proofData.proof,
      publicSignals: proofData.publicSignals,
      mock: proofData.mock || false,
    });

    process.stdout.write(` ✓ (${((Date.now() - startTime) / (i + 1)).toFixed(0)}ms avg)\n`);
  }

  const totalTime = Date.now() - startTime;
  console.log(`✓ All proofs generated in ${(totalTime / 1000).toFixed(1)}s`);
  console.log("");

  // Step 4: Save game setup
  console.log("Step 4/4: Saving game setup...");

  const gameSetup = {
    version: "1.0.0",
    createdAt: new Date().toISOString(),
    prizePool: {
      wei: prizePoolWei.toString(),
      eth: prizePoolEth.toString(),
    },
    merkleRoot: merkleRoot.toString(),
    merkleRootHex: "0x" + merkleRoot.toString(16).padStart(64, "0"),
    caseValues: caseValues.map((v, i) => ({
      caseIndex: i,
      value: v.toString(),
      valueEth: ethers.formatEther(v),
    })),
    salts: salts.map(s => s.toString()),
    proofs,
    tree: {
      depth: zkService.MERKLE_DEPTH,
      leaves: tree.leaves.map(l => l.toString()),
      // Note: storing full tree layers for debugging, but only merkleRoot is needed onchain
    },
    warnings: proofs[0].mock ? [
      "⚠️  MOCK PROOFS: Circuit artifacts not found. These proofs will NOT verify onchain.",
      "    Run 'cd packages/circuits && npm run setup' to build real circuits."
    ] : [],
  };

  const outputPath = path.resolve(outputArg);
  fs.writeFileSync(outputPath, JSON.stringify(gameSetup, null, 2));

  console.log(`✓ Game setup saved to: ${outputPath}`);
  console.log("");

  // Summary
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Setup Complete!");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
  console.log("Merkle Root (for createGame):");
  console.log(`  ${gameSetup.merkleRootHex}`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Call factory.createGame() with this merkleRoot");
  console.log("  2. Store this JSON file securely");
  console.log("  3. During gameplay, use proofs from this file for openCase()");
  console.log("");

  if (proofs[0].mock) {
    console.log("⚠️  WARNING: Using mock proofs (circuits not built)");
    console.log("   For production, run: cd packages/circuits && npm run setup");
    console.log("");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Error:", err);
    process.exit(1);
  });
