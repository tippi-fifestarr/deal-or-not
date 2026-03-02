# Quick Start - Deploy & Test Phase 3

**Goal:** Deploy DealOrNotConfidential to Base Sepolia and test confidential case reveals.

**Time:** ~30 minutes

## Prerequisites

- [x] VRF Subscription ID: `33463597817054297358581832393667208607971753497855037687300387869698162762494`
- [ ] Functions Subscription ID (create at [functions.chain.link](https://functions.chain.link))
- [ ] Base Sepolia ETH ([faucet](https://www.alchemy.com/faucets/base-sepolia))
- [ ] 10 LINK on Base Sepolia ([faucet](https://faucets.chain.link/base-sepolia))

## Step 1: Create Functions Subscription

1. Visit [functions.chain.link](https://functions.chain.link)
2. Connect wallet → Base Sepolia network
3. Click "Create Subscription"
4. Fund with 10 LINK
5. **Note the subscription ID** (you'll need it in Step 2)

## Step 2: Configure Environment

```bash
cd prototype/functions
cp .env.example .env
```

Edit `.env`:

```bash
# Your private key
PRIVATE_KEY=0x...

# Alchemy RPC
RPC_URL=https://base-sepolia.g.alchemy.com/v2/...

# Functions subscription ID from Step 1
FUNCTIONS_SUBSCRIPTION_ID=123
```

Install dependencies:

```bash
npm install
```

## Step 3: Deploy Contract

```bash
cd ../contracts

# Deploy (VRF subscription ID already configured in script)
forge script script/DeployConfidential.s.sol:DeployConfidential \
  --rpc-url $RPC_URL \
  --broadcast \
  --verify

# Note the deployed address from output
```

**Copy the deployed contract address:** `0x________________`

## Step 4: Add Consumers to Subscriptions

### VRF Subscription

Contract is already configured with VRF subscription ID in deployment script. Just add as consumer:

1. Visit [vrf.chain.link](https://vrf.chain.link)
2. Select your subscription (ID ending in ...762494)
3. Click "Add Consumer"
4. Paste contract address from Step 3
5. Confirm transaction

### Functions Subscription

1. Visit [functions.chain.link](https://functions.chain.link)
2. Select your subscription
3. Click "Add Consumer"
4. Paste contract address
5. Confirm transaction

## Step 5: Set Functions Source Code

```bash
cd ../functions

node set-source.js --contract=0x<YOUR_CONTRACT_ADDRESS>
```

**Expected output:**
```
📝 Setting Functions source code
Contract: 0x...
Source length: 645 bytes

✅ Source code set successfully!
✅ Source code verified on-chain
```

## Step 6: Upload Encrypted Secrets

```bash
node upload-secrets.js --gameId=0
```

**Expected output:**
```
🎲 Generating encrypted case values for Game #0

Generated case values:
  Case 0: $0.50
  Case 1: $0.01
  ...

✅ Secrets uploaded successfully!
✨ Ready for on-chain gameplay!
```

## Step 7: Test Game Flow

### Create Game (Triggers VRF)

```bash
cast send <CONTRACT_ADDRESS> \
  "createGame()" \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY
```

Wait ~30 seconds for VRF fulfillment.

Check phase:

```bash
cast call <CONTRACT_ADDRESS> "getGameState(uint256)" 0 --rpc-url $RPC_URL
```

Look for `phase = 1` (Created).

### Pick Case

```bash
cast send <CONTRACT_ADDRESS> "pickCase(uint256,uint8)" 0 2 --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

### Commit Case to Open

```bash
# Generate salt and commitment
SALT=$(cast keccak "test123")
COMMIT=$(cast keccak $(cast abi-encode "f(uint8,uint256)" 0 $SALT))

# Commit
cast send <CONTRACT_ADDRESS> "commitCase(uint256,uint256)" 0 $COMMIT --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

### Reveal Case (Triggers Functions!)

Wait 1 block, then:

```bash
cast send <CONTRACT_ADDRESS> "revealCase(uint256,uint8,uint256)" 0 0 $SALT --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

This sends a Chainlink Functions request to decrypt the case value!

**Watch for callback (~60 seconds):**

```bash
# Monitor events
cast logs --address <CONTRACT_ADDRESS> --from-block latest --rpc-url $RPC_URL
```

Look for `CaseCollapsed` event with the decrypted value.

## Verification

**Success criteria:**
- ✅ VRF fulfilled (game phase = Created)
- ✅ Functions request sent (CaseRevealRequested event)
- ✅ Functions callback received (~60s)
- ✅ CaseCollapsed event emitted with value
- ✅ Value matches one from uploaded secrets

**Check revealed value:**

```bash
cast call <CONTRACT_ADDRESS> "getGameState(uint256)" 0 --rpc-url $RPC_URL
```

Decode the `caseValues` array - index 0 should have a value.

## Troubleshooting

**"No case values found":**
- Re-run `upload-secrets.js` with correct gameId
- Check secrets didn't expire (7 day TTL)

**Functions request not fulfilling:**
- Verify contract added to Functions subscription
- Check subscription has LINK balance
- Confirm source code is set correctly

**VRF not fulfilling:**
- Verify contract added to VRF subscription
- Check VRF subscription has LINK balance (min 2 LINK)

## Cost Breakdown

**One-time:**
- Deploy contract: ~0.001 ETH

**Per Game:**
- VRF request: ~0.25 LINK
- Functions request (5 cases): ~0.5 LINK
- **Total:** ~0.75 LINK (~$15 at $20/LINK)

## Next Steps

✅ Phase 3 tested successfully!

**Options:**
1. Update frontend to support confidential reveals
2. Create demo video showing threshold encryption
3. Move to Phase 4 (Multi-Player Mode)
4. Move to Phase 6 (Prize Pools)

See `TESTING.md` for comprehensive testing guide.
