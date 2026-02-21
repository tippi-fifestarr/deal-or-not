/**
 * ZK proof generation service for Deal or No Deal.
 *
 * Builds a 32-leaf Poseidon Merkle tree (26 case values + 6 zero-padded leaves)
 * and generates Groth16 proofs using snarkjs for case reveals.
 *
 * Falls back to a mock implementation if circuit build artifacts are not present,
 * so development and testing can proceed without running the circuit build.
 */

const fs = require("fs");
const path = require("path");

const MERKLE_DEPTH = 5; // 2^5 = 32 leaves
const NUM_CASES = 26;
const TOTAL_LEAVES = 2 ** MERKLE_DEPTH; // 32

const CIRCUIT_WASM = path.resolve(
  __dirname,
  "../../circuits/build/case-reveal_js/case-reveal.wasm"
);
const CIRCUIT_ZKEY = path.resolve(
  __dirname,
  "../../circuits/build/case-reveal_final.zkey"
);

let poseidonHash = null;
let snarkjs = null;
let circuitsAvailable = false;

/**
 * Lazy-initialize Poseidon hasher and check for circuit artifacts.
 * circomlibjs Poseidon init is async, so we defer until first use.
 */
async function init() {
  if (poseidonHash) return;

  const { buildPoseidon } = require("circomlibjs");
  const poseidon = await buildPoseidon();

  // poseidon.F.toObject converts the internal field element to a BigInt
  poseidonHash = (...inputs) => poseidon.F.toObject(poseidon(inputs));

  try {
    snarkjs = require("snarkjs");
  } catch {
    console.warn("[zk] snarkjs not available, using mock proofs");
  }

  circuitsAvailable =
    snarkjs && fs.existsSync(CIRCUIT_WASM) && fs.existsSync(CIRCUIT_ZKEY);

  if (!circuitsAvailable) {
    console.warn("[zk] Circuit artifacts not found. Using MOCK proof generation.");
    console.warn(`[zk]   Expected WASM: ${CIRCUIT_WASM}`);
    console.warn(`[zk]   Expected zKey: ${CIRCUIT_ZKEY}`);
  } else {
    console.log("[zk] Circuit artifacts loaded. Real proof generation enabled.");
  }
}

// ============ Merkle Tree ============

/**
 * Compute a Poseidon leaf: Poseidon(caseIndex, value, salt)
 * @param {number} caseIndex
 * @param {bigint} value
 * @param {bigint} salt
 * @returns {bigint}
 */
async function computeLeaf(caseIndex, value, salt) {
  await init();
  return poseidonHash(BigInt(caseIndex), BigInt(value), BigInt(salt));
}

/**
 * Build a 32-leaf Poseidon Merkle tree from 26 case values + salts.
 *
 * The tree has depth 5 (32 leaves). Leaves 0-25 are Poseidon(i, values[i], salts[i]).
 * Leaves 26-31 are zero (padded).
 *
 * @param {bigint[]} caseValues Array of 26 case values (in wei)
 * @param {bigint[]} salts Array of 26 random salts
 * @returns {Promise<{leaves: bigint[], layers: bigint[][], root: bigint}>}
 */
async function buildMerkleTree(caseValues, salts) {
  await init();

  if (caseValues.length !== NUM_CASES) {
    throw new Error(`Expected ${NUM_CASES} case values, got ${caseValues.length}`);
  }
  if (salts.length !== NUM_CASES) {
    throw new Error(`Expected ${NUM_CASES} salts, got ${salts.length}`);
  }

  // Build leaves
  const leaves = new Array(TOTAL_LEAVES);
  for (let i = 0; i < NUM_CASES; i++) {
    leaves[i] = poseidonHash(BigInt(i), BigInt(caseValues[i]), BigInt(salts[i]));
  }
  // Pad remaining leaves with 0
  for (let i = NUM_CASES; i < TOTAL_LEAVES; i++) {
    leaves[i] = BigInt(0);
  }

  // Build tree bottom-up
  const layers = [leaves.slice()];
  let currentLayer = leaves.slice();

  for (let depth = 0; depth < MERKLE_DEPTH; depth++) {
    const nextLayer = [];
    for (let i = 0; i < currentLayer.length; i += 2) {
      const left = currentLayer[i];
      const right = currentLayer[i + 1];
      nextLayer.push(poseidonHash(left, right));
    }
    layers.push(nextLayer);
    currentLayer = nextLayer;
  }

  const root = currentLayer[0];
  return { leaves, layers, root };
}

/**
 * Get the Merkle root from a tree object.
 * @param {{root: bigint}} tree
 * @returns {bigint}
 */
function getMerkleRoot(tree) {
  return tree.root;
}

/**
 * Extract the Merkle proof (path elements and path indices) for a given leaf index.
 * @param {{layers: bigint[][]}} tree
 * @param {number} leafIndex
 * @returns {{pathElements: bigint[], pathIndices: number[]}}
 */
function getMerkleProof(tree, leafIndex) {
  const pathElements = [];
  const pathIndices = [];
  let idx = leafIndex;

  for (let depth = 0; depth < MERKLE_DEPTH; depth++) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;

    pathElements.push(tree.layers[depth][siblingIdx]);
    pathIndices.push(isRight ? 1 : 0);

    idx = Math.floor(idx / 2);
  }

  return { pathElements, pathIndices };
}

// ============ Proof Generation ============

