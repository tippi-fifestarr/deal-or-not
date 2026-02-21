#!/bin/bash
set -e

echo "═══════════════════════════════════════════════════════"
echo "  Compiling Case Reveal Circuit"
echo "═══════════════════════════════════════════════════════"

CIRCUIT_NAME="case_reveal"
BUILD_DIR="build"
SRC_DIR="src"

# Create build directory
mkdir -p $BUILD_DIR

echo ""
echo "Step 1/3: Compiling circuit to R1CS..."
circom $SRC_DIR/$CIRCUIT_NAME.circom \
  --r1cs \
  --wasm \
  --sym \
  --c \
  -o $BUILD_DIR \
  -l ../../node_modules

echo ""
echo "Step 2/3: Getting circuit info..."
snarkjs r1cs info $BUILD_DIR/$CIRCUIT_NAME.r1cs

echo ""
echo "Step 3/3: Exporting R1CS to JSON..."
snarkjs r1cs export json $BUILD_DIR/$CIRCUIT_NAME.r1cs $BUILD_DIR/$CIRCUIT_NAME.r1cs.json

echo ""
echo "✅ Compilation complete!"
echo ""
echo "Generated files:"
echo "  - $BUILD_DIR/${CIRCUIT_NAME}.r1cs (R1CS constraints)"
echo "  - $BUILD_DIR/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm (Circuit WASM)"
echo "  - $BUILD_DIR/${CIRCUIT_NAME}.sym (Symbol table)"
echo "  - $BUILD_DIR/${CIRCUIT_NAME}.r1cs.json (Human-readable R1CS)"
echo ""
echo "Next step: Run './scripts/setup.sh' to generate proving keys"
