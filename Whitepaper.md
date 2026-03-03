# Deal or NOT: Provably Fair Hidden Case Values

*A technical exploration of hiding game state on a public blockchain*

## Abstract

Deal or NOT is an on-chain version of "Deal or No Deal" built on Base (L2) using Chainlink products. The central design challenge is deceptively simple: **how do you hide case values from players when every byte of blockchain data is public?**

This document traces our journey through four approaches to solving this problem — from naive storage (readable by anyone), through quantum-inspired lazy evaluation (attackable via selective reveal), through Chainlink Functions threshold encryption (trusted script, wrong product), to the correct solution: **CRE Confidential Compute** (VRF on-chain for fairness + CRE enclave secret for privacy + attestation for integrity).

Each approach taught us something about the fundamental tension between transparency and privacy in on-chain games. The attack vectors are concrete, the costs are real (~$0.005 to exploit the commit-reveal pattern on Base), and the solution is elegant: values are derived from a combination of a public VRF seed and a private CRE-held secret, making them simultaneously **provably fair** and **computationally private**.

## 1. The Problem

On a blockchain, everything is public. Every storage slot, every transaction, every intermediate computation can be read by anyone. This is a feature — it enables trustless verification. But for a game like Deal or No Deal, it's a fatal flaw.

The game requires **hidden information**: case values that are assigned but unknown to the player. On a traditional game show, this is solved by physical isolation — the values are sealed in physical cases. On-chain, there are no sealed cases. There is only storage, and storage is a glass box.

**The challenge**: Assign values to cases such that:
1. The player cannot see or predict values before opening a case
2. The assignment is provably fair (not rigged by the house)
3. Anyone can verify fairness after the game ends
4. No single party (including the game operator) can manipulate outcomes

These requirements are in tension. Fairness demands transparency. Privacy demands opacity. The solution must bridge both.

## 2. Approach 0: Fisher-Yates Shuffle

**Contract**: `legacy/contracts/DealOrNoDeal.sol`

Our first attempt was the obvious one: use Chainlink VRF to generate random numbers, then shuffle all case values at game creation using a Fisher-Yates shuffle.

```solidity
// Fisher-Yates shuffle — all values assigned upfront in VRF callback
function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
    uint256[12] memory shuffled;
    for (uint8 i = 0; i < NUM_CASES; i++) shuffled[i] = CASE_VALUES[i];
    for (uint256 i = 11; i > 0; i--) {
        uint256 j = randomWords[i] % (i + 1);
        (shuffled[i], shuffled[j]) = (shuffled[j], shuffled[i]);
    }
    game.caseValues = _packValues(shuffled);  // All 12 values now in storage
}
```

The 12 case values are bit-packed into a single `uint256` (20 bits each). This feels secure — the values are "hidden" behind bit-packing, and you can't read them through the contract's public interface.

### The Attack

**See**: `legacy/contracts/attacks/CaseCheat.sol`

Bit-packing is obfuscation, not encryption. Any contract or off-chain script can read the raw storage slot:

```solidity
// From CaseCheat.sol — reads ALL case values from storage
// slot = keccak256(gameId . mappingSlot) + fieldOffset
// caseValues = eth_getStorageAt(contract, slot)
// value[i] = (caseValues >> (i * 20)) & 0xFFFFF
```

A bot can:
1. Read every case value before opening a single one
2. Open only low-value cases (removing $0.01, $0.05, etc.)
3. Abort the transaction if about to open a high-value case (costs zero gas — `eth_call` simulation catches it)
4. Inflate the banker's offer by keeping all high values in the pool

**Cost of attack**: Free. Reading storage costs nothing. Reverting a simulated transaction costs nothing.

**Lesson**: Storing values on-chain — in any format — is equivalent to publishing them.

## 3. Approach 1: ZK Proofs (Groth16 + Merkle Root)

**Contract**: `packages/foundry/contracts/DealOrNoDeal.sol`
**Circuits**: `packages/circuits/src/case_reveal.circom`
**Audit**: `AUDIT_REPORT.md` (Section 6: ZK Proof Implementation Roadmap)

Our second attempt added cryptographic verification. The host pre-assigns all 26 case values and commits a **Merkle root** on-chain at game creation. When a case is opened, a **Groth16 ZK proof** proves the value was committed in the Merkle tree — without revealing the host's salt or other case values.

```circom
// Simplified Circom circuit: prove a case value was in the committed tree
template CaseReveal() {
    signal input salt;              // Private: host's per-case salt
    signal input assignedValue;     // Private: the case value
    signal input merkleProof[5];    // Private: Merkle path (depth 5 = 32 leaves)
    signal input caseIndex;         // Public: which case is being opened
    signal input merkleRoot;        // Public: committed at game creation

    // leaf = Poseidon(caseIndex, assignedValue, salt)
    component leaf = Poseidon(3);
    leaf.inputs[0] <== caseIndex;
    leaf.inputs[1] <== assignedValue;
    leaf.inputs[2] <== salt;

    // Verify leaf is in the committed Merkle tree
    component merkle = MerkleTreeChecker(5);
    merkle.leaf <== leaf.out;
    merkle.pathElements <== merkleProof;
    merkle.root === merkleRoot;

    signal output value;
    value <== assignedValue;
}
```

