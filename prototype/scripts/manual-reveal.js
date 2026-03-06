#!/usr/bin/env node
/**
 * Manual case value calculator (replaces CRE workflow)
 * Usage: node manual-reveal.js <gameId> <caseIndex>
 */

// Use viem from frontend node_modules
const path = require('path');
const viemPath = path.join(__dirname, '../frontend/node_modules/viem');
const { keccak256, encodePacked } = require(viemPath);

const CASE_VALUES_CENTS = [1n, 5n, 10n, 50n, 100n];
const NUM_CASES = 5;

function collapseCase(vrfSeed, caseIndex, usedBitmap) {
  let remaining = 0;
  for (let i = 0; i < NUM_CASES; i++) {
    if ((usedBitmap & (1n << BigInt(i))) === 0n) remaining++;
  }
  if (remaining === 0) throw new Error("No values remaining");

  const hash = keccak256(
    encodePacked(
      ["uint256", "uint8", "uint256"],
      [vrfSeed, caseIndex, usedBitmap]
    )
  );
  const pick = BigInt(hash) % BigInt(remaining);

  let count = 0n;
  for (let i = 0; i < NUM_CASES; i++) {
    if ((usedBitmap & (1n << BigInt(i))) === 0n) {
      if (count === pick) {
        return CASE_VALUES_CENTS[i];
      }
      count++;
    }
  }

  throw new Error("Unreachable: no value found");
}

// Parse CLI args
const [gameId, caseIndex, vrfSeed, usedBitmap] = process.argv.slice(2);

if (!gameId || !caseIndex || !vrfSeed || !usedBitmap) {
  console.log('Usage: node manual-reveal.js <gameId> <caseIndex> <vrfSeed> <usedBitmap>');
  process.exit(1);
}

const value = collapseCase(BigInt(vrfSeed), Number(caseIndex), BigInt(usedBitmap));
console.log(value.toString());
