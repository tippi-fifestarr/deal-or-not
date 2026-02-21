#!/bin/bash
set -e

echo "═══════════════════════════════════════════════════════"
echo "  ZK Trusted Setup for Case Reveal Circuit"
echo "  ⚠️  FOR TESTING ONLY - DO NOT USE IN PRODUCTION"
echo "═══════════════════════════════════════════════════════"

CIRCUIT_NAME="case_reveal"
BUILD_DIR="build"
PTAU_FILE="$BUILD_DIR/powersoftau_14.ptau"

# Ensure circuit is compiled
if [ ! -f "$BUILD_DIR/$CIRCUIT_NAME.r1cs" ]; then
    echo "❌ Circuit not compiled. Run './scripts/compile.sh' first."
    exit 1
fi

echo ""
echo "This script will:"
echo "  1. Download/generate Powers of Tau (Phase 1)"
echo "  2. Generate proving keys (Phase 2)"
echo "  3. Export verification key"
echo "  4. Export Solidity verifier"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# ═══════════════════════════════════════════════════════
# Phase 1: Powers of Tau
# ═══════════════════════════════════════════════════════

if [ -f "$PTAU_FILE" ]; then
    echo "✓ Powers of Tau file already exists: $PTAU_FILE"
else
    echo ""
    echo "Step 1/6: Generating Powers of Tau (2^14 = 16384 constraints)..."
    echo "⏳ This may take 1-2 minutes..."

    snarkjs powersoftau new bn128 14 $BUILD_DIR/pot14_0000.ptau -v

    echo ""
    echo "Step 2/6: Contributing to ceremony..."
    snarkjs powersoftau contribute $BUILD_DIR/pot14_0000.ptau $BUILD_DIR/pot14_0001.ptau \
        --name="First contribution" \
        --entropy="$(openssl rand -hex 32)" \
        -v

    echo ""
    echo "Step 3/6: Preparing Phase 2..."
    snarkjs powersoftau prepare phase2 $BUILD_DIR/pot14_0001.ptau $PTAU_FILE -v

    # Cleanup intermediate files
    rm $BUILD_DIR/pot14_0000.ptau $BUILD_DIR/pot14_0001.ptau

    echo "✅ Powers of Tau generation complete!"
fi

# ═══════════════════════════════════════════════════════
# Phase 2: Circuit-Specific Setup
# ═══════════════════════════════════════════════════════

echo ""
echo "Step 4/6: Generating initial zKey..."
snarkjs groth16 setup $BUILD_DIR/$CIRCUIT_NAME.r1cs $PTAU_FILE $BUILD_DIR/${CIRCUIT_NAME}_0000.zkey

echo ""
echo "Step 5/6: Contributing to zKey..."
snarkjs zkey contribute $BUILD_DIR/${CIRCUIT_NAME}_0000.zkey $BUILD_DIR/${CIRCUIT_NAME}_final.zkey \
    --name="Circuit contribution" \
    --entropy="$(openssl rand -hex 32)" \
    -v

# Cleanup initial zkey
rm $BUILD_DIR/${CIRCUIT_NAME}_0000.zkey

echo ""
echo "Step 6/6: Verifying final zKey..."
snarkjs zkey verify $BUILD_DIR/$CIRCUIT_NAME.r1cs $PTAU_FILE $BUILD_DIR/${CIRCUIT_NAME}_final.zkey

# ═══════════════════════════════════════════════════════
# Export Verification Key
# ═══════════════════════════════════════════════════════

echo ""
echo "Exporting verification key..."
snarkjs zkey export verificationkey $BUILD_DIR/${CIRCUIT_NAME}_final.zkey $BUILD_DIR/verification_key.json

# ═══════════════════════════════════════════════════════
# Export Solidity Verifier
# ═══════════════════════════════════════════════════════

echo ""
echo "Generating Solidity verifier contract..."
snarkjs zkey export solidityverifier $BUILD_DIR/${CIRCUIT_NAME}_final.zkey $BUILD_DIR/Groth16Verifier.sol

echo ""
echo "✅ Trusted setup complete!"
echo ""
echo "Generated files:"
echo "  - $BUILD_DIR/${CIRCUIT_NAME}_final.zkey (Proving key)"
echo "  - $BUILD_DIR/verification_key.json (Verification key)"
echo "  - $BUILD_DIR/Groth16Verifier.sol (Solidity verifier)"
echo ""
echo "⚠️  SECURITY WARNING:"
echo "This is a test setup with minimal entropy. For production:"
echo "  1. Use a multi-party computation (MPC) ceremony"
echo "  2. Involve multiple independent contributors"
echo "  3. Use existing Powers of Tau (Hermez, Tornado Cash)"
echo "  4. Conduct a professional audit"
echo ""
echo "Next step: Run 'npm run test:proof' to generate test proofs"