This architecture also included a commit-reveal lottery for contestant selection, EIP-1167 minimal proxy clones for gas-efficient game creation, on-chain SVG BriefcaseNFTs, and a 26-case game-show-accurate prize distribution.

### The Problem

We never shipped a real verifier. The deployed contract used `MockGroth16Verifier` — a contract that returns `true` for every proof:

```solidity
contract MockGroth16Verifier {
    function verifyProof(...) external pure returns (bool) {
        return true; // Accepts anything
    }
}
```

This was supposed to be temporary, but the ZK pipeline (Circom compilation → trusted setup → snarkjs proof generation → on-chain verification) added weeks of development time we didn't have at ETHDenver. The audit (`AUDIT_REPORT.md`) identified this as the #1 critical blocker.

Even with a real verifier, the ZK approach has a fundamental trust problem: **someone has to generate the Merkle tree**. The host runs `upload-secrets.js`, knows all 26 values and salts, and commits the root. The ZK proof guarantees the host didn't change values after committing — but the host knows every value from the start. That's the same trust model as the actual TV show.

**Cost of a real ZK pipeline**: ~6 weeks (per `AUDIT_REPORT.md` Section 6), ~$15 LINK per game (VRF + 26 proof verifications at ~300k gas each), and a trusted setup ceremony.

**Lesson**: ZK proofs verify that values were committed honestly, but they don't hide values from the committer. The host still knows everything. We needed a solution where *nobody* knows.

**ETHDenver deployment** (Base Sepolia, historical — superseded by CRE prototype):

