# Legacy Archive — Deal or NOT Historical Artifacts

These files document the evolution from Phase 0 (Fisher-Yates shuffle) through Phase 3 (Chainlink Functions) as we searched for the correct way to hide case values from players on a public blockchain. Each file maps to a section in [`Whitepaper.md`](../Whitepaper.md) at the repo root.

**These contracts are NOT intended for deployment.** They exist as historical reference for the security evolution documented in the whitepaper.

## Folder Structure

```
legacy/
├── README.md                          ← You are here
├── contracts/
│   ├── DealOrNoDeal.sol               Phase 0: 12-case Fisher-Yates
│   ├── CashCase.sol                   Phase 1: Brodinger's Case refactor
│   ├── AgentRegistry.sol              Stretch goal: AI agent registry
│   ├── attacks/
│   │   └── CaseCheat.sol              Proof-of-concept attack on Phase 0
│   ├── ccip/
│   │   ├── CCIPBridge.sol             Cross-chain betting (Avalanche)
│   │   ├── CaseCashGateway.sol        Cross-chain betting (Base)
│   │   └── IBettingPool.sol           Betting pool interface
│   └── mocks/
│       ├── MockBettingPool.sol        Test mock
│       ├── MockPriceFeed.sol          Test mock
│       ├── MockVRFCoordinator.sol     Test mock
│       └── HashDebug.sol              Debug helper
├── docs/
│   ├── SITUATION.md                   Original Brodinger design document
│   ├── CHAINLINK_CRE.md              Early CRE research notes
│   ├── ZK_INTEGRATION_PLAN.md        ZK approach (abandoned)
│   ├── AUDIT_REPORT.md               Security audit report
│   └── JUDGES.md                      Original hackathon pitch
```

## Contracts

### Core Game Contracts

| Contract | Phase | Whitepaper Section | What It Does | Why It Was Superseded |
|----------|-------|-------------------|--------------|----------------------|
| `DealOrNoDeal.sol` | 0 | Section 2 | 12-case game with Fisher-Yates shuffle. VRF generates 12 random words, shuffles all values at game creation, stores them bit-packed in a single `uint256`. | All values in storage — anyone can read them with `eth_getStorageAt`. See `CaseCheat.sol`. |
| `CashCase.sol` | 1 | Section 3 | Brodinger's Case refactor. Values don't exist until observed. Introduced the "quantum collapse" metaphor — VRF seed + case context generates value at reveal time. | Evolved into `prototype/contracts/src/DealOrNot.sol` (5-case version with commit-reveal + blockhash entropy). Still vulnerable to selective reveal. |

### Attack Contract

| Contract | Whitepaper Section | What It Demonstrates |
|----------|-------------------|---------------------|
| `attacks/CaseCheat.sol` | Section 2 | Proof-of-concept bot that reads bit-packed case values from storage, decodes every case, then opens only low-value cases. If it's about to open a high-value case, it reverts the TX (costs no gas — simulation catches it). Proves Fisher-Yates is obfuscation, not security. |

### CCIP Cross-Chain Betting (Deferred)

Cross-chain betting was explored as a stretch goal: spectators on Avalanche could bet on game outcomes happening on Base.

| Contract | What It Does |
|----------|-------------|
| `ccip/CCIPBridge.sol` | Avalanche-side bridge. Receives bets, sends cross-chain messages to Base via Chainlink CCIP. |
| `ccip/CaseCashGateway.sol` | Base-side gateway. Receives CCIP messages, resolves bets against game state. |
| `ccip/IBettingPool.sol` | Interface for betting pool operations (deposit, withdraw, resolve). |

This feature was deferred to later phases — the core game security had to be solved first.

### Mock Contracts

Used for local Hardhat testing before deploying to Base Sepolia.

| Contract | Mocks |
|----------|-------|
| `mocks/MockBettingPool.sol` | Betting pool for CCIP tests |
| `mocks/MockPriceFeed.sol` | Chainlink Price Feed (`AggregatorV3Interface`) |
| `mocks/MockVRFCoordinator.sol` | Chainlink VRF Coordinator |
| `mocks/HashDebug.sol` | Helper for debugging hash computations |

## Documentation

| Document | Whitepaper Section | What It Covers |
|----------|-------------------|---------------|
| `docs/SITUATION.md` | Section 3 | The original "Brodinger's Case" design document. Explains why values shouldn't exist in storage, introduces the quantum collapse metaphor, and designs the 3-layer randomness strategy. |
| `docs/CHAINLINK_CRE.md` | Section 5 | Early research into CRE capabilities. Key conclusion: CRE is an orchestration layer, not just a testing tool. Led to the CRE Confidential Compute design. |
| `docs/ZK_INTEGRATION_PLAN.md` | — | 6-week plan for ZK circuit implementation (abandoned). Would have used ZK proofs to verify off-chain value computation. Abandoned when audit revealed mock circuits weren't real ZK. |
| `docs/AUDIT_REPORT.md` | — | Security audit identifying critical issues: mock ZK proofs, unverified off-chain computation, and centralized trust assumptions. |
| `docs/JUDGES.md` | — | Original hackathon pitch. Shows the initial vision before security analysis revealed the depth of the hidden-values problem. |

## Evolution Timeline

| Phase | Contract | Approach | Vulnerability | Chainlink Products |
|-------|----------|----------|---------------|-------------------|
| 0 | `DealOrNoDeal.sol` | Fisher-Yates shuffle, all values in storage | Storage readable by anyone | VRF |
| 1 | `CashCase.sol` | Quantum collapse, values don't exist until observed | Precomputable from VRF seed | VRF |
| 1.5 | — | ZK proofs (abandoned) | Mock circuits, not real ZK | — |
| 2 | `prototype/.../DealOrNot.sol` | Quantum collapse + commit-reveal + blockhash | Selective reveal: $0.005 per attempt | VRF, Price Feeds |
| 3 | `prototype/.../DealOrNotConfidential.sol` (old) | Chainlink Functions threshold encryption | Trusted upload script, wrong product | VRF, Functions |
| **4** | `prototype/.../DealOrNotConfidential.sol` (current) | **CRE Confidential Compute** | **None known** | **VRF, CRE, Price Feeds** |

## Current Implementation

The active contracts live in `prototype/contracts/src/`:

- **`DealOrNot.sol`** — Phase 2 base game (quantum collapse + commit-reveal). Works but vulnerable to selective reveal.
- **`DealOrNotConfidential.sol`** — Phase 4 CRE Confidential rewrite. VRF on-chain + CRE enclave secret. The correct solution.
- **`SponsorJackpot.sol`** — Sponsor jackpot system (orthogonal to case value hiding).
- **`BankerAlgorithm.sol`** — Banker offer calculation library (used by both base game and confidential version).
