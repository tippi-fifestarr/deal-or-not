# Host Tooling for Deal or No Deal

## Overview

This package provides zero-knowledge proof generation tools for game hosts. Hosts must pre-generate ZK proofs for all 26 cases before creating a game onchain.

## Architecture

```
Host Creates Game:
1. Generate random salts (26 values)
2. Distribute prize pool → case values
3. Build Merkle tree: leaves = Poseidon(caseIndex, value, salt)
4. Generate 26 ZK proofs (one per case)
5. Submit merkleRoot to factory.createGame()
6. Store proofs + salts securely

During Gameplay:
1. Contestant calls selectCase()
2. Host retrieves proof for case X
3. Host calls openCase(caseIndex, value, pA, pB, pC)
4. Verifier checks ZK proof onchain
5. Case revealed if valid ✅
```

## Prerequisites

### 1. Build ZK Circuits (One-Time Setup)

```bash
cd packages/circuits
npm install
npm run setup
```

This generates:
- `build/case-reveal_js/case-reveal.wasm` - WASM prover
- `build/case-reveal_final.zkey` - Proving key (26MB)
- `build/verification_key.json` - Verification key

**Note**: Without this, scripts use MOCK proofs that fail onchain verification.

### 2. Install Dependencies

```bash
cd packages/api
npm install
```

## Scripts

### 1. Create Game Setup

Generates complete game data including all ZK proofs.

```bash
node scripts/create-game.js --prize-pool 1.0
```

**Options**:
- `--prize-pool <ETH>` - Total prize pool in ETH (required)
- `--output <file>` - Output file (default: `./game-setup.json`)

**Example**:
```bash
# Generate game with 0.5 ETH prize pool
node scripts/create-game.js --prize-pool 0.5 --output ./my-game.json

# Output:
# ✓ Merkle Root: 0x0a3d50b...
# ✓ 26 proofs generated in 12.8s
# ✓ Saved to: ./my-game.json
```

**Output Structure** (`game-setup.json`):
```json
{
  "version": "1.0.0",
  "merkleRoot": "0x0a3d50b533fd31c1...",
  "prizePool": {
    "eth": "0.5",
    "wei": "500000000000000000"
  },
  "caseValues": [
    { "caseIndex": 0, "value": "505050505050505", "valueEth": "0.000505..." },
    ...
  ],
  "salts": ["123456789012345678...", ...],
  "proofs": [
    {
      "caseIndex": 0,
      "value": "505050505050505",
      "proof": {
        "pA": ["621278853...", "693170556..."],
        "pB": [...],
        "pC": [...]
      },
      "publicSignals": ["505050505050505", "0", "463146318...", "505050505050505"],
      "mock": false
    },
    ...
  ]
}
```

### 2. Get Proof for Case

Retrieves the ZK proof for a specific case during gameplay.

```bash
node scripts/get-proof.js --game ./game-setup.json --case 5
```

**Options**:
- `--game <file>` - Game setup JSON file (required)
- `--case <index>` - Case index 0-25 (required)
- `--format json|cast` - Output format (default: `json`)

**Example - JSON Output**:
```bash
node scripts/get-proof.js --game ./my-game.json --case 5
```

```json
{
  "caseIndex": 5,
  "value": "14141414141414",
  "proof": {
    "pA": ["6212788530180030910...", "6931705563807520291..."],
    "pB": [[...], [...]],
    "pC": ["4676333834781375852...", "11892357577066600441..."]
  },
  "publicSignals": ["14141414141414", "5", "4631463181717320323...", "14141414141414"],
  "mock": false
}
```

**Example - Cast Command**:
```bash
node scripts/get-proof.js --game ./my-game.json --case 5 --format cast
```

```bash
cast send $GAME "openCase(uint256,uint256,uint256[2],uint256[2][2],uint256[2])" \
  5 \
  14141414141414 \
  "[6212788530180030910...,6931705563807520291...]" \
  "[[...],[...]]" \
  "[4676333834781375852...,11892357577066600441...]" \
  --private-key $HOST_PK --rpc-url http://127.0.0.1:8545
```

## Usage Flow

### Step 1: Generate Game

```bash
# Create game with 1 ETH prize pool
node scripts/create-game.js --prize-pool 1.0 --output ./game-12345.json
```

**Output**:
```
Merkle Root (for createGame):
  0x0a3d50b533fd31c1f6578cc8551cf1d2cef278fddc6965e0cb1db38f25b86c92
```

### Step 2: Deploy Game Onchain

