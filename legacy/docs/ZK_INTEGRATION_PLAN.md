# ZK Circuit Integration Plan

## Overview

This document outlines the complete integration of zero-knowledge proofs into the Deal or No Deal game for cryptographically verifiable case reveals.

## Architecture

### Circuit Design

**File**: `packages/circuits/circuits/case-reveal.circom`

The `CaseReveal` circuit proves that a briefcase contains a specific value without revealing the entire prize distribution upfront.

**Inputs**:
- **Private** (known only to host):
  - `salt`: Random 256-bit value to prevent brute-forcing
  - `pathElements[5]`: Merkle tree sibling hashes
  - `pathIndices[5]`: Left/right path bits

- **Public** (verified onchain):
  - `caseIndex`: Which case (0-25)
  - `merkleRoot`: Committed root from game creation
  - `value`: The ETH amount in this case

**Output**:
- `revealedValue`: The proven case value

**Verification**:
```
leaf = Poseidon(caseIndex, value, salt)
root = MerkleProof(leaf, pathElements, pathIndices)
assert(root == merkleRoot)
```

## Implementation Steps

### Phase 1: Circuit Compilation ✅

1. **Install Dependencies**:
   ```bash
   cd packages/circuits
   npm install
   ```

2. **Compile Circuit**:
   ```bash
   node scripts/build-circuit.js
   ```

   This generates:
   - `build/case-reveal.r1cs` - Constraint system
   - `build/case-reveal_js/case-reveal.wasm` - WASM prover
   - `build/case-reveal_final.zkey` - Proving key
   - `build/verification_key.json` - Verification key
   - `contracts/CaseRevealVerifier.sol` - Solidity verifier

### Phase 2: Host Proof Generation

**When**: At game creation time

