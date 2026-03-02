# Phase 3 Testing Guide - Base Sepolia

## Prerequisites

**Accounts & Subscriptions:**
- [ ] Wallet with Base Sepolia ETH ([faucet](https://www.alchemy.com/faucets/base-sepolia))
- [ ] Chainlink VRF v2.5 subscription ([vrf.chain.link](https://vrf.chain.link))
- [ ] Chainlink Functions subscription ([functions.chain.link](https://functions.chain.link))
- [ ] LINK tokens on Base Sepolia ([faucet](https://faucets.chain.link/base-sepolia))

**Tools:**
- Node.js v18+
- Foundry (for contract deployment)
- Base Sepolia RPC URL (Alchemy/Infura)

## Network Configuration

**Base Sepolia (Chain ID: 84532)**

```bash
# Chainlink VRF v2.5
VRF_COORDINATOR=0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE
VRF_KEY_HASH=0...  # 50 gwei key hash

# Chainlink Functions
FUNCTIONS_ROUTER=0xf9B8fc078197181C841c296C876945aaa425B278
DON_ID=fun-base-sepolia-1

# Chainlink Price Feeds
ETH_USD_FEED=0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1
```

## Step 1: Create Subscriptions

### VRF Subscription

1. Visit [vrf.chain.link](https://vrf.chain.link)
2. Connect wallet (Base Sepolia)
3. Create new subscription
4. Fund with 5 LINK
5. Note subscription ID: `______`

### Functions Subscription

1. Visit [functions.chain.link](https://functions.chain.link)
2. Connect wallet (Base Sepolia)
3. Create new subscription
4. Fund with 10 LINK
5. Note subscription ID: `______`

## Step 2: Install Dependencies

```bash
cd prototype/functions
npm install
```

## Step 3: Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Your deployer private key
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE

# Alchemy Base Sepolia RPC
RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY

# VRF Subscription ID from Step 1
VRF_SUBSCRIPTION_ID=123

# Functions Subscription ID from Step 1
FUNCTIONS_SUBSCRIPTION_ID=456

# Network config (already set)
FUNCTIONS_ROUTER=0xf9B8fc078197181C841c296C876945aaa425B278
DON_ID=fun-base-sepolia-1
```

## Step 4: Deploy Contract

### Option A: Using Foundry Script

Create `prototype/contracts/script/DeployConfidential.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {DealOrNotConfidential} from "../src/DealOrNotConfidential.sol";

contract DeployConfidential is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Base Sepolia addresses
        address vrfCoordinator = 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE;
        uint256 vrfSubscriptionId = vm.envUint("VRF_SUBSCRIPTION_ID");
        bytes32 vrfKeyHash = 0x...;  // 50 gwei key hash
        address priceFeed = 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1;
        address functionsRouter = 0xf9B8fc078197181C841c296C876945aaa425B278;
        uint64 functionsSubscriptionId = uint64(vm.envUint("FUNCTIONS_SUBSCRIPTION_ID"));
        bytes32 donId = 0x66756e2d626173652d7365706f6c69612d310000000000000000000000000000; // "fun-base-sepolia-1"

        vm.startBroadcast(deployerPrivateKey);

        DealOrNotConfidential game = new DealOrNotConfidential(
            vrfCoordinator,
            vrfSubscriptionId,
            vrfKeyHash,
            priceFeed,
            functionsRouter,
            functionsSubscriptionId,
            donId
        );

        vm.stopBroadcast();

        console.log("DealOrNotConfidential deployed:", address(game));
    }
}
```

Deploy:

```bash
cd prototype/contracts
source .env
forge script script/DeployConfidential.s.sol:DeployConfidential --rpc-url $RPC_URL --broadcast --verify
```

### Option B: Using Cast

```bash
cd prototype/contracts

# Get constructor args
VRF_COORDINATOR=0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE
VRF_SUB_ID=<YOUR_VRF_SUB_ID>
VRF_KEY_HASH=0x...
PRICE_FEED=0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1
FUNCTIONS_ROUTER=0xf9B8fc078197181C841c296C876945aaa425B278
FUNCTIONS_SUB_ID=<YOUR_FUNCTIONS_SUB_ID>
DON_ID=0x66756e2d626173652d7365706f6c69612d310000000000000000000000000000

# Deploy
forge create src/DealOrNotConfidential.sol:DealOrNotConfidential \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --constructor-args $VRF_COORDINATOR $VRF_SUB_ID $VRF_KEY_HASH $PRICE_FEED $FUNCTIONS_ROUTER $FUNCTIONS_SUB_ID $DON_ID \
  --verify
```

**Note deployed address:** `0x________________`

## Step 5: Add Consumers to Subscriptions

### Add to VRF Subscription

```bash
# Via UI: vrf.chain.link → Your subscription → Add consumer → <contract address>

# Or via cast:
cast send <VRF_COORDINATOR> \
  "addConsumer(uint64,address)" \
  <VRF_SUB_ID> <CONTRACT_ADDRESS> \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY
```

### Add to Functions Subscription

```bash
# Via UI: functions.chain.link → Your subscription → Add consumer → <contract address>

# Or via Functions CLI:
npx hardhat functions-sub-add \
  --subid <FUNCTIONS_SUB_ID> \
  --contract <CONTRACT_ADDRESS> \
  --network baseSepolia
```

## Step 6: Set Functions Source Code

Read the Functions source and encode it:

```bash
cd prototype/functions

# Read source code
SOURCE=$(cat case-reveal.js)

# Set in contract
cast send <CONTRACT_ADDRESS> \
  "setFunctionsSource(string)" \
  "$SOURCE" \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY
```

## Step 7: Generate & Upload Encrypted Secrets

```bash
cd prototype/functions

# Generate and upload secrets for Game #0
node upload-secrets.js --gameId=0
```

**Expected output:**
```
🎲 Generating encrypted case values for Game #0

Generated case values (in USD cents):
  Case 0: $0.50
  Case 1: $0.01
  Case 2: $1.00
  Case 3: $0.05
  Case 4: $0.10

📦 Secrets JSON (length: 27 bytes)
{"0":[50,1,100,5,10]}

🔐 Encrypting secrets with DON public key...
✅ Secrets encrypted successfully
   Encrypted payload size: 256 bytes

📤 Uploading to DON gateway...
✅ Secrets uploaded successfully!
   Version: 1709568123
   Expiration: 2026-03-08T12:00:00.000Z

📋 Summary:
   Game ID: 0
   Case Values: [50, 1, 100, 5, 10] cents
   DON ID: fun-base-sepolia-1
   Slot ID: 0
   Secret Key: CASE_VALUES

✨ Ready for on-chain gameplay!
```

## Step 8: Test Full Game Flow

### Create Game

```bash
cast send <CONTRACT_ADDRESS> \
  "createGame()" \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY
```

**Wait for VRF fulfillment** (~30 seconds)

Check game state:

```bash
cast call <CONTRACT_ADDRESS> \
  "getGameState(uint256)" \
  0 \
  --rpc-url $RPC_URL
```

Look for `phase = 1` (Created) - VRF seed received.

### Pick Your Case

```bash
cast send <CONTRACT_ADDRESS> \
  "pickCase(uint256,uint8)" \
  0 2 \  # Game 0, pick case 2
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY
```

### Commit Case to Open

```bash
# Generate commitment
CASE_INDEX=0
SALT=$(cast keccak "mysecret123")

COMMIT_HASH=$(cast keccak $(cast abi-encode "f(uint8,uint256)" $CASE_INDEX $SALT))

# Send commit
cast send <CONTRACT_ADDRESS> \
  "commitCase(uint256,uint256)" \
  0 $COMMIT_HASH \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY
```

### Reveal Case (Triggers Functions Request)

**Wait 1 block**, then:

```bash
cast send <CONTRACT_ADDRESS> \
  "revealCase(uint256,uint8,uint256)" \
  0 $CASE_INDEX $SALT \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY
```

This will:
1. Verify commit-reveal
2. Send Chainlink Functions request
3. Emit `CaseRevealRequested` event

**Monitor Functions request:**

Watch for `CaseCollapsed` event (~60 seconds for Functions callback):

```bash
cast logs \
  --address <CONTRACT_ADDRESS> \
  --from-block latest \
  --rpc-url $RPC_URL \
  "CaseCollapsed(uint256,uint8,uint256)"
```

**Expected:**
```
CaseCollapsed(gameId=0, caseIndex=0, valueCents=50)
```

## Step 9: Verify Decryption

The revealed value should match one of the values uploaded in Step 7.

**Check game state:**

```bash
cast call <CONTRACT_ADDRESS> \
  "getGameState(uint256)" \
  0 \
  --rpc-url $RPC_URL
```

Decode `caseValues` array - should see value at index 0.

## Step 10: Complete Game

Continue opening cases, receiving banker offers, until game completes.

Banker offer can be set by calling:

```bash
cast send <CONTRACT_ADDRESS> \
  "setBankerOffer(uint256,uint256)" \
  0 25 \  # Offer $0.25 (25 cents)
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY
```

## Troubleshooting

### Functions Request Fails

**Check:**
1. Functions subscription has LINK balance
2. Contract is added as consumer
3. Functions source code is set correctly
4. DON secrets are uploaded (not expired)

**Debug:**

```bash
# Check if source is set
cast call <CONTRACT_ADDRESS> "s_functionsSource()" --rpc-url $RPC_URL

# Check Functions config
cast call <CONTRACT_ADDRESS> "s_functionsSubscriptionId()" --rpc-url $RPC_URL
cast call <CONTRACT_ADDRESS> "s_donId()" --rpc-url $RPC_URL
```

### VRF Not Fulfilling

**Check:**
1. VRF subscription has LINK balance (min 2 LINK)
2. Contract is added as consumer
3. Using correct key hash for Base Sepolia

### Secrets Not Found

**Error:** `No case values found for game 0`

**Fix:**
1. Re-run `upload-secrets.js` with correct gameId
2. Verify secrets didn't expire (7 day default)
3. Check DON gateway is reachable

## Success Criteria

- [ ] VRF fulfills game creation (phase = Created)
- [ ] Functions request completes (~60s)
- [ ] Case value is revealed on-chain
- [ ] Value matches one from uploaded secrets
- [ ] No errors in contract calls
- [ ] Game can be completed to GameOver phase

## Cost Breakdown (Actual)

**Per Game (5 cases):**
- Game creation (VRF): ~0.25 LINK
- Case reveal (Functions): ~0.1 LINK × 5 = 0.5 LINK
- **Total:** ~0.75 LINK (~$15 at $20/LINK)

**Gas costs (Base Sepolia):**
- Contract deployment: ~0.001 ETH
- Create game: ~0.0002 ETH
- Commit case: ~0.0001 ETH
- Reveal case: ~0.0001 ETH
- **Total per game:** ~0.0004 ETH (~$0.80 at $2000 ETH)

## Next Steps

After successful testing:
1. Document deployment addresses in `DEPLOYMENTS.md`
2. Update frontend to support confidential reveals
3. Create demo video showing:
   - Secrets upload
   - Game creation
   - Functions-powered reveal
   - No precomputation possible
4. Prepare for Phase 4 (Multi-Player) or Phase 6 (Prize Pools)