```bash
# Use the merkle root from Step 1
MERKLE_ROOT="0x0a3d50b533fd31c1f6578cc8551cf1d2cef278fddc6965e0cb1db38f25b86c92"

cast send $FACTORY "createGame(bytes32,uint256,uint256,uint256,uint8,uint256,uint16,uint16,uint16,address,uint8)" \
  $MERKLE_ROOT \
  100000000000000000 \    # 0.1 ETH entry fee
  300 \                   # 5 min lottery duration
  180 \                   # 3 min reveal duration
  2 \                     # min 2 players
  600 \                   # 10 min turn timeout
  8000 \                  # 80% refund to losers
  200 \                   # 2% host fee
  200 \                   # 2% protocol fee
  "0x0000000000000000000000000000000000000000" \  # token (0x0 = ETH)
  0 \                     # jackpot trigger (0 = disabled)
  --private-key $HOST_PK --rpc-url http://127.0.0.1:8545
```

### Step 3: During Gameplay

When a contestant opens a case:

```bash
# Get the proof
PROOF_JSON=$(node scripts/get-proof.js --game ./game-12345.json --case 5)

# Extract proof components (or use --format cast)
CASE_INDEX=$(echo $PROOF_JSON | jq -r '.caseIndex')
VALUE=$(echo $PROOF_JSON | jq -r '.value')
# ... extract pA, pB, pC

# Submit to contract
cast send $GAME "openCase(uint256,uint256,uint256[2],uint256[2][2],uint256[2])" \
  $CASE_INDEX $VALUE $PA $PB $PC \
  --private-key $HOST_PK --rpc-url http://127.0.0.1:8545
```

**Or use the cast format helper**:
```bash
node scripts/get-proof.js --game ./game-12345.json --case 5 --format cast
# Copy/paste the command it outputs
```

## Performance

- **Proof Generation**: ~500ms per proof (26 proofs in ~12-15 seconds)
- **Circuit Size**: 3,212 constraints, 4 public inputs
- **Gas Cost**: ~250k gas per openCase() (includes verification)

## Security

### Storage

**✅ Store Securely**:
- Game setup JSON files (contain salts)
- Private keys for host wallet

**⚠️ Never Commit**:
- `.gitignore` should include `game-*.json`
- Never share salts publicly before game ends

### Proof Integrity

ZK proofs ensure:
1. Host cannot change case values after commitment (merkleRoot locks them)
2. Host cannot reveal wrong value for a case (proof fails if value ≠ committed)
3. Contestants cannot predict unopened case values (salts prevent brute-force)

## Troubleshooting

### "Circuit artifacts not found"

**Problem**: Scripts use MOCK proofs that fail onchain.

**Solution**:
```bash
cd packages/circuits
npm run setup
```

### "Proof generation failed"

**Causes**:
- Corrupted circuit build
- Memory issues (proving needs ~2GB RAM)

**Solution**:
```bash
cd packages/circuits
npm run clean
npm run setup
```

### "Proof verification failed onchain"

**Causes**:
- Using mock proofs (circuits not built)
- Wrong case value provided
- Merkle root mismatch

**Debug**:
```bash
# Check if proof is real
cat game-setup.json | jq '.proofs[0].mock'
# Should be: false

# Verify merkle root matches onchain
cast call $GAME "game()(bytes32)" --rpc-url http://127.0.0.1:8545
```

## Development

### API Service (Optional)

For automated hosting, run the REST API:

```bash
cd packages/api
cp .env.example .env
# Edit .env with your RPC_URL, FACTORY_ADDRESS, PRIVATE_KEY
npm run dev
```

Endpoints:
- `POST /games` - Create game (auto-generates proofs)
- `POST /games/:id/open-case` - Open case with proof
- `GET /games/:id` - Get game state
- `WS /` - Real-time game events

See `index.js` for full API docs.

## Examples

### Batch Create Multiple Games

```bash
for i in {1..5}; do
  node scripts/create-game.js --prize-pool 0.5 --output ./game-$i.json
done
```

### Verify All Proofs

```bash
# Test that all 26 proofs are valid
for case in {0..25}; do
  echo "Testing case $case..."
  node scripts/get-proof.js --game ./game.json --case $case > /dev/null
done
echo "✅ All proofs OK"
```

## Next Steps

1. **Frontend Integration**: Build UI for hosts to manage games
2. **IPFS Storage**: Upload proofs to IPFS for decentralized hosting
3. **Batch Verification**: Optimize gas by batching multiple openCase calls
4. **Automated Hosting**: Run API service for fully automated games

## References

- Circuit: `packages/circuits/circuits/case-reveal.circom`
- Verifier: `packages/foundry/contracts/CaseRevealVerifier.sol`
- Game Contract: `packages/foundry/contracts/DealOrNoDeal.sol`
- ZK Integration Plan: `ZK_INTEGRATION_PLAN.md`
