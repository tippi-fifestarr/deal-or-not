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

## 2. Approach 1: Fisher-Yates Shuffle

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

## 3. Approach 2: Quantum Collapse + Commit-Reveal

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

## 4. Approach 3: Chainlink Functions Threshold Encryption

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

## 5. Approach 4: CRE Confidential Compute (The Solution)

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

## 6. Comparison Table

| | Phase 0: Fisher-Yates | Phase 2: Quantum Collapse | Phase 3: Functions | Phase 4: CRE Confidential |
|---|---|---|---|---|
| **Values precomputable?** | Yes (storage) | Yes (selective reveal) | No | No |
| **Player can abort?** | Yes (revert TX) | Yes (skip reveal) | Yes (skip reveal) | No (CRE writes) |
| **TXs per round** | 1 | 2 (commit + reveal) | 2 (commit + reveal) | **1** (openCase) |
| **Cost per game** | ~$0.25 LINK | ~$0.25 LINK | ~$15 LINK | ~$0.50 LINK |
| **Trusted party** | None | None | Upload script | None |
| **Verifiable post-game?** | N/A (all public) | N/A (all public) | No | **Yes** (secret published) |
| **Chainlink products** | VRF | VRF, Price Feeds | VRF, Functions | **VRF, CRE, Price Feeds** |
| **Contract** | `legacy/DealOrNoDeal.sol` | `prototype/DealOrNot.sol` | old Confidential | **`prototype/DealOrNotConfidential.sol`** |

## 7. CRE Sponsor Jackpot

**Contract**: `prototype/contracts/src/SponsorJackpot.sol`
**Workflow**: `prototype/workflows/sponsor-jackpot/workflow/main.ts`
**Deployed**: `0x43a55c6EdCc8183b3FD9818b4d6Bf02a5e6590Ba` (Base Sepolia)

Orthogonal to the case value hiding problem, the Sponsor Jackpot adds real economic incentive to the game. Sponsors deposit ETH, and a CRE cron workflow deposits random jackpot amounts into active games every 30 seconds.

**How it works:**
1. Sponsors register with name and logo, deposit ETH
2. Sponsors assign themselves to games (`assignToGame(gameId)`)
3. CRE cron workflow scans recent games, picks random jackpot amounts, calls `addToJackpot()`
4. Player claims jackpot if they go "no deal" all the way (`totalCollapsed == 5`)
5. Jackpot is converted from cents to ETH using the game's price snapshot

This system is a **proving ground for CRE workflows** — it demonstrates event-driven CRE → on-chain writes, the exact pattern needed for confidential case reveals.

## 8. Architecture

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
│  setBankerOffer() / acceptDeal() / rejectDeal()                │
│  keepCase() / swapCase() → CRE reveals final values            │
│                                                                 │
│  verifyGame() ← Anyone can verify with published secret        │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                    SPONSOR JACKPOT (Orthogonal)                 │
│                                                                 │
│  CRE Cron ──→ addToJackpot(gameId, amount)                     │
│  Player   ──→ claimJackpot(gameId) if no-deal all the way      │
│                                                                 │
│  Sponsor deposits ETH → assigned to games → CRE distributes    │
└─────────────────────────────────────────────────────────────────┘
```

### Chainlink Products Used

```
VRF v2.5          → Seed generation (fairness)
CRE + Vault DON   → Secret management (privacy)
CRE Event Trigger  → Case reveal workflow (automation)
CRE Cron Trigger   → Sponsor jackpot deposits (automation)
Price Feeds        → ETH/USD conversion (payout)
```

## 9. Conclusion

The journey from Fisher-Yates to CRE Confidential Compute is a journey through the fundamental tension between transparency and privacy on a public blockchain.

**Phase 0** taught us that on-chain storage is a glass box — any value stored is a value published.

**Phase 2** taught us that lazy evaluation helps, but commit-reveal is a lock that the player holds the key to. If they can simulate the outcome before committing to it, the lock is meaningless.

**Phase 3** taught us that moving values off-chain solves precomputation but introduces trusted intermediaries. The upload script knows all values. The returned values are unverifiable.

**Phase 4** gets it right: VRF provides the randomness on-chain (anyone can verify the seed is fair). CRE holds the secret off-chain (the player can't precompute because they're missing a piece). Attestation proves the enclave ran the correct code. And post-game secret publication enables anyone to replay every collapse and verify the game was honest.

One transaction per round. No commit-reveal. No trusted scripts. No precomputation. Full post-game auditability.

*"Does Howie know what's in the box? The DON does. But no single node does."*

---

**Repository Structure:**
- `prototype/contracts/src/DealOrNot.sol` — Phase 2 base game (vulnerable to selective reveal)
- `prototype/contracts/src/DealOrNotConfidential.sol` — Phase 4 CRE Confidential (the solution)
- `prototype/contracts/src/SponsorJackpot.sol` — Sponsor jackpot system
- `prototype/workflows/` — CRE workflows (sponsor-jackpot + confidential-reveal)
- `legacy/` — Historical contracts and docs (see `legacy/README.md`)
