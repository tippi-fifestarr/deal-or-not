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
**Deployed**: `0x7B04840165E05877A772E3b1c71fE05399101De0` (Base Sepolia)

Orthogonal to the case value hiding problem, the Sponsor Jackpot adds real economic incentive to the game. Sponsors deposit ETH, and a CRE workflow deposits random jackpot amounts into active games (triggered per case opening or via a 10-minute cron).

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
CRE Event Trigger  → Case reveals + prediction market settlement (automation)
CRE Cron Trigger   → Sponsor jackpot deposits (automation)
Price Feeds        → ETH/USD conversion (payout)
CCIP              → Cross-chain staking and play (interoperability)
```

## 9. Game Design: From Prototype to Production

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

## 10. Conclusion

The journey from Fisher-Yates to CRE Confidential Compute is a journey through the fundamental tension between transparency and privacy on a public blockchain.

**Phase 0** taught us that on-chain storage is a glass box — any value stored is a value published.

**Phase 2** taught us that lazy evaluation helps, but commit-reveal is a lock that the player holds the key to. If they can simulate the outcome before committing to it, the lock is meaningless. Timers and deposits can deter the attack, but they can't prevent it.

**Phase 3** taught us that moving values off-chain solves precomputation but introduces trusted intermediaries. The upload script knows all values. The returned values are unverifiable.

**Phase 4** gets it right: VRF provides the randomness on-chain (anyone can verify the seed is fair). CRE holds the secret off-chain (the player can't precompute because they're missing a piece). Attestation proves the enclave ran the correct code. And post-game secret publication enables anyone to replay every collapse and verify the game was honest.

With security handled by CRE, the game design can focus on what matters: the game show experience. Multiplayer lobbies, lottery entry, staking economics, spectator engagement, cross-chain play via CCIP — all built on a foundation where cheating isn't deterred by penalties but made *impossible* by cryptography.

One transaction per round. No commit-reveal. No trusted scripts. No precomputation. Full post-game auditability.

*"Does Howie know what's in the box? The DON does. But no single node does."*

---

**Repository Structure:**
- `prototype/contracts/src/DealOrNot.sol` — Phase 2 base game (vulnerable to selective reveal)
- `prototype/contracts/src/DealOrNotConfidential.sol` — Phase 4 CRE Confidential (the solution)
- `prototype/contracts/src/SponsorJackpot.sol` — Sponsor jackpot system
- `prototype/workflows/` — CRE workflows (sponsor-jackpot + confidential-reveal)
- `legacy/` — Historical contracts and docs (see `legacy/README.md`)