/**
 * Generate a Groth16 proof that a case contains a specific value.
 *
 * If circuit artifacts are not available, returns a mock proof that matches
 * the expected format but will NOT verify onchain.
 *
 * @param {number} caseIndex Which case to prove (0-25)
 * @param {bigint} value The case value
 * @param {bigint} salt The salt used when building the tree
 * @param {{layers: bigint[][], root: bigint}} tree The Merkle tree
 * @returns {Promise<{proof: {pA: string[], pB: string[][], pC: string[]}, publicSignals: string[], mock: boolean}>}
 */
async function generateProof(caseIndex, value, salt, tree) {
  await init();

  const { pathElements, pathIndices } = getMerkleProof(tree, caseIndex);

  // Circuit inputs
  const input = {
    // Private inputs
    salt: salt.toString(),
    pathElements: pathElements.map((e) => e.toString()),
    pathIndices: pathIndices,
    // Public inputs
    caseIndex: caseIndex.toString(),
    merkleRoot: tree.root.toString(),
    value: value.toString(),
  };

  if (circuitsAvailable) {
    // Real proof generation
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      CIRCUIT_WASM,
      CIRCUIT_ZKEY
    );

    // Convert to the format the contract expects (flat arrays of strings)
    return {
      proof: formatProofForContract(proof),
      publicSignals,
      mock: false,
    };
  }

  // Mock proof for development
  return generateMockProof(caseIndex, value, tree.root);
}

/**
 * Format a snarkjs proof object into the contract's (pA, pB, pC) format.
 * @param {object} proof snarkjs proof object
 * @returns {{pA: string[], pB: string[][], pC: string[]}}
 */
function formatProofForContract(proof) {
  return {
    pA: [proof.pi_a[0], proof.pi_a[1]],
    pB: [
      [proof.pi_b[0][1], proof.pi_b[0][0]], // NOTE: snarkjs reverses B coords
      [proof.pi_b[1][1], proof.pi_b[1][0]],
    ],
    pC: [proof.pi_c[0], proof.pi_c[1]],
  };
}

/**
 * Generate a mock proof for development when circuit artifacts are missing.
 * The proof will have the correct structure but will NOT verify onchain.
 *
 * @param {number} caseIndex
 * @param {bigint} value
 * @param {bigint} merkleRoot
 * @returns {{proof: {pA: string[], pB: string[][], pC: string[]}, publicSignals: string[], mock: boolean}}
 */
function generateMockProof(caseIndex, value, merkleRoot) {
  console.warn(`[zk] Generating MOCK proof for case ${caseIndex} (will not verify onchain)`);

  return {
    proof: {
      pA: ["0", "0"],
      pB: [
        ["0", "0"],
        ["0", "0"],
      ],
      pC: ["0", "0"],
    },
    publicSignals: [
      caseIndex.toString(),
      merkleRoot.toString(),
      value.toString(),
      value.toString(), // revealedValue == value
    ],
    mock: true,
  };
}

// ============ Game Setup Helpers ============

/**
 * Generate random salts for all 26 cases.
 * Uses crypto.randomBytes for secure randomness.
 * @returns {bigint[]}
 */
function generateSalts() {
  const crypto = require("crypto");
  const salts = [];
  for (let i = 0; i < NUM_CASES; i++) {
    // 31 bytes to stay within the BN128 field
    const buf = crypto.randomBytes(31);
    salts.push(BigInt("0x" + buf.toString("hex")));
  }
  return salts;
}

/**
 * Show-accurate prize distribution as basis points, matching GameTypes.sol.
 * Returns the bps value for a given case index.
 * @param {number} index 0-25
 * @returns {number}
 */
function prizeDistributionBps(index) {
  const bps = [
    1, 1, 2, 3, 7, 14, 21, 28, 56, 83, 111, 139, 208, 278, 556, 695, 834,
    973, 1112, 1251, 834, 695, 556, 417, 695, 330,
  ];
  return bps[index] || 0;
}

/**
 * Distribute a prize pool across 26 cases using the show-accurate distribution.
 * Matches the onchain _distributePrizePool() logic.
 * @param {bigint} prizePool Total pool in wei
 * @returns {bigint[]} 26 case values in wei
 */
function distributePrizePool(prizePool) {
  let totalBps = 0;
  for (let i = 0; i < NUM_CASES; i++) {
    totalBps += prizeDistributionBps(i);
  }

  const values = [];
  for (let i = 0; i < NUM_CASES; i++) {
    values.push((BigInt(prizePool) * BigInt(prizeDistributionBps(i))) / BigInt(totalBps));
  }
  return values;
}

/**
 * Full game setup: generate salts, distribute prizes, build Merkle tree.
 * Returns everything the host needs to create a game onchain and later
 * generate proofs for case reveals.
 *
 * @param {bigint} prizePool Total pool in wei
 * @returns {Promise<{caseValues: bigint[], salts: bigint[], tree: object, merkleRoot: bigint}>}
 */
async function setupGame(prizePool) {
  const caseValues = distributePrizePool(prizePool);
  const salts = generateSalts();
  const tree = await buildMerkleTree(caseValues, salts);
  const merkleRoot = getMerkleRoot(tree);

  return { caseValues, salts, tree, merkleRoot };
}

module.exports = {
  init,
  buildMerkleTree,
  getMerkleRoot,
  getMerkleProof,
  generateProof,
  generateSalts,
  distributePrizePool,
  setupGame,
  computeLeaf,
  formatProofForContract,
  NUM_CASES,
  MERKLE_DEPTH,
};
