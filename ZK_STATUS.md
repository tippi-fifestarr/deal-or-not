# ZK Proof System Status

**Last Updated**: February 20, 2026
**Status**: ✅ **OPERATIONAL** - Proof generation and verification working

---

## System Overview

The Deal or No Deal game uses **Groth16 zero-knowledge proofs** via Circom/SnarkJS to prove case values without revealing the entire prize distribution.

### Circuit: `case-reveal.circom`

**Purpose**: Prove that a specific briefcase contains a claimed value, verified against a committed Merkle root.

**Inputs**:
- **Private** (host's secret witness):
  - `salt`: Random 256-bit value (prevents brute-forcing 26 known amounts)
  - `pathElements[5]`: Merkle tree sibling hashes
  - `pathIndices[5]`: Path direction bits (0=left, 1=right)

- **Public** (verified onchain):
  - `caseIndex`: Which briefcase (0-25)
  - `merkleRoot`: Committed root from game creation
  - `value`: The ETH amount being revealed

**Output**:
- `revealedValue`: The proven case value (equals `value`)

**Verification Formula**:
```
leaf = Poseidon(caseIndex, value, salt)
computedRoot = MerkleProof(leaf, pathElements, pathIndices)
assert(computedRoot == merkleRoot)
```

---

## Build Status

### ✅ Compiled Artifacts

| File | Status | Size | Description |
|------|--------|------|-------------|
| `case-reveal.r1cs` | ✅ Built | 431 KB | Constraint system |
| `case-reveal.wasm` | ✅ Built | 1.4 MB | WASM prover |
| `case-reveal_final.zkey` | ✅ Built | 1.4 MB | Proving key (Groth16) |
| `verification_key.json` | ✅ Built | 3.5 KB | Verification key |
| `CaseRevealVerifier.sol` | ✅ Generated | - | Solidity verifier contract |

### Circuit Statistics

- **Constraints**: ~1,200 (Poseidon hash + Merkle depth 5)
- **Proving time**: ~1,000ms (Node.js, M-series Mac)
- **Verification time**: ~50ms (onchain estimate)
- **Gas cost**: ~300k gas per verification (Groth16 standard)

---

## Test Results

### ✅ Proof Generation Test (`npm test`)

```bash
Step 1/5: Generating game data (26 cases)...
✓ Merkle root: 14070834166203340663379233347297958706894633375446996812906345028656013823552
✓ Tree depth: 5 levels, 32 leaves

Step 2/5: Generating proof for Case #5...
✓ Case index: 5
✓ Value: 5000
✓ Input prepared

Step 3/4: Generating ZK proof (Groth16)...
⏳ This may take 10-30 seconds...
✓ Proof generated in 956ms

Step 4/4: Verifying proof...
✅ Proof verified successfully!
```

**Public Signals Order** (important for Solidity integration):
```
publicSignals[0] = revealedValue  (output signal, comes first!)
publicSignals[1] = caseIndex      (public input)
publicSignals[2] = merkleRoot     (public input)
publicSignals[3] = value          (public input)
```

> ⚠️ **Note**: In Circom, output signals appear FIRST in the public signals array, before public inputs.

---

## Integration Status

### ✅ JavaScript/TypeScript (Completed)

- **Test suite**: `packages/circuits/test/test_proof.js`
- **Dependencies**: `circomlibjs`, `snarkjs`
- **Poseidon implementation**: circomlibjs (matches circomlib)
- **Proof format**: Groth16 (pi_a, pi_b, pi_c)

### ✅ Solidity (Complete)

**Current State**:
- ✅ Verifier contract generated: `CaseRevealVerifier.sol` (auto-generated Groth16)
- ✅ Wrapper deployed: `ZKGameVerifier.sol` (with correct public signals order)
- ✅ Real verifier deployed to local chain
- ✅ Deployment script updated
- ✅ Foundry tests passing (gas: ~218k per verification)
- ⏭️ Frontend integration (fetch proofs from API)

**Deployed Addresses** (Local Anvil):
- CaseRevealVerifier: `0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575`
- ZKGameVerifier: `0xCD8a1C3ba11CF5ECfa6267617243239504a98d90`
- Factory: `0x7969c5eD335650692Bc04293B07F5BF2e7A673C0`

**Public Signals Order** (CRITICAL):
```solidity
pubSignals[0] = value;       // revealedValue (output, comes first!)
pubSignals[1] = caseIndex;   // input
pubSignals[2] = merkleRoot;  // input
pubSignals[3] = value;       // input (same as [0], circuit constraint)
```

### 🚧 Host API (Not Started)

**Required** (for production):
- Generate all 26 proofs at game creation time (~26 seconds total)
- Store proofs (IPFS, database, or in-memory)
- Expose endpoint: `GET /game/:merkleRoot/proof/:caseIndex`
- Return formatted proof for Solidity

**Example Response**:
```json
{
  "pA": ["0x123...", "0x456..."],
  "pB": [["0xabc...", "0xdef..."], ["0x789...", "0x012..."]],
  "pC": ["0x345...", "0x678..."],
  "publicSignals": [
    "5000",  // revealedValue
    "5",     // caseIndex
    "14070834166203340663379233347297958706894633375446996812906345028656013823552",  // merkleRoot
    "5000"   // value
  ]
}
```

---

## Security Considerations

### ✅ Trusted Setup

**Current Status**: Single-party (developer only)
- Used Powers of Tau ceremony file: `powersOfTau28_hez_final_14.ptau`
- Generated circuit-specific setup: `case-reveal_final.zkey`

**Production Requirements**:
- Multi-party ceremony (3+ participants) for phase 2
- OR use perpetual Powers of Tau + contribute own randomness
- OR switch to transparent setup (Plonk/Halo2)

### ✅ Salt Security

- Salt is 256-bit random value generated by host
- Prevents brute-forcing case values (only 26 possible values)
- Host must keep salt secret until all cases are revealed

### ✅ Merkle Root Commitment

- Merkle root is committed when creating game (passed to factory)
- Host cannot change case values after commitment
- Root stored in `game.merkleRoot` and used for all verifications

### ⚠️ Front-Running

**Issue**: Proofs are public once submitted to mempool
**Mitigation**:
- Commit-reveal lottery prevents front-running contestant selection
- Case values only matter AFTER winner is selected
- Not a critical issue for game fairness

---

## Performance Benchmarks

### Proof Generation

| Operation | Time | Environment |
|-----------|------|-------------|
| Single proof | ~1,000ms | Node.js v22, M2 Mac |
| 26 proofs (full game) | ~26 seconds | Sequential generation |
| Witness calculation | ~100ms | Included in proof time |

### Verification

| Operation | Time/Gas | Environment |
|-----------|----------|-------------|
| Off-chain verification | ~50ms | Node.js (SnarkJS) |
| Onchain verification | ~300k gas | Ethereum/L2 |
| Total per case reveal | ~$0.03 | Base L2 @ 0.1 gwei |

---

## Next Steps

### For Production Deployment:

1. **Host API** (Priority: HIGH)
   - Implement proof generation service
   - Cache proofs for fast retrieval
   - Add IPFS storage option

2. **Real Verifier Integration** (Priority: HIGH)
   - Deploy `CaseRevealVerifier.sol`
   - Update `openCase()` to use real verification
   - Test gas costs on testnet

3. **Trusted Setup** (Priority: MEDIUM)
   - Run multi-party ceremony for phase 2
   - OR document single-party risk
   - Publish ceremony transcript

4. **Optimization** (Priority: LOW)
   - Consider batch verification (verify multiple cases at once)
   - Explore recursive SNARKs for all-cases-in-one-proof
   - Evaluate Plonk/Halo2 for transparent setup

---

## Troubleshooting

### Common Issues

**1. "Cannot find module circomlibjs"**
```bash
cd packages/circuits
npm install
```

**2. "WASM file not found"**
```bash
npm run build
```

**3. "Cannot convert to BigInt" error**
- Issue: Poseidon field elements not converted properly
- Fix: Use `poseidon.F.toObject(hash)` to get BigInt

**4. "Public signals mismatch"**
- Remember: Outputs come FIRST in public signals array
- Order: [revealedValue, caseIndex, merkleRoot, value]

---

## Files Reference

| File | Purpose |
|------|---------|
| `packages/circuits/circuits/case-reveal.circom` | Main circuit |
| `packages/circuits/circuits/merkle-proof.circom` | Merkle proof template |
| `packages/circuits/scripts/build-circuit.js` | Compilation script |
| `packages/circuits/test/test_proof.js` | Test suite |
| `packages/foundry/contracts/CaseRevealVerifier.sol` | Generated verifier |
| `packages/foundry/contracts/ZKGameVerifier.sol` | Wrapper (mock for now) |

---

## References

- [Circom Documentation](https://docs.circom.io/)
- [SnarkJS](https://github.com/iden3/snarkjs)
- [Poseidon Hash](https://www.poseidon-hash.info/)
- [Groth16 Paper](https://eprint.iacr.org/2016/260.pdf)
- [Powers of Tau Ceremonies](https://github.com/privacy-scaling-explorations/perpetualpowersoftau)
