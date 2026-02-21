# Deal or No Deal — Verification Guide

Complete guide to verifying that the ZK proof system and variance system work correctly.

## Quick Start

```bash
# 1. Verify circuits are built
cd packages/circuits && npm run setup

# 2. Generate test game
cd packages/api
node scripts/create-game.js --prize-pool 0.01 --output /tmp/test-game.json

# 3. Verify all proofs
node scripts/verify-proof.js --game /tmp/test-game.json --all

# Expected output:
# ✅ Results: 26 passed, 0 failed
```

---

## Part 1: Local Verification (Off-chain)

### 1.1 Verify Single Proof

Test that a specific case proof is valid:

```bash
cd packages/api
node scripts/verify-proof.js --game /tmp/test-game.json --case 5
```

**Expected Output**:
```
═══════════════════════════════════════════════════════
  Verifying Proof
═══════════════════════════════════════════════════════

Case Index: 5
Value: 14141414141414 wei
Mock: NO

✅ PROOF VALID

This proof will verify onchain.
```

**What this proves**:
- ZK circuit is correctly built
- Proof generation works
- Merkle tree is valid
- Public signals match constraints

### 1.2 Verify All 26 Proofs

Test that all case proofs are valid:

```bash
node scripts/verify-proof.js --game /tmp/test-game.json --all
```

**Expected Output**:
```
Case  0: ✅ VALID
Case  1: ✅ VALID
...
Case 25: ✅ VALID

Results: 26 passed, 0 failed
```

**What this proves**:
- All proofs are correctly generated
- No corrupted data in game setup
- Ready for onchain deployment

### 1.3 Verify Circuit Test

Run the circuit's own test suite:

```bash
cd packages/circuits
node test/test_proof.js
```

**Expected Output**:
```
Step 1/5: Generating game data (26 cases)...
✓ Merkle root: 14070834166203340663379233347297958706894633375446996812906345028656013823552

Step 3/4: Generating ZK proof (Groth16)...
✓ Proof generated in 1116ms

Step 5/5: Verifying proof...
✅ Proof verified successfully!
```

**What this proves**:
- Circuit compilation is correct
- Poseidon hash works
- Merkle proof verification works
- Groth16 verifier is valid

---

## Part 2: Onchain Verification

### 2.1 Deploy Contracts

```bash
cd packages/foundry
forge script script/DeployDealOrNoDeal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

**Check deployment**:
```bash
# Get factory address
FACTORY=$(cat deployments/31337_latest.json | jq -r '.DealOrNoDealFactory')

# Verify it's deployed
cast code $FACTORY --rpc-url http://127.0.0.1:8545
# Should return bytecode (not 0x)
```

### 2.2 Create Game with Real Proofs

```bash
# Generate game with proofs
cd packages/api
node scripts/create-game.js --prize-pool 0.1 --output /tmp/game-test.json

# Extract merkle root
MERKLE_ROOT=$(cat /tmp/game-test.json | jq -r '.merkleRootHex')
echo "Merkle Root: $MERKLE_ROOT"

# Create game onchain
HOST_PK="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

cast send $FACTORY "createGame(bytes32,uint256,uint256,uint256,uint8,uint256,uint16,uint16,uint16,address,uint8)" \
  $MERKLE_ROOT \
  100000000000000000 \
  300 \
  180 \
  2 \
  600 \
  8000 \
  200 \
  200 \
  "0x0000000000000000000000000000000000000000" \
  0 \
  --private-key $HOST_PK \
  --rpc-url http://127.0.0.1:8545

# Get game address from logs
GAME="0x..." # Extract from transaction logs
```

### 2.3 Test Onchain Proof Verification

```bash
# After creating game and selecting case, test opening case 5

# Get proof
cd packages/api
node scripts/get-proof.js --game /tmp/game-test.json --case 5 > /tmp/proof-5.json

