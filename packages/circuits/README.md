# Deal or No Deal - Zero-Knowledge Circuits

This package contains the ZK circuits for proving case reveals in the Deal or No Deal game.

## Overview

The **Case Reveal Circuit** allows a game host to prove that a briefcase contains a specific value without revealing:
- The host's secret salt
- The values in other briefcases
- The assignment mapping (which case has which value)

## Circuit Design

### Public Inputs
- `caseIndex`: Which briefcase is being revealed (0-25)
- `merkleRoot`: The committed Merkle root from game creation

### Private Inputs
- `value`: The actual value in the briefcase
- `salt`: Host's secret salt for this game
- `merkleProof[5]`: Merkle proof path elements
- `merkleIndices[5]`: Merkle proof path indices (left/right)

### Public Outputs
- `revealedValue`: The proven value (matches private `value`)

### Circuit Guarantees
1. ✅ The case index is valid (0-25)
2. ✅ The leaf `Poseidon(caseIndex, value, salt)` is in the Merkle tree
3. ✅ The Merkle root matches the committed root
4. ✅ The output value matches the claimed value

## Quick Start

### 1. Install Dependencies
```bash
cd packages/circuits
npm install
```

### 2. Compile Circuit
```bash
npm run compile
```

This generates:
- `build/case_reveal.r1cs` - Constraint system
- `build/case_reveal_js/case_reveal.wasm` - Circuit WASM
- `build/case_reveal.sym` - Symbol table

### 3. Perform Trusted Setup
```bash
npm run setup
```

⚠️ **WARNING**: This generates test keys with minimal entropy. For production, use a multi-party computation (MPC) ceremony.

This generates:
- `build/case_reveal_final.zkey` - Proving key
- `build/verification_key.json` - Verification key
- `build/Groth16Verifier.sol` - Solidity verifier contract

### 4. Test Proof Generation
```bash
npm run test:proof
```

This:
- Generates a Merkle tree for 26 cases
- Creates a proof for Case #5
- Verifies the proof
- Saves test files for Solidity integration

## Files Structure

```
packages/circuits/
├── src/
│   ├── case_reveal.circom       # Main circuit
│   └── merkle_tree.circom        # Merkle proof component
├── scripts/
│   ├── compile.sh                # Compile circuit to R1CS
│   └── setup.sh                  # Trusted setup (testing)
├── test/
│   ├── input_template.json       # Example input
│   └── test_proof.js             # Proof generation test
└── build/                        # Generated files (gitignored)
```

## Circuit Specifications

### Constraints
After compilation, run `snarkjs r1cs info` to see:
- Number of wires
- Number of constraints
- Number of private/public inputs

**Expected**: ~500-1000 constraints for this circuit

### Hash Function
Uses **Poseidon** instead of SHA256/Keccak for better ZK performance:
- Poseidon: ~150 constraints per hash
- SHA256: ~25,000 constraints per hash
- Keccak256: ~40,000 constraints per hash

### Merkle Tree
- **Depth**: 5 levels (supports 32 leaves)
- **Leaves used**: 26 (for 26 briefcases)
- **Padding**: 6 zero leaves

## Integration with Smart Contracts

### Step 1: Deploy Verifier
Copy `build/Groth16Verifier.sol` to `packages/foundry/contracts/`:
```bash
cp build/Groth16Verifier.sol ../foundry/contracts/
```

### Step 2: Update Deployment Script
In `packages/foundry/script/DeployDealOrNoDeal.s.sol`:
```solidity
// Replace MockGroth16Verifier with real verifier
Groth16Verifier verifier = new Groth16Verifier();
ZKGameVerifier zkWrapper = new ZKGameVerifier(address(verifier));
```

### Step 3: Generate Proofs for Game
Use `test_proof.js` as a template for host tooling:
```javascript
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    "case_reveal.wasm",
    "case_reveal_final.zkey"
);

// Convert to Solidity calldata
const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
```

### Step 4: Call Contract
```solidity
game.openCase(
    caseIndex,
    value,
    proof.pA,
    proof.pB,
    proof.pC
);
```

## Security Considerations

### ⚠️ Test Setup vs Production Setup

**Current (Test)**:
- Single-party ceremony
- Entropy: `openssl rand -hex 32`
- **Risk**: If the test setup is used in production, the creator knows the toxic waste and can generate fake proofs

**Production Requirements**:
1. **Multi-Party Computation (MPC)**
   - Minimum 3-5 independent contributors
   - Only one needs to be honest
   - Example: Hermez, Tornado Cash ceremonies

2. **Existing Powers of Tau**
   - Reuse existing phase 1: https://github.com/privacy-scaling-explorations/perpetualpowersoftau
   - Only run phase 2 (circuit-specific)

3. **Audit**
   - Professional circuit audit (Trail of Bits, PSE, 0xPARC)
   - Verify constraint logic
   - Check for under-constrained circuits

### Common ZK Vulnerabilities
1. **Under-constrained circuits**: Missing constraints allow fake proofs
2. **Trusted setup compromise**: Toxic waste allows fake proofs
3. **Front-running**: Public inputs visible in mempool
4. **Replay attacks**: Old proofs reused (mitigated by merkleRoot being game-specific)

## Performance Benchmarks

**Expected performance** (on modern laptop):
- Compilation: ~10 seconds
- Setup (test): ~2 minutes
- Proof generation: ~10-30 seconds
- Proof verification: <100ms (onchain: ~300k gas)

## Development Workflow

### Modify Circuit
1. Edit `src/case_reveal.circom`
2. Run `npm run compile`
3. Check constraint count
4. If R1CS changed, re-run `npm run setup`
5. Test with `npm run test:proof`

### Add New Constraints
```circom
// Example: Add range check for value
component rangeCheck = LessThan(64);
rangeCheck.in[0] <== value;
rangeCheck.in[1] <== 2**64;
rangeCheck.out === 1;
```

### Debug Circuit
```bash
# Calculate witness with debug info
snarkjs wtns calculate build/case_reveal_js/case_reveal.wasm test/input.json witness.wtns

# Check if witness satisfies R1CS
snarkjs wtns check build/case_reveal.r1cs witness.wtns
```

## Troubleshooting

### Error: "circom: command not found"
```bash
# Install circom
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
sudo cp target/release/circom /usr/local/bin/
```

### Error: "Cannot find module 'circomlib'"
```bash
npm install circomlib
```

### Error: "Constraint doesn't match"
- Check all signal assignments are constrained
- Use `<==` for constrained assignments, not `=`
- Verify public inputs match circuit definition

### Gas Optimization
If proof verification is too expensive:
1. Reduce Merkle depth (fewer levels)
2. Use PLONK instead of Groth16 (smaller proofs, cheaper verification)
3. Batch verify multiple proofs (amortize costs)

## References

- [Circom Documentation](https://docs.circom.io/)
- [SnarkJS](https://github.com/iden3/snarkjs)
- [Circomlib (Circuit Library)](https://github.com/iden3/circomlib)
- [ZK Security Guide](https://www.zkdocs.com/)
- [0xPARC ZK Learning](https://learn.0xparc.org/)

## License

MIT