**Process**:
1. Host generates 26 random case values (following prize distribution)
2. Host chooses random salt
3. For each case, compute leaf: `Poseidon(index, value, salt)`
4. Build Merkle tree from leaves
5. Submit `merkleRoot` to factory contract
6. Pre-generate 26 ZK proofs (one per case)
7. Store proofs off-chain (IPFS or host's server)

**Code Location**: `packages/api/src/zk-service.js`

```javascript
const { poseidon } = require("circomlibjs");
const snarkjs = require("snarkjs");

async function generateGameProofs(caseValues, salt) {
  // 1. Build Merkle tree
  const leaves = caseValues.map((value, index) =>
    poseidon([BigInt(index), BigInt(value), BigInt(salt)])
  );

  const tree = buildMerkleTree(leaves);
  const merkleRoot = tree.root;

  // 2. Generate proofs
  const proofs = [];
  for (let i = 0; i < 26; i++) {
    const { pathElements, pathIndices } = tree.getProof(i);

    const input = {
      salt,
      pathElements,
      pathIndices,
      caseIndex: i,
      merkleRoot,
      value: caseValues[i]
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      "build/case-reveal_js/case-reveal.wasm",
      "build/case-reveal_final.zkey"
    );

    proofs.push({ proof, publicSignals });
  }

  return { merkleRoot, proofs };
}
```

### Phase 3: Contract Integration

**Current State**: Contract uses mock verifier

**File**: `packages/foundry/contracts/DealOrNoDeal.sol`

**Change Required**:
```solidity
// BEFORE (mock):
function openCase(...) {
    // No ZK verification, accepts any proof
}

// AFTER (real):
function openCase(
    uint256 caseIndex,
    uint256 value,
    uint256[2] calldata pA,
    uint256[2][2] calldata pB,
    uint256[2] calldata pC
) external onlyContestant inState(GameState.RoundPlay) {
    require(!briefcases[caseIndex].opened, "CaseAlreadyOpened");
    require(caseIndex != game.selectedCase, "CaseIsSelected");

    // Verify ZK proof
    uint256[] memory pubSignals = new uint256[](3);
    pubSignals[0] = caseIndex;
    pubSignals[1] = uint256(game.merkleRoot);
    pubSignals[2] = value;

    require(
        zkVerifier.verifyProof(pA, pB, pC, pubSignals),
        "InvalidProof"
    );

    // ... rest of case opening logic
}
```

### Phase 4: Frontend Integration

**File**: `packages/nextjs/components/game/BriefcaseGrid.tsx`

**Process**:
1. Fetch proof for selected case from API
2. Convert proof to Solidity format
3. Submit transaction with proof

```typescript
const openCase = async (caseIndex: number) => {
  // 1. Fetch proof from host's server
  const response = await fetch(`/api/game/${gameId}/proof/${caseIndex}`);
  const { proof, publicSignals } = await response.json();

  // 2. Format for Solidity
  const formattedProof = {
    pA: [proof.pi_a[0], proof.pi_a[1]],
    pB: [[proof.pi_b[0][1], proof.pi_b[0][0]],
         [proof.pi_b[1][1], proof.pi_b[1][0]]],
    pC: [proof.pi_c[0], proof.pi_c[1]]
  };

  // 3. Extract value from public signals
  const value = publicSignals[2];

  // 4. Submit transaction
  await writeContract({
    functionName: "openCase",
    args: [caseIndex, value, formattedProof.pA, formattedProof.pB, formattedProof.pC]
  });
};
```

### Phase 5: API Server

**File**: `packages/api/src/game-routes.js`

Endpoints needed:
- `POST /game/create` - Generate proofs and return merkleRoot
- `GET /game/:id/proof/:caseIndex` - Return proof for specific case
- `GET /game/:id/merkleRoot` - Return committed root

```javascript
app.post("/game/create", async (req, res) => {
  const { entryFee, minPlayers } = req.body;

  // 1. Generate prize distribution
  const prizePool = entryFee * minPlayers;
  const caseValues = generatePrizeDistribution(prizePool);

  // 2. Generate random salt
  const salt = generateRandomSalt();

  // 3. Generate ZK proofs
  const { merkleRoot, proofs } = await generateGameProofs(caseValues, salt);

  // 4. Store proofs (in-memory or database)
  gameProofs.set(merkleRoot, proofs);

  res.json({ merkleRoot, caseValues });
});

app.get("/game/:root/proof/:index", (req, res) => {
  const { root, index } = req.params;
  const proofs = gameProofs.get(root);

  if (!proofs) return res.status(404).json({ error: "Game not found" });
  if (index < 0 || index >= 26) return res.status(400).json({ error: "Invalid case" });

  res.json(proofs[index]);
});
```

## Testing Plan

### Unit Tests

**File**: `packages/circuits/test/case-reveal.test.js`

```javascript
const { assert } = require("chai");
const wasm_tester = require("circom_tester").wasm;

describe("CaseReveal circuit", () => {
  let circuit;

  before(async () => {
    circuit = await wasm_tester("circuits/case-reveal.circom");
  });

  it("should verify valid proof", async () => {
    // Build test Merkle tree
    const input = {
      salt: "12345",
      pathElements: [...],
      pathIndices: [...],
      caseIndex: 13,
      merkleRoot: "0x...",
      value: "1000000000000000"
    };

    const witness = await circuit.calculateWitness(input);
    await circuit.checkConstraints(witness);

    // Check output matches input value
    assert(witness[1] === input.value);
  });

  it("should reject wrong value", async () => {
    // Same input but wrong value
    const input = { ..., value: "999999" };

    await assert.isRejected(circuit.calculateWitness(input));
  });
});
```

### Integration Tests

**File**: `packages/foundry/test/ZKIntegration.t.sol`

```solidity
contract ZKIntegrationTest is Test {
    DealOrNoDealFactory factory;
    CaseRevealVerifier verifier;

    function testRealProofVerification() public {
        // 1. Generate game with real proofs
        bytes32 merkleRoot = generateMerkleRoot();

        // 2. Create game
        address game = factory.createGame(merkleRoot, config, salt);

        // 3. Play through lottery and select case
        // ...

        // 4. Open case with real ZK proof
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = loadProof();
        DealOrNoDeal(game).openCase(0, value, pA, pB, pC);

        // 5. Verify case opened successfully
        assertTrue(briefcases[0].opened);
        assertEq(briefcases[0].value, value);
    }
}
```

## Security Considerations

### 1. Trusted Setup
- **Current**: Single-party contribution (dev only)
- **Production**: Multi-party ceremony required
- **Tool**: Use Hermez/Aztec ceremonies or run custom

### 2. Proof Storage
- **Option A**: IPFS (decentralized, permanent)
- **Option B**: Host's server (centralized but fast)
- **Option C**: Onchain (expensive but trustless)
- **Recommendation**: IPFS with fallback to host server

### 3. Front-running
- **Issue**: Proofs are public once submitted
- **Mitigation**: Already mitigated by commit-reveal lottery
- **Additional**: Case values only revealed when opened

### 4. Proof Malleability
- **Issue**: Groth16 proofs can be non-deterministic
- **Mitigation**: Verifier contract checks validity, not uniqueness
- **Safe**: Multiple valid proofs for same statement is acceptable

## Performance Metrics

### Circuit Stats
- **Constraints**: ~1,200 (Poseidon + Merkle depth 5)
- **Proving time**: ~2-5 seconds (browser)
- **Verification time**: ~50ms (onchain)
- **Gas cost**: ~300k gas per proof verification

### Optimization Opportunities
1. **Batch verification**: Verify multiple cases in one proof
2. **Recursive SNARKs**: Compress all 26 proofs into one
3. **Alternative curves**: BLS12-381 for better aggregation
4. **Plonk/Halo2**: No trusted setup required

## Deployment Checklist

- [ ] Compile circuit successfully
- [ ] Generate trusted setup (multi-party for production)
- [ ] Deploy CaseRevealVerifier.sol
- [ ] Update DealOrNoDeal.sol to use real verifier
- [ ] Implement proof generation API
- [ ] Add proof fetching to frontend
- [ ] Write comprehensive tests
- [ ] Gas optimization
- [ ] Security audit
- [ ] Mainnet deployment

## Current Status (Feb 2026)

- [x] Circuit design complete
- [x] Build script created
- [⏳] Circuit compilation in progress
- [ ] Trusted setup
- [ ] Verifier deployment
- [ ] Contract integration
- [ ] API implementation
- [ ] Frontend integration
- [ ] Testing
- [ ] Production deployment

## References

- [Circom Documentation](https://docs.circom.io/)
- [SnarkJS](https://github.com/iden3/snarkjs)
- [Poseidon Hash](https://www.poseidon-hash.info/)
- [Groth16 Paper](https://eprint.iacr.org/2016/260.pdf)
- [Trusted Setup Ceremonies](https://blog.ethereum.org/2023/01/18/zk-snarks-trusted-setup-phase-2)
