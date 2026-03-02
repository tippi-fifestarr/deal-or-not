#!/usr/bin/env node

/**
 * Upload encrypted case values to Chainlink Functions DON
 *
 * Usage:
 *   node upload-secrets.js --gameId 0
 *
 * This script:
 * 1. Generates randomized case values for a game
 * 2. Encrypts them using DON public key (threshold encryption)
 * 3. Uploads to DON secrets endpoint
 * 4. Prints secret reference for verification
 */

const { SecretsManager } = require("@chainlink/functions-toolkit");
const ethers = require("ethers");
require("dotenv").config();

// Configuration
const RPC_URL = process.env.RPC_URL || "https://base-sepolia.g.alchemy.com/v2/YOUR_KEY";
const ROUTER_ADDRESS = process.env.FUNCTIONS_ROUTER || "0xf9B8fc078197181C841c296C876945aaa425B278"; // Base Sepolia
const DON_ID = process.env.DON_ID || "fun-base-sepolia-1";
const GATEWAY_URLS = [
  "https://01.functions-gateway.testnet.chain.link/",
  "https://02.functions-gateway.testnet.chain.link/"
];

// Parse CLI args
const args = process.argv.slice(2);
const gameIdArg = args.find(a => a.startsWith("--gameId="));
const gameId = gameIdArg ? gameIdArg.split("=")[1] : "0";

async function main() {
  console.log(`\n🎲 Generating encrypted case values for Game #${gameId}\n`);

  // 1. Generate random case values (shuffle of [1, 5, 10, 50, 100])
  const baseValues = [1, 5, 10, 50, 100];
  const shuffledValues = shuffle([...baseValues]);

  console.log("Generated case values (in USD cents):");
  shuffledValues.forEach((val, idx) => {
    console.log(`  Case ${idx}: $${(val / 100).toFixed(2)}`);
  });

  // 2. Create secrets JSON
  // We'll store ALL game values in one secret object
  // Format: { "0": [values], "1": [values], ... }

  // For now, just create this one game's values
  // In production, you'd append to existing secrets or use per-game secrets
  const secretsObject = {
    [gameId]: shuffledValues
  };

  const secretsJson = JSON.stringify(secretsObject);

  console.log(`\n📦 Secrets JSON (length: ${secretsJson.length} bytes)`);
  console.log(secretsJson);

  // 3. Setup provider and SecretsManager
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "0x", provider);

  const secretsManager = new SecretsManager({
    signer: wallet,
    functionsRouterAddress: ROUTER_ADDRESS,
    donId: DON_ID,
  });

  await secretsManager.initialize();

  console.log("\n🔐 Encrypting secrets with DON public key...");

  // 4. Encrypt secrets
  const encryptedSecretsObj = await secretsManager.encryptSecrets({
    CASE_VALUES: secretsJson
  });

  console.log("✅ Secrets encrypted successfully");
  console.log(`   Encrypted payload size: ${encryptedSecretsObj.encrypted.length} bytes`);

  // 5. Upload to DON
  console.log("\n📤 Uploading to DON gateway...");

  const uploadResult = await secretsManager.uploadEncryptedSecretsToDON({
    encryptedSecretsHexstring: encryptedSecretsObj.encrypted,
    gatewayUrls: GATEWAY_URLS,
    slotId: 0, // Default slot
    minutesUntilExpiration: 60 * 24 * 7, // 7 days
  });

  if (!uploadResult.success) {
    throw new Error(`Upload failed: ${JSON.stringify(uploadResult)}`);
  }

  console.log("✅ Secrets uploaded successfully!");
  console.log(`   Version: ${uploadResult.version}`);
  console.log(`   Expiration: ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()}`);

  // 6. Verification
  console.log("\n📋 Summary:");
  console.log(`   Game ID: ${gameId}`);
  console.log(`   Case Values: [${shuffledValues.join(", ")}] cents`);
  console.log(`   DON ID: ${DON_ID}`);
  console.log(`   Slot ID: 0`);
  console.log(`   Secret Key: CASE_VALUES`);

  console.log("\n✨ Ready for on-chain gameplay!");
  console.log("\nNext steps:");
  console.log("1. Deploy DealOrNotConfidential.sol");
  console.log("2. Set Functions source code: setFunctionsSource()");
  console.log("3. Create game on-chain: createGame()");
  console.log("4. Play game - case reveals will decrypt from DON");

  console.log("\n🔍 To verify secrets are stored:");
  console.log(`   const ref = await secretsManager.listDONHostedEncryptedSecrets(GATEWAY_URLS[0]);`);
  console.log(`   console.log(ref);`);
}

/**
 * Fisher-Yates shuffle
 */
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Run
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