# Extract proof components
CASE_INDEX=5
VALUE=$(cat /tmp/proof-5.json | jq -r '.value')
PA0=$(cat /tmp/proof-5.json | jq -r '.proof.pA[0]')
PA1=$(cat /tmp/proof-5.json | jq -r '.proof.pA[1]')
PB00=$(cat /tmp/proof-5.json | jq -r '.proof.pB[0][0]')
PB01=$(cat /tmp/proof-5.json | jq -r '.proof.pB[0][1]')
PB10=$(cat /tmp/proof-5.json | jq -r '.proof.pB[1][0]')
PB11=$(cat /tmp/proof-5.json | jq -r '.proof.pB[1][1]')
PC0=$(cat /tmp/proof-5.json | jq -r '.proof.pC[0]')
PC1=$(cat /tmp/proof-5.json | jq -r '.proof.pC[1]')

# Submit to contract
cast send $GAME "openCase(uint256,uint256,uint256[2],uint256[2][2],uint256[2])" \
  $CASE_INDEX \
  $VALUE \
  "[$PA0,$PA1]" \
  "[[$PB00,$PB01],[$PB10,$PB11]]" \
  "[$PC0,$PC1]" \
  --private-key $HOST_PK \
  --rpc-url http://127.0.0.1:8545
```

**Expected**: Transaction succeeds, event `CaseOpened` emitted

**If transaction reverts**:
- Check proof is not MOCK (`cat /tmp/proof-5.json | jq '.mock'` should be `false`)
- Verify merkle root matches onchain (`cast call $GAME "game()(bytes32)"`)
- Check game state is `RoundPlay` (`cast call $GAME "game()(uint8)"`)

### 2.4 Run Full Game Flow Test

```bash
cd ~/deal-or-no-deal
./test-game-flow.sh
```

**Expected Output**:
```
✅ Game created!
✅ Lottery opened
✅ Player 1 entered
✅ Player 2 entered
✅ Winner drawn
✅ GAME FLOW TEST COMPLETED
```

**What this proves**:
- Full game lifecycle works
- Commit-reveal lottery works
- Case selection works
- Ready for agent integration

---

## Part 3: Variance System Verification

### 3.1 Test Variance Simulation

```bash
cd ~/deal-or-no-deal
node test-variance.js
```

**Expected Output**:
```
📊 Test 1: Variance with Different Seeds (Round 4)
Range: 5.8450 - 7.0850 ETH
Average: 6.5027 ETH (65.03%)
Spread: 1.2400 ETH (12.40%)

📊 Test 4: House Edge Analysis
Round | Avg Offer | House Edge
  0   |    27.04% |     72.96%
  4   |    64.67% |     35.33%
  8   |    88.50% |     11.50%

✅ Variance system validated!
```

**What this proves**:
- Random variance works (±5-12%)
- Context adjustment works (±3%)
- Average house edge maintained (~65%)
- Offers stay within bounds (20-98%)

### 3.2 Test Variance in Foundry

```bash
cd packages/foundry
forge test --match-test Variance -vv
```

**Expected Output**:
```
[PASS] testVarianceProducesDifferentOffers()
[PASS] testVarianceRespectsBounds()
[PASS] testContextAdjustment()
[PASS] testAverageOfferMaintainsHouseEdge()
[PASS] testGetOfferRange()
[PASS] testDeterministicForSameSeed()
[PASS] testVarianceIncreasesWithRound()

