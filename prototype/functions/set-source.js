#!/usr/bin/env node

/**
 * Set Chainlink Functions source code in DealOrNotConfidential contract
 *
 * Usage:
 *   node set-source.js --contract 0x...
 */

const fs = require("fs");
const ethers = require("ethers");
require("dotenv").config();

// Configuration
const RPC_URL = process.env.RPC_URL || "https://base-sepolia.g.alchemy.com/v2/YOUR_KEY";

// Parse CLI args
const args = process.argv.slice(2);
const contractArg = args.find(a => a.startsWith("--contract="));
if (!contractArg) {
  console.error("❌ Error: --contract argument required");
  console.log("Usage: node set-source.js --contract=0x...");
  process.exit(1);
}
const contractAddress = contractArg.split("=")[1];

// Minimal ABI for setFunctionsSource
const ABI = [
  "function setFunctionsSource(string source) external",
  "function s_functionsSource() external view returns (string)"
];

async function main() {
  console.log(`\n📝 Setting Functions source code\n`);
  console.log(`Contract: ${contractAddress}`);

  // Read source code
  const sourcePath = "./case-reveal.js";
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  const source = fs.readFileSync(sourcePath, "utf8");
  console.log(`Source file: ${sourcePath}`);
  console.log(`Source length: ${source.length} bytes\n`);

  // Setup provider and signer
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "0x", provider);
  const contract = new ethers.Contract(contractAddress, ABI, wallet);

  console.log("Sending transaction...");

  // Set source code
  const tx = await contract.setFunctionsSource(source);
  console.log(`Transaction hash: ${tx.hash}`);

  console.log("Waiting for confirmation...");
  const receipt = await tx.wait();

  if (receipt.status === 1) {
    console.log("✅ Source code set successfully!");
    console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
    console.log(`   Block: ${receipt.blockNumber}`);

    // Verify by reading back
    console.log("\n🔍 Verifying...");
    const storedSource = await contract.s_functionsSource();
    if (storedSource === source) {
      console.log("✅ Source code verified on-chain");
      console.log(`   Stored length: ${storedSource.length} bytes`);
    } else {
      console.log("⚠️  Warning: Stored source doesn't match local file");
    }
  } else {
    console.log("❌ Transaction failed");
  }

  console.log("\n✨ Next step: Upload encrypted secrets");
  console.log("   node upload-secrets.js --gameId=0");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
