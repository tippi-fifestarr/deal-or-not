#!/usr/bin/env node

/**
 * Build script for the CaseReveal circuit.
 *
 * Prerequisites:
 *   - circom 2.1.6+ installed (brew install circom or cargo install circom)
 *   - snarkjs (npm install)
 *   - Powers of Tau ceremony file (downloaded below if missing)
 *
 * Steps:
 *   1. Compile circom → R1CS + WASM
 *   2. Setup Groth16 (trusted setup with Powers of Tau)
 *   3. Export Solidity verifier
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

const CIRCUIT_NAME = "case-reveal";
const BUILD_DIR = path.join(__dirname, "..", "build");
const CIRCUITS_DIR = path.join(__dirname, "..", "circuits");
const CONTRACTS_DIR = path.join(__dirname, "..", "..", "foundry", "contracts");

// Powers of Tau file (Hermez ceremony, sufficient for small circuits)
const PTAU_URL =
  "https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau";
const PTAU_FILE = path.join(BUILD_DIR, "powersOfTau28_hez_final_14.ptau");

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

function downloadPtau() {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(PTAU_FILE)) {
      console.log("Powers of Tau file already exists, skipping download.");
      return resolve();
    }
    console.log("Downloading Powers of Tau file...");
    const file = fs.createWriteStream(PTAU_FILE);
    https
      .get(PTAU_URL, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          https
            .get(response.headers.location, (res) => {
              res.pipe(file);
              file.on("finish", () => {
                file.close();
                resolve();
              });
            })
            .on("error", reject);
        } else {
          response.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
        }
      })
      .on("error", reject);
  });
}

async function main() {
  // Create build directory
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  }

  // Step 0: Download Powers of Tau
  await downloadPtau();

  // Step 1: Compile circuit
  console.log("\n=== Compiling circuit ===");
  const CIRCOMLIB_PATH = path.join(__dirname, "..", "..", "..", "node_modules", "circomlib", "circuits");
  run(
    `circom ${CIRCUITS_DIR}/${CIRCUIT_NAME}.circom ` +
      `--r1cs --wasm --sym --output ${BUILD_DIR} ` +
      `-l ${CIRCOMLIB_PATH}`
  );

  // Step 2: Groth16 setup
  console.log("\n=== Groth16 Setup ===");
  run(
    `npx snarkjs groth16 setup ` +
      `${BUILD_DIR}/${CIRCUIT_NAME}.r1cs ` +
      `${PTAU_FILE} ` +
      `${BUILD_DIR}/${CIRCUIT_NAME}_0000.zkey`
  );

  // Contribute to ceremony (single contribution for dev, use multi for prod)
  run(
    `npx snarkjs zkey contribute ` +
      `${BUILD_DIR}/${CIRCUIT_NAME}_0000.zkey ` +
      `${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey ` +
      `--name="Deal or No Deal dev ceremony" -v -e="$(date)"`
  );

  // Export verification key
  run(
    `npx snarkjs zkey export verificationkey ` +
      `${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey ` +
      `${BUILD_DIR}/verification_key.json`
  );

  // Step 3: Export Solidity verifier
  console.log("\n=== Exporting Solidity Verifier ===");
  run(
    `npx snarkjs zkey export solidityverifier ` +
      `${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey ` +
      `${CONTRACTS_DIR}/CaseRevealVerifier.sol`
  );

  // Patch the contract name in the generated file
  const verifierPath = path.join(CONTRACTS_DIR, "CaseRevealVerifier.sol");
  let verifierSrc = fs.readFileSync(verifierPath, "utf8");
  verifierSrc = verifierSrc.replace(
    /contract Groth16Verifier/,
    "contract CaseRevealVerifier"
  );
  fs.writeFileSync(verifierPath, verifierSrc);

  console.log("\n=== Build complete ===");
  console.log(`R1CS:        ${BUILD_DIR}/${CIRCUIT_NAME}.r1cs`);
  console.log(`WASM:        ${BUILD_DIR}/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm`);
  console.log(`zKey:        ${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey`);
  console.log(`Verifier:    ${CONTRACTS_DIR}/CaseRevealVerifier.sol`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
