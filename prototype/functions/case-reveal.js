// SPDX-License-Identifier: MIT
// Chainlink Functions script for revealing case values
// Uses DON-hosted threshold-encrypted secrets

// Arguments passed from contract:
// args[0] = gameId (string)
// args[1] = caseIndex (string, 0-4)

if (!secrets.CASE_VALUES) {
  throw Error("CASE_VALUES secret not configured");
}

const gameId = args[0];
const caseIndex = parseInt(args[1]);

// Parse encrypted case values from DON secret
// Format: JSON object with gameId keys
// Example: { "0": [1, 5, 10, 50, 100], "1": [10, 1, 50, 5, 100] }
const allGameValues = JSON.parse(secrets.CASE_VALUES);

// Get case values for this game
const gameValues = allGameValues[gameId];
if (!gameValues) {
  throw Error(`No case values found for game ${gameId}`);
}

if (caseIndex < 0 || caseIndex >= gameValues.length) {
  throw Error(`Invalid case index: ${caseIndex}`);
}

// Return the revealed case value
const caseValue = gameValues[caseIndex];

// Encode as uint256 for Solidity
return Functions.encodeUint256(caseValue);