| Contract | Address |
|---|---|
| DealOrNoDealFactory | [`0x78da752e9dbd73a9b0c0f5ddd15e854d2b879524`](https://sepolia.basescan.org/address/0x78da752e9dbd73a9b0c0f5ddd15e854d2b879524) |
| DealOrNoDeal (impl) | [`0xb98e0fb673e5a0c6e15f1d0a9f36e7da954a0d5e`](https://sepolia.basescan.org/address/0xb98e0fb673e5a0c6e15f1d0a9f36e7da954a0d5e) |
| BriefcaseNFT (impl) | [`0xd2bd10d3f2e3a057f0040663b1eebf4d1874feab`](https://sepolia.basescan.org/address/0xd2bd10d3f2e3a057f0040663b1eebf4d1874feab) |
| ZKGameVerifier | [`0xc36e784e1dff616bdae4eac7b310f0934faf04a4`](https://sepolia.basescan.org/address/0xc36e784e1dff616bdae4eac7b310f0934faf04a4) |
| MockGroth16Verifier | [`0xff196f1e3a895404d073b8611252cf97388773a7`](https://sepolia.basescan.org/address/0xff196f1e3a895404d073b8611252cf97388773a7) |

## 4. Approach 2: Quantum Collapse + Commit-Reveal (Brodinger's Case)

**Contract**: `prototype/contracts/src/DealOrNot.sol`
**Design Document**: `legacy/docs/SITUATION.md`

If storing values is the problem, what if values **don't exist** until they're observed? Inspired by quantum mechanics (and Schrödinger's cat), we designed "Brodinger's Case" — values exist in a superposition of possibilities until the moment of observation (opening a case), at which point they "collapse" into a specific value.

### Three-Layer Randomness

Instead of pre-assigning values, we compute them at reveal time using three layers of entropy:

```solidity
// prototype/contracts/src/DealOrNot.sol:496
function _collapseCase(Game storage g, uint8 caseIndex, bytes32 entropy) internal returns (uint256) {
    uint8 remaining = 0;
    for (uint8 i = 0; i < NUM_CASES; i++) {
        if ((g.usedValuesBitmap & (1 << i)) == 0) remaining++;
    }

    // 3-layer random pick:
    //   Layer 1: VRF seed (provably fair, set at game creation)
    //   Layer 2: Case context (which case, how many already collapsed)
    //   Layer 3: Blockhash entropy (unknown at commit time)
    uint256 pick = uint256(keccak256(abi.encodePacked(
        g.vrfSeed, caseIndex, g.totalCollapsed, entropy
    ))) % remaining;

    // Walk unused values to find the picked one
    uint8 count = 0;
    for (uint8 i = 0; i < NUM_CASES; i++) {
        if ((g.usedValuesBitmap & (1 << i)) == 0) {
            if (count == pick) {
                g.usedValuesBitmap |= (1 << i);
                g.totalCollapsed++;
                return CASE_VALUES_CENTS[i];
            }
            count++;
        }
    }
}
```

The commit-reveal pattern adds Layer 3: the player commits their choice (hash of case index + salt), waits one block, then reveals. The `blockhash(commitBlock)` is unknown at commit time, so the player can't precompute the outcome... right?

### The Attack: Selective Reveal

Wrong. Here's the critical insight: **commit-reveal protects against the block proposer, not the player.**

After the player commits and the commit block is mined:
1. `vrfSeed` — stored in contract storage, **public**
2. `caseIndex` — chosen by the player, **known**
3. `totalCollapsed` — stored in contract storage, **public**
4. `blockhash(commitBlock)` — now known because the block was mined, **public**

The player can now compute `_collapseCase()` locally and see exactly what value would be assigned. If the result is unfavorable (a high value being removed from the pool), the player simply **doesn't submit the reveal transaction**. They lose the gas from the commit (~$0.005 on Base), but save the value.

**Cost of attack**: ~$0.005 per attempt (Base L2 gas for a failed commit).

**Expected profit**: On a pool of [1, 5, 10, 50, 100] cents, the player can guarantee they never remove $1.00 or $0.50 from the pool, dramatically inflating the banker's offer.

**Base L2 makes it worse**: Base uses a centralized sequencer. The sequencer knows the blockhash before anyone else, creating an additional attack surface for MEV searchers.

**Lesson**: When all inputs to a function are public, the output is public — even if the computation hasn't happened yet.

**ETHDenver deployment** (Base Sepolia, historical — superseded by CRE prototype):

| Contract | Address |
|---|---|
| CashCase (Brodinger's) | [`0x2Db0a160BE59Aea46f33F900651FE819699beb52`](https://sepolia.basescan.org/address/0x2Db0a160BE59Aea46f33F900651FE819699beb52) |

VRF Coordinator: `0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE` · Key Hash: `0x9e1344a...` · Subscription ID: `20136374...` · Price Feed (ETH/USD): `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1`

## 5. Approach 3: Chainlink Functions Threshold Encryption

**Contract**: `prototype/contracts/src/DealOrNotConfidential.sol` (old version, now replaced)
**Design Document**: `prototype/functions/README.md`

Ryan's Phase 3 took a different approach: move case values entirely off-chain. Values are generated off-chain, encrypted using the DON's threshold encryption (no single node can decrypt), and stored as DON-hosted secrets. When a case is opened, a Chainlink Functions request retrieves the pre-generated value.

```solidity
// Old DealOrNotConfidential.sol — Functions-based reveal
function _requestCaseValue(uint256 gameId, uint8 caseIndex) internal returns (bytes32) {
    FunctionsRequest.Request memory req;
    req.initializeRequestForInlineJavaScript(s_functionsSource);
    string[] memory args = new string[](2);
    args[0] = _uint2str(gameId);
    args[1] = _uint2str(caseIndex);
    req.setArgs(args);
    return _sendRequest(req.encodeCBOR(), s_functionsSubscriptionId, s_functionsGasLimit, s_donId);
}
```

### What It Gets Right

- Player can't precompute values (they're not on-chain at all)
- DON consensus required for decryption (no single node compromise)
- Values are genuinely hidden until the Functions callback

### Seven Weaknesses

1. **Trusted upload script**: Someone must run `upload-secrets.js` to generate and encrypt values. That person knows all values. This is a centralized trust assumption disguised as decentralization.

2. **VRF is decorative**: The contract still requests VRF and stores the seed, but the seed is never used to compute values. Functions returns pre-generated values. The VRF is vestigial.

3. **Commit-reveal is vestigial**: The contract still requires commit-reveal (2 TX per round), but Functions already handles the reveal. The commit-reveal adds latency and gas with no security benefit.

4. **No on-chain verification**: The `fulfillRequest()` callback blindly trusts the `uint256` returned by the DON. There's no way to verify the value was derived correctly from the game parameters.

5. **Wrong product**: Chainlink Functions is the old contract-bound request-response pattern. CRE (Chainlink Runtime Environment) is the new orchestration layer with event triggers, cron scheduling, EVM read/write, secrets management, and confidential compute. Functions is being superseded.

6. **Cost**: ~$15 LINK per game (VRF request + 5 Functions requests at ~$2 each).

7. **Final reveal falls back to on-chain**: `_completeFinalReveal()` uses deterministic on-chain logic for the last case, breaking the confidential model for the most important reveal.

**Lesson**: Moving values off-chain solves the precomputation problem but introduces trusted intermediaries. The solution needs to keep the best of both worlds — on-chain verifiability with off-chain privacy.

## 6. Approach 4: CRE Confidential Compute (The Solution)

**Contract**: `prototype/contracts/src/DealOrNotConfidential.sol` (current version)
**Workflow**: `prototype/workflows/confidential-reveal/`

The correct solution uses three Chainlink products, each serving a distinct purpose:

| Component | Purpose | Product |
|-----------|---------|---------|
| **VRF** | Fairness — provably random seed | Chainlink VRF v2.5 |
| **CRE Enclave Secret** | Privacy — per-game secret unknown to player | CRE + Vault DON |
| **Enclave Attestation** | Integrity — proof of correct computation | CRE Confidential Compute |

### How It Works

**Game creation:**
1. Player calls `createGame()` → VRF generates a seed (on-chain, verifiable)
2. CRE workflow triggers on `GameCreated` event
3. CRE enclave generates a per-game secret → stores in Vault DON (threshold-encrypted via DKG)

**Opening a case (1 TX — no commit-reveal!):**
1. Player calls `openCase(gameId, caseIndex)` → emits `CaseOpenRequested` event
2. CRE picks up event → reads `vrfSeed` and `usedValuesBitmap` from chain
3. CRE retrieves per-game secret from Vault DON (threshold-decrypted in enclave)
4. CRE computes value in enclave:

```
value = collapse(vrfSeed, caseIndex, CRE_SECRET, usedValuesBitmap)
```

5. CRE writes value to chain via `fulfillCaseValue(gameId, caseIndex, valueCents)`

**Post-game auditability:**
1. After game ends, CRE publishes the secret via `publishGameSecret(gameId, secret)`
2. Anyone can now re-derive all values: `collapse(vrfSeed, caseIndex, secret, bitmap)`
3. `verifyGame(gameId)` replays all collapses and checks they match

### The Collapse Function

The collapse algorithm is the same as Phase 2, but with one crucial change — the entropy source:

```
Phase 2:  hash(vrfSeed, caseIndex, totalCollapsed, blockhash(commitBlock))
          ↑ ALL PUBLIC after commit block is mined

Phase 4:  hash(vrfSeed, caseIndex, CRE_SECRET, usedValuesBitmap)
          ↑ CRE_SECRET is PRIVATE (Vault DON, threshold-encrypted)
```

The player can read `vrfSeed` and `usedValuesBitmap` from storage. They know `caseIndex` because they chose it. But they're missing `CRE_SECRET` — it exists only inside the CRE enclave, reconstructed from threshold shares that no single node possesses.

### Why Each Component Is Necessary

**Without VRF**: The CRE could generate arbitrary seeds, rigging outcomes. VRF proves the seed is random.

**Without CRE Secret**: The player could precompute all outcomes (the selective reveal attack from Phase 2).

**Without Attestation**: The CRE could lie about the computation. Attestation proves the enclave ran the correct code.

**Without Post-Game Publication**: There would be no way to verify the game was fair after the fact. Publishing the secret enables full replay.

### Contract Interface

```solidity
// Player flow — 1 TX per round (no commit-reveal):
function openCase(uint256 gameId, uint8 caseIndex) external;

// CRE callback — only callable by authorized Keystone Forwarder:
function fulfillCaseValue(uint256 gameId, uint8 caseIndex, uint256 valueCents) external;

// Post-game auditability:
function publishGameSecret(uint256 gameId, bytes32 secret) external;
function verifyGame(uint256 gameId) external view returns (bool);
```

### CRE Workflow (TypeScript)

The CRE workflow uses the `@chainlink/cre-sdk` to:
1. Listen for `CaseOpenRequested` events via `EVMClient.logTrigger()`
2. Read game state from chain via `EVMClient.callContract()`
3. Retrieve per-game secret from Vault DON via `runtime.getSecret()`
4. Compute the collapse value inside the enclave
5. Write the result back to chain via `EVMClient.sendTransaction()`

```typescript
// Simplified CRE workflow logic
const onCaseOpenRequested = (runtime: Runtime<Config>, log: EVMLog): string => {
  const { gameId, caseIndex } = decodeEvent(log);

  // Read game state from chain
  const vrfSeed = readVRFSeed(runtime, gameId);
  const usedBitmap = readUsedBitmap(runtime, gameId);

  // Get per-game secret from Vault DON (threshold-decrypted in enclave)
  const secret = runtime.getSecret({ id: `game_${gameId}_secret` }).result();

  // Compute value — same algorithm as _deriveValue() in the contract
  const value = collapseCase(vrfSeed, caseIndex, secret.value, usedBitmap);

  // Write value to chain
  writeFulfillCaseValue(runtime, gameId, caseIndex, value);

  return "Case revealed";
};
```

## 7. Comparison Table

| | Approach 0: Fisher-Yates | Approach 1: ZK Proofs | Approach 2: Quantum Collapse | Approach 3: Functions | Approach 4: CRE Confidential |
|---|---|---|---|---|---|
| **Values precomputable?** | Yes (storage) | No (Merkle proof required) | Yes (selective reveal) | No | No |
| **Player can abort?** | Yes (revert TX) | N/A | Yes (skip reveal) | Yes (skip reveal) | No (CRE writes) |
| **Host knows values?** | Yes | **Yes (generates tree)** | No | Yes (upload script) | **No** |
| **TXs per round** | 1 | 1 + ZK proof | 2 (commit + reveal) | 2 (commit + reveal) | **1** (openCase) |
| **Cost per game** | ~$0.25 LINK | ~$15 LINK (26 proofs) | ~$0.25 LINK | ~$15 LINK | ~$0.50 LINK |
| **Trusted party** | None | Host | None | Upload script | **None** |
| **Verifiable post-game?** | N/A (all public) | Yes (Merkle root) | N/A (all public) | No | **Yes** (secret published) |
| **Shipped?** | Deployed (broken) | MockVerifier only | Deployed (broken) | Never shipped | **Deployed + E2E tested** |
| **Chainlink products** | VRF | VRF | VRF, Price Feeds | VRF, Functions | **VRF, CRE, CCIP, Price Feeds** |
| **Contract** | `legacy/DealOrNoDeal.sol` | `packages/foundry/DealOrNoDeal.sol` | `prototype/DealOrNot.sol` | old Confidential | **`prototype/DealOrNotConfidential.sol`** |

## 8. CRE Sponsor Jackpot

**Contract**: `prototype/contracts/src/SponsorJackpot.sol`
**Workflow**: `prototype/workflows/sponsor-jackpot/main.ts`
**Deployed**: `0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95` (Base Sepolia)

Orthogonal to the case value hiding problem, the Sponsor Jackpot adds real economic incentive to the game. Sponsors deposit ETH, and a CRE log-trigger workflow deposits random jackpot amounts into active games on each case opening. A separate game-timer cron workflow (every 10 min) expires stale games and clears their jackpots.

**How it works:**
1. Sponsors register with name and logo, deposit ETH
2. Sponsors assign themselves to games (`sponsorGame(gameId)`)
3. CRE log-trigger workflow fires on each `CaseOpenRequested` event, picks a random jackpot amount from the top 2 remaining case values, calls `addToJackpot()`
4. Player claims jackpot if they go "no deal" all the way (`totalCollapsed == 5`)
5. Jackpot is converted from cents to ETH using the game's price snapshot
6. If the game expires (10-min timer), a CRE cron workflow calls `expireGame()` + `clearExpiredJackpot()`

This system is a **proving ground for CRE workflows** — it demonstrates event-driven CRE → on-chain writes, the exact pattern needed for confidential case reveals.

## 9. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PLAYER                                   │
│                                                                 │
│  createGame() ──→ VRF generates seed (on-chain, verifiable)    │
│  pickCase()   ──→ Choose your case                              │
│  openCase()   ──→ Emits CaseOpenRequested event ──────────┐    │
│                                                            │    │
│  [wait for CRE to write value]                             │    │
│                                                            ▼    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │               CRE ENCLAVE (Confidential)                │    │
│  │                                                         │    │
│  │  1. Picks up CaseOpenRequested event                    │    │
│  │  2. Reads vrfSeed + usedBitmap from chain               │    │
│  │  3. Retrieves game secret from Vault DON                │    │
│  │  4. Computes: hash(seed, index, SECRET, bitmap)         │    │
│  │  5. Writes value via fulfillCaseValue()                 │    │
│  │                                                         │    │
│  │  Post-game: publishes secret for auditability           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │               CRE AI BANKER (Gemini 2.5 Flash)        │    │
│  │                                                         │    │
│  │  1. Picks up RoundComplete event                        │    │
│  │  2. Reads remaining values + round from chain           │    │
│  │  3. Computes offer (BankerAlgorithm mirror in TS)       │    │
│  │  4. Calls Gemini for snarky personality message          │    │
│  │  5. Dual writeReport:                                   │    │
│  │     a. setBankerOfferWithMessage() → game contract       │    │
│  │     b. saveQuote() → BestOfBanker gallery                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  acceptDeal() / rejectDeal()                                    │
│  keepCase() / swapCase() → CRE reveals final values            │
│                                                                 │
│  verifyGame() ← Anyone can verify with published secret        │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                    SPONSOR JACKPOT (Orthogonal)                 │
│                                                                 │
│  CRE Log  ──→ addToJackpot(gameId, amount) on each case open   │
│  CRE Cron ──→ expireGame() + clearExpiredJackpot() every 10min │
│  Player   ──→ claimJackpot(gameId) if no-deal all the way      │
│                                                                 │
│  Sponsor deposits ETH → assigned to games → CRE distributes    │
├─────────────────────────────────────────────────────────────────┤
│                    PREDICTION MARKET (Spectators)                │
│                                                                 │
│  Spectator ──→ stake on "Will player accept offer?" (Yes/No)   │
│  CRE Event ──→ detects outcome → settles market on-chain        │
│  Winners   ──→ claim proportional share of losing stakes        │
├─────────────────────────────────────────────────────────────────┤
│                    AI AGENTS (Autonomous Players)                │
│                                                                 │
│  Owner     ──→ registerAgent(strategyURI, type, wallet)         │
│  Agent     ──→ enters lottery → plays game → leaderboard        │
│  Strategy  ──→ IPFS-hosted decision logic (auditable)           │
└─────────────────────────────────────────────────────────────────┘
```

### Chainlink Products Used

```
VRF v2.5          → Seed generation (fairness) + lottery winner selection
CRE + Vault DON   → Secret management (privacy)
CRE Event Trigger  → Case reveals + sponsor jackpot + AI Banker offers (automation)
CRE Cron Trigger   → Game expiry + jackpot clearing every 10 min (automation)
CRE HTTP Consensus → Gemini 2.5 Flash API calls for AI Banker personality (AI)
Price Feeds        → ETH/USD conversion (payout + upvotes)
CCIP              → Cross-chain play from ETH Sepolia → Base Sepolia (interoperability)
```

## 10. Game Design: From Prototype to Production

### Current Prototype: Single Player

The prototype at `prototype/contracts/src/DealOrNotConfidential.sol` is a single-player game. Anyone can call `createGame()`, pick a case, open cases, and respond to banker offers. There's no lobby, no staking, and no multiplayer. The CRE forwarder simulates reveals. This is intentional — the prototype exists to prove the CRE confidential compute pattern works.

### Vision: Two Game Modes

**Single Player** — solo games against the banker algorithm:
- Player stakes ETH to play (entry fee)
- Case values are denominated in the staked amount
- If the player beats the banker (rejects all offers and the final case is high), they win back their stake plus a multiplier
- Sponsor Jackpot adds additional upside for "no deal all the way" players
- No other players needed — the banker is a deterministic algorithm on-chain

**Multiplayer** — the full game show experience:
- A **lottery phase** precedes each game: players stake ETH to enter
- After the entry window closes, a winner is selected (VRF-based)
- Losing stakes fund the prize pool — multiple losers means a bigger pot
- The winner plays the game show with the pooled stakes as the prize
- A **host/banker** role (could be another player or the protocol) sets offers
- **Spectators** watch the game in real-time via the frontend
- The game show pacing matters — timers keep things moving

### Timers: Game Flow, Not Security

In the legacy commit-reveal design (Phase 2), timers served a **security purpose**: "reveal within 256 blocks or forfeit your deposit" (`legacy/contracts/CashCase.sol:260`). The timer was a penalty mechanism to discourage selective reveal attacks. But as discussed in Section 3, penalties only deter — a sufficiently motivated attacker calculates the EV of the exploit against the forfeit cost and plays the odds.

With CRE handling all reveals, timers serve a purely **game design purpose**:

- **Round timer**: N blocks to make your move (open a case, respond to an offer). If the clock expires, auto-resolve (accept the current offer, or forfeit the turn)
- **Lottery timer**: Entry window closes after M blocks, winner is drawn, game begins
- **Inactivity forfeit**: If a player disappears mid-game, their stake is redistributed to the pool or returned to lottery entrants
- **Spectator engagement**: Time pressure creates drama — the whole point of a game show

The critical difference: in Phase 2, a player who lets the timer expire might be *attacking the game*. In the CRE design, a player who lets the timer expire is just *not playing*. The game handles it gracefully instead of treating it as a security event.

### Future Architecture: Multiple Contracts

The prototype bundles everything into one contract. Production will use separation of concerns:

| Contract | Responsibility |
|----------|---------------|
| **GameCore** | Game state machine, phases, CRE integration, case reveals, verification |
| **Banker** | Offer calculation, treasury management, configurable strategies (legacy: `CashCase.sol` had `bankerDeposit`) |
| **Lobby** | Lottery entry, staking, winner selection, matchmaking, spectator registry |
| **CCIP Bridge** | Cross-chain play — stake from Avalanche, play on Base (legacy: `CCIPBridge.sol`, `CaseCashGateway.sol`) |
| **SponsorJackpot** | Already built — sponsor deposits, CRE cron distribution, player claims |
| **PredictionMarket** | Binary markets on game outcomes, CRE-settled, spectator engagement (see below) |
| **AgentRegistry** | AI agent registration, funding, strategy URIs, leaderboard (see below) |

This mirrors what the legacy contracts already explored:

- `legacy/contracts/DealOrNoDeal.sol` had host/player roles, banker deposits, entry deposits — the **Banker** and **Lobby** contracts bring these back
- `legacy/contracts/CashCase.sol` had `forfeitGame()`, reveal windows, slippage buffers — the **Lobby** contract handles timeouts and the **Banker** handles slippage
- `legacy/contracts/ccip/` had `CCIPBridge.sol` and `CaseCashGateway.sol` for cross-chain betting — the **CCIP Bridge** contract revives this with Chainlink CCIP v2
- `legacy/contracts/AgentRegistry.sol` explored AI agent players — agents enter the lottery and play the game show autonomously (see below)

### Staking Economics

The multiplayer lottery model solves a fundamental game show problem: **where does the prize money come from?**

In the prototype, case values are denominated in cents with no real ETH backing. In production:

- **N players** stake **S ETH** each to enter the lottery
- **1 winner** plays with a prize pool of **N × S ETH** (minus protocol fee)
- **N - 1 losers** funded the pool — their stakes ARE the case values
- The **Sponsor Jackpot** adds additional ETH on top from sponsors
- The **banker's offer** is calculated as a fraction of the remaining pool value, converted via Price Feeds

This creates a self-sustaining economy: players fund other players' games. The protocol takes a small fee. Sponsors add extra incentive. And CRE ensures nobody can cheat — not the player (missing the secret), not the banker (deterministic algorithm), not the protocol (post-game verification).

### AI Agents: Playing on Behalf of People

The legacy `AgentRegistry.sol` (`legacy/contracts/AgentRegistry.sol`) explored autonomous AI agents that could play the game. Each agent has:

- An **owner** (the human who deployed it)
- A **wallet** (funded by the owner, used to pay gas and stakes)
- A **strategy URI** (pointer to the agent's decision-making logic — accept/reject offers, which cases to open)
- A **type** — banker agent (makes offers), player agent (plays the game), or both
- A **leaderboard** — `gamesPlayed`, `totalProfitCents`, ranked by performance

This maps naturally onto the CRE architecture. An agent enters the multiplayer lottery on behalf of its owner, stakes ETH from its funded wallet, and if it wins the lottery, it plays the full game show — opening cases, evaluating banker offers against its strategy, deciding deal or no deal. The owner watches (or doesn't) while the agent plays.

The interesting emergent behavior: **agent strategies become public goods**. Since game outcomes are fully verifiable (published CRE secrets), anyone can analyze which strategies perform best. Agents compete on the leaderboard. Owners iterate on strategies. The game show becomes a platform for strategy competition — a financial game theory arena where AI agents test decision-making under uncertainty.

The `strategyURI` field supports this — it points to an IPFS hash or URL describing the agent's logic, making strategies auditable and reproducible.

### Prediction Market: Spectators Have Skin in the Game

Chainlink's [CRE Prediction Market template](https://docs.chain.link/cre-templates/prediction-market-demo) demonstrates a pattern that maps directly onto the game show: binary prediction markets settled by CRE workflows.

The template architecture:
1. A `SimpleMarket.sol` contract creates binary (Yes/No) markets where participants stake tokens
2. A CRE workflow detects market closure events, determines the outcome, and submits cryptographically signed settlement reports
3. Winners claim proportional shares of the losing side's stakes

**Applied to Deal or NOT**: spectators don't just watch — they bet on outcomes:

- **"Will the player accept the next offer?"** — Yes/No market, resolves when the player acts
- **"Will the player's case contain > $0.50?"** — resolves when the game ends and the secret is published
- **"Will any case contain $1.00?"** — resolves after all cases are revealed
- **"Will the player beat the banker's offer?"** — resolves at game over

Each market is a mini CRE workflow: listen for the relevant game event, read the outcome from contract state, submit the settlement. The same `EVMClient.logTrigger()` pattern used for case reveals works for market settlement — CRE picks up the event, determines the result, writes it on-chain.

This creates a **three-layer engagement model**:

| Layer | Participant | Stake | CRE Role |
|-------|------------|-------|----------|
| **Play** | Lottery entrant / Player | Entry stake → prize pool | Confidential case reveals |
| **Sponsor** | Sponsor | ETH deposit → jackpot | Cron-triggered distribution |
| **Predict** | Spectator | Market stake → prediction pools | Event-triggered settlement |

Every participant has skin in the game. Players play, sponsors fund, spectators predict. All settled by CRE workflows, all verifiable on-chain.

| Contract | Responsibility |
|----------|---------------|
| **PredictionMarket** | Binary markets on game outcomes, CRE-settled, spectator staking (based on [CRE template](https://docs.chain.link/cre-templates/prediction-market-demo)) |
| **AgentRegistry** | AI agent registration, funding, strategy URIs, leaderboard (legacy: `AgentRegistry.sol`) |

## 11. AI Banker: Gemini via CRE HTTP Consensus

**Contract**: `prototype/contracts/src/DealOrNotConfidential.sol` (`setBankerOfferWithMessage`)
**Gallery**: `prototype/contracts/src/BestOfBanker.sol`
**Workflow**: `prototype/workflows/banker-ai/main.ts`
**Deployed**: BestOfBanker at `0x05EdC924f92aBCbbB91737479948509dC7E23bF9` (Base Sepolia)

The prototype's banker is not just an algorithm — it's an AI personality. The CRE AI Banker workflow combines the deterministic `BankerAlgorithm.sol` offer logic with Google Gemini 2.5 Flash for personality-driven messages, all running inside CRE's HTTP consensus.

### How It Works

1. **Log Trigger**: The workflow listens for `RoundComplete(uint256 indexed gameId, uint8 round)` events
2. **Read State**: Reads the game state from chain — remaining values, opened cases, round info
3. **Compute Offer**: Mirrors the on-chain `BankerAlgorithm.sol` logic in TypeScript — expected value, discount curve, VRF-seeded variance, context adjustments
4. **Call Gemini**: Makes an HTTP request to `generativelanguage.googleapis.com` with a system prompt that includes the game context (remaining values, offer as % of EV, round number). Gemini returns a snarky banker personality message.
5. **Dual WriteReport**: Two `report()` + `writeReport()` calls in the same workflow:
   - `setBankerOfferWithMessage(gameId, offerCents, message)` → DealOrNotConfidential (the game)
   - `saveQuote(gameId, round, message)` → BestOfBanker (the gallery)

### CRE HTTP Consensus for LLM Calls

The Gemini API call uses CRE's standard HTTP capability. Multiple DON nodes make the same request independently and reach consensus on the result. For LLM responses, this means the model's output must be sufficiently deterministic across nodes — the workflow uses `temperature: 0.7` and a structured system prompt to keep responses consistent enough for BFT consensus.

The Gemini API key is injected via `runtime.config.geminiApiKey` (the CRE WASM sandbox cannot read environment variables or use `process.env`). In simulation, `cre-banker.sh` reads the key from `workflows/.env` and temporarily injects it into `config.staging.json`.

### BestOfBanker Gallery

The `BestOfBanker.sol` contract stores Gemini-generated quotes on-chain, creating a gallery of AI banker moments. It supports:

- `saveQuote(gameId, round, message)` — called by CRE or registered writers
- `getLatestMessage(gameId)` — returns the most recent quote for a game
- `getTopQuotes(limit)` — returns top-voted quotes across all games
- `upvoteQuote(quoteId)` — $0.02 upvote (Chainlink Price Feed converts ETH to USD)

The frontend reads quotes from BestOfBanker view calls (not event logs — Alchemy free tier limits `eth_getLogs` to 10 blocks).

### Gas Limit Lesson

The first deployment of BestOfBanker used a hardcoded `gasLimit: "200000"` in the banker-ai workflow for the BestOfBanker writeReport. The `onReport()` → `_saveQuote()` path involves a dynamic array push + mapping write + event emit through the Keystone Forwarder, which needs ~219k gas. The fix: use `runtime.config.gasLimit` (500000) for all writeReport calls. CRE-receiving contracts should also implement `supportsInterface()` for ERC165 compliance with the Keystone Forwarder.

## 12. Cross-Chain Play via CCIP

**Contracts**: `prototype/contracts/src/ccip/DealOrNotGateway.sol` (ETH Sepolia), `prototype/contracts/src/ccip/DealOrNotBridge.sol` (Base Sepolia)
**Deployed**: Gateway at `0xaB2995091CCE608d1F3f18f36F8e6615aB2fc124`, Bridge at `0xcF3B0d1575b30B53d8Db4EDe30Ebb47D51a2650a`

Cross-chain play via Chainlink CCIP lets players start games from ETH Sepolia that execute on Base Sepolia, where all the CRE infrastructure lives.

### Architecture

```
ETH Sepolia                           Base Sepolia
┌──────────────────┐    CCIP msg    ┌────────────────────────┐
│ DealOrNotGateway │ ──────────────→│ DealOrNotBridge        │
│                  │                │   ↓                    │
│ createGame()     │                │ DealOrNotConfidential  │
│ msg.value=$0.25  │                │   createGame()         │
│ + CCIP fee       │                │                        │
└──────────────────┘                └────────────────────────┘
```

### How It Works

1. Player calls `createGame{value: entryFee + ccipFee}()` on the Gateway contract (ETH Sepolia)
2. Gateway sends a CCIP message to Base Sepolia with the player's address and entry fee encoded
3. The Bridge contract on Base Sepolia receives the CCIP message via `_ccipReceive()`
4. Bridge calls `createGame()` on `DealOrNotConfidential`, which triggers VRF
5. Game plays out on Base Sepolia via CRE workflows

### Entry Fee

The Gateway requires a `$0.25` entry fee (converted via Price Feed) plus the CCIP message fee. The entry fee is forwarded to Base Sepolia with the CCIP message. The Bridge contract uses a `try/catch` pattern for the `createGame()` call — if it fails (e.g., contract paused), the CCIP message is still processed gracefully.

### Why CCIP Matters

CCIP demonstrates a fifth Chainlink product integration (alongside VRF, CRE, Price Feeds, and Confidential Compute). More importantly, it proves the game can be a multi-chain event — players don't need to bridge assets to Base Sepolia to play. Each spoke chain is a potential distribution channel and sponsor partnership.

## 13. Conclusion

The journey from Fisher-Yates to CRE Confidential Compute is a journey through the fundamental tension between transparency and privacy on a public blockchain.

**Approach 0 (Fisher-Yates)** taught us that on-chain storage is a glass box — any value stored is a value published.

**Approach 1 (ZK Proofs)** taught us that cryptographic commitments can verify honesty, but the host who builds the Merkle tree still knows everything. ZK hides values from the *player*, not from the *house*. And shipping a real Groth16 pipeline is a multi-week effort we didn't have.

**Approach 2 (Quantum Collapse)** taught us that lazy evaluation helps, but commit-reveal is a lock that the player holds the key to. If they can simulate the outcome before committing to it, the lock is meaningless. The cost on Base L2: ~$0.005 per exploit attempt.

**Approach 3 (Chainlink Functions)** taught us that moving values off-chain solves precomputation but introduces trusted intermediaries. The upload script knows all values. The returned values are unverifiable. And it was the wrong Chainlink product.

**Approach 4 (CRE Confidential Compute)** gets it right: VRF provides the randomness on-chain (anyone can verify the seed is fair). CRE holds the secret off-chain (the player can't precompute because they're missing a piece). Attestation proves the enclave ran the correct code. And post-game secret publication enables anyone to replay every collapse and verify the game was honest.

With security handled by CRE, the game design can focus on what matters: the game show experience. Multiplayer lobbies, lottery entry, staking economics, spectator engagement, cross-chain play via CCIP — all built on a foundation where cheating isn't deterred by penalties but made *impossible* by cryptography.

One transaction per round. No commit-reveal. No trusted scripts. No precomputation. Full post-game auditability.

*"Does Howie know what's in the box? The DON does. But no single node does."*

---

**Repository Structure:**
- `prototype/contracts/src/DealOrNot.sol` — Phase 2 base game (vulnerable to selective reveal)
- `prototype/contracts/src/DealOrNotConfidential.sol` — Phase 4 CRE Confidential (the solution)
- `prototype/contracts/src/SponsorJackpot.sol` — Sponsor jackpot system
- `prototype/contracts/src/BestOfBanker.sol` — AI Banker quote gallery + upvotes
- `prototype/contracts/src/BankerAlgorithm.sol` — Pure EV-based offer calculation library
- `prototype/contracts/src/ccip/DealOrNotGateway.sol` — CCIP spoke (ETH Sepolia)
- `prototype/contracts/src/ccip/DealOrNotBridge.sol` — CCIP hub (Base Sepolia)
- `prototype/workflows/confidential-reveal/` — CRE: case value reveals
- `prototype/workflows/sponsor-jackpot/` — CRE: jackpot deposits per case opening
- `prototype/workflows/game-timer/` — CRE: 10-min game expiry cron
- `prototype/workflows/banker-ai/` — CRE: AI Banker offers + Gemini personality
- `prototype/frontend/` — Next.js frontend
- `prototype/scripts/` — Testing scripts (play-game, cre-reveal, cre-banker, cre-jackpot, cre-timer)
- `legacy/` — Historical contracts and docs (see `legacy/README.md`)
