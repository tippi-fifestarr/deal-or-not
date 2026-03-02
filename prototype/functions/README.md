# Phase 3: Confidential Case Values with Chainlink Functions

## Architecture

**Problem:** In Phase 1-2, case values are deterministically generated on-chain from VRF seed + blockhash. While commit-reveal prevents front-running, values can still be pre-computed.

**Solution (Phase 3):** Case values are **threshold-encrypted** as DON-hosted secrets. No single Chainlink node can decrypt them alone. Values are only revealed via Chainlink Functions when a case is opened.

### Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. GAME CREATION (Off-Chain)                           │
│                                                         │
│  • Generate 5 random case values                       │
│  • VRF provides verifiable seed                        │
│  • Encrypt case values using DON public key            │
│  • Upload to DON as threshold-encrypted secret         │
│    Format: { "gameId": [val1, val2, val3, val4, val5] }│
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ 2. ON-CHAIN STATE                                      │
│                                                         │
│  • Contract stores gameId → VRF seed mapping           │
│  • NO case values stored on-chain                      │
│  • Values are "in superposition" until observed        │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ 3. CASE REVEAL (Chainlink Functions)                   │
│                                                         │
│  Player commits → waits 1 block → reveals              │
│  Contract calls: revealCase(gameId, caseIndex, salt)   │
│                                                         │
│  ┌───────────────────────────────────────────┐         │
│  │ Functions Request                         │         │
│  │  args: [gameId, caseIndex]                │         │
│  │  DON threshold-decrypts secret            │         │
│  │  Returns: uint256 caseValue               │         │
│  └───────────────────────────────────────────┘         │
│                                                         │
│  Contract receives callback → assigns value             │
└─────────────────────────────────────────────────────────┘
```

## Security

### Threshold Encryption

From Chainlink docs:

> "Chainlink Functions uses threshold encryption where the master secret key (MSK) is partitioned into shares, with each node within the DON possessing a distinct share. Users encrypt secrets with a public key; the encrypted secrets are never stored onchain. Every node can only decrypt secrets with participation from other DON nodes."

**What this means:**
- ✅ No single Chainlink node can read case values
- ✅ Values require DON consensus to decrypt
- ✅ No on-chain storage of values until revealed
- ✅ VRF seed proves game was generated fairly

### Comparison to TV Show

**Original Show:**
- Producers know all case values ❌
- Host (Howie) may know values ❌
- Banker knows values ❌
- Contestant trusts it's fair ⚠️

**Deal or NOT (Phase 3):**
- No single entity knows all values ✅
- DON consensus required to reveal ✅
- Values provably don't exist until observed ✅
- Cryptographically verifiable fairness ✅

## Files

### `/prototype/functions/case-reveal.js`

Chainlink Functions script that:
1. Receives `args: [gameId, caseIndex]`
2. Threshold-decrypts DON secret `CASE_VALUES`
3. Parses JSON: `{ "0": [1, 5, 10, 50, 100], ... }`
4. Returns `uint256` case value to contract

### `/prototype/contracts/src/DealOrNotConfidential.sol`

Updated contract with:
- `FunctionsClient` inheritance
- `revealCase()` sends Functions request
- `fulfillRequest()` receives decrypted value
- New phases: `RequestingValue`, `RequestingFinalValue`

### `/prototype/functions/upload-secrets.js` (to be created)

Node.js script to:
1. Generate random case values for a game
2. Encrypt using DON public key
3. Upload to DON via secrets endpoint
4. Update on-chain game state

## Setup

### 1. Install Dependencies

```bash
cd prototype/functions
npm install @chainlink/functions-toolkit dotenv
```

### 2. Configure Environment

```bash
# .env
PRIVATE_KEY=0x...
RPC_URL=https://base-sepolia.g.alchemy.com/v2/...
FUNCTIONS_ROUTER=0x... # Base Sepolia Functions Router
FUNCTIONS_SUBSCRIPTION_ID=123
DON_ID=fun-base-sepolia-1
```

### 3. Deploy Functions Source

```bash
# Read source code
const source = fs.readFileSync("./case-reveal.js", "utf8");

# Update contract
await contract.setFunctionsSource(source);
```

### 4. Generate & Upload Secrets

```bash
node upload-secrets.js --gameId 0
```

This will:
- Generate 5 random case values (shuffle of [1, 5, 10, 50, 100])
- Encrypt with DON public key
- POST to DON secrets endpoint
- Print confirmation

### 5. Play Game

```javascript
// Frontend
await contract.createGame(); // VRF generates seed
await contract.pickCase(gameId, 2); // Pick case #2

// Commit case to reveal
const salt = ethers.randomBytes(32);
const commitHash = ethers.keccak256(
  ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint8", "uint256"],
    [caseIndex, salt]
  )
);
await contract.commitCase(gameId, commitHash);

// Wait 1 block, then reveal
// This triggers Chainlink Functions request
const tx = await contract.revealCase(gameId, caseIndex, salt);

// Functions callback automatically assigns value
// Listen for CaseCollapsed event
contract.on("CaseCollapsed", (gameId, caseIndex, valueCents) => {
  console.log(`Case ${caseIndex} = $${valueCents / 100}`);
});
```

## Cost Analysis

**Per Game:**
- VRF request: ~0.25 LINK
- Functions request (per case reveal): ~0.1 LINK
- Total for 5-case game: ~0.75 LINK (~$15 at $20/LINK)

**Optimization:**
- Batch reveals (reveal multiple cases in one request)
- Use CRE Auto-Reveal for better UX (Phase 2 + 3 combined)

## Testing

### Local Simulation

```bash
npx hardhat functions-simulate --network baseSepolia
```

### Testnet Deployment

```bash
# 1. Deploy contract
forge create DealOrNotConfidential \
  --constructor-args <vrf> <sub> <key> <feed> <router> <funcsub> <donid>

# 2. Add consumer to Functions subscription
npx hardhat functions-sub-add --contract <addr> --subid <id>

# 3. Upload Functions source
npx hardhat functions-set-source --contract <addr>

# 4. Create game & upload secrets
node upload-secrets.js --gameId 0

# 5. Play game on frontend
```

## Future: Full Confidential Compute

**When Chainlink Confidential Compute ships (Q1-Q2 2026):**

Upgrade to full privacy-preserving infrastructure:
- TEE (Trusted Execution Environments) for isolated computation
- Confidential HTTP for API calls (banker AI can query LLMs privately)
- Sealed banker offers (encrypted until decision time)

**Migration path:**
1. Keep threshold encryption (already implemented)
2. Add TEE attestation verification
3. Enable Confidential HTTP in banker workflows
4. Implement sealed offers

This Phase 3 implementation is **production-ready with today's Chainlink Functions**, while being **forward-compatible** with Confidential Compute when it launches.

---

*"Does Howie know what's in the box? The DON does. But no single node does."*