Suite result: ok. 7 passed; 0 failed
```

---

## Part 4: Integration Tests

### 4.1 Full Test Suite

```bash
cd packages/foundry
forge test -vv
```

**Expected**: All tests pass (49/50, one debug test may fail)

### 4.2 Test Banker Offers

```bash
forge test --match-test "bankerOffer" -vvv
```

**Verify**:
- Offers increase per round ✅
- Offers use variance formula ✅
- Context adjustment triggers ✅

### 4.3 Test ZK Integration

```bash
forge test --match-test "openCase" -vvv
```

**Verify**:
- Cannot open case without valid proof ✅
- Cannot open same case twice ✅
- Cannot open selected case ✅

---

## Troubleshooting

### Issue: "Circuit artifacts not found"

**Symptoms**:
```
⚠️ WARNING: Using mock proofs (circuits not built)
```

**Solution**:
```bash
cd packages/circuits
npm run setup
```

**Verify fix**:
```bash
ls -lh packages/circuits/build/case-reveal_final.zkey
# Should show ~1.4MB file
```

### Issue: "Proof verification failed onchain"

**Debug steps**:

1. **Check proof is real**:
```bash
cat game-setup.json | jq '.proofs[0].mock'
# Should be: false
```

2. **Verify merkle root matches**:
```bash
# Get onchain root
ONCHAIN_ROOT=$(cast call $GAME "game()(bytes32)" --rpc-url http://127.0.0.1:8545)

# Get local root
LOCAL_ROOT=$(cat game-setup.json | jq -r '.merkleRootHex')

echo "Onchain: $ONCHAIN_ROOT"
echo "Local:   $LOCAL_ROOT"
# Should match
```

3. **Test proof locally first**:
```bash
node scripts/verify-proof.js --game ./game-setup.json --case 5
# Should show: ✅ PROOF VALID
```

4. **Check game state**:
```bash
cast call $GAME "game()(uint8)" --rpc-url http://127.0.0.1:8545
# 3 = LotteryComplete, 4 = RoundPlay (openCase allowed)
```

### Issue: "MOCK proofs in production"

**Cause**: Circuits not built before game creation

**Solution**:
```bash
# 1. Build circuits
cd packages/circuits && npm run setup

# 2. Regenerate game
cd packages/api
node scripts/create-game.js --prize-pool 1.0 --output ./new-game.json

# 3. Verify
node scripts/verify-proof.js --game ./new-game.json --all
```

### Issue: "Variance not working"

**Check**:

1. **initialEV is set**:
```bash
cast call $GAME "initialEV()(uint256)" --rpc-url http://127.0.0.1:8545
# Should be > 0 after drawWinner()
```

2. **Offers vary**:
```bash
# Run simulation
node test-variance.js | grep "Spread"
# Should show: Spread: ~10-15% of EV
```

3. **Context triggers**:
```bash
forge test --match-test "testContextAdjustment" -vv
# Should pass
```

---

## Success Criteria

### ✅ System is Ready When:

1. **ZK Proofs**:
   - [ ] All 26 proofs verify locally
   - [ ] Proof generation takes <1s per proof
   - [ ] Onchain verification succeeds
   - [ ] No MOCK proofs in production games

2. **Variance System**:
   - [ ] Offers vary ±5-12% per round
   - [ ] Context adjustment triggers correctly
   - [ ] Average house edge ~65%
   - [ ] All variance tests pass

3. **Game Flow**:
   - [ ] Full game test script passes
   - [ ] Lottery commit-reveal works
   - [ ] Case opening requires valid proofs
   - [ ] Banker offers use variance

4. **Integration**:
   - [ ] Forge tests: 49+ passing
   - [ ] No contract errors in logs
   - [ ] Frontend connects to contracts
   - [ ] Events emit correctly

---

## Performance Benchmarks

### Expected Performance:

| Operation | Time | Gas |
|-----------|------|-----|
| Proof generation | 500ms | - |
| 26 proofs (full game) | ~12s | - |
| openCase() | - | ~250k |
| drawWinner() | - | ~800k |
| acceptDeal() | - | ~100k |

### Test Your Setup:

```bash
# Benchmark proof generation
time node scripts/create-game.js --prize-pool 0.01 --output /tmp/bench.json

# Expected: ~12-15 seconds for 26 proofs
```

---

## Next Steps After Verification

1. **Deploy to Testnet**:
   - Update RPC_URL in .env
   - Deploy factory: `forge script ... --network sepolia --verify`
   - Create test game with real proofs

2. **Frontend Testing**:
   - Start frontend: `cd packages/nextjs && yarn dev`
   - Connect wallet
   - Test game creation flow

3. **Agent Testing**:
   - Run API server: `cd packages/api && yarn dev`
   - Test `/games` endpoints
   - Build test agent

4. **Production Checklist**:
   - [ ] All tests passing
   - [ ] Contracts verified on Etherscan
   - [ ] Frontend deployed
   - [ ] API running
   - [ ] Monitoring enabled

---

## Support

If verification fails:

1. Check this guide's troubleshooting section
2. Run diagnostic: `forge test -vvvv` (verbose logs)
3. Verify circuit build: `ls -lh packages/circuits/build/*.zkey`
4. Check GitHub issues: https://github.com/anthropics/claude-code/issues

**Common Issues**:
- Circuits not built → Run `npm run setup`
- Wrong node version → Use node v20+
- Memory issues → Proof generation needs ~2GB RAM
- Gas errors → Increase gas limit to 1M+
