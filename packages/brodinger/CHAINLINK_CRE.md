# Chainlink CRE — Could It Replace Our Mocks?

*Research notes for Cash Case ETHDenver 2026*

## What Is CRE?

Chainlink CRE (Compute Runtime Environment) is an orchestration layer for building workflows that combine on-chain and off-chain operations. Think of it as "serverless functions for smart contracts" — you write workflows in Go/TypeScript, they compile to WebAssembly, and execute across a Decentralized Oracle Network (DON) with Byzantine Fault Tolerant consensus.

**Source:** https://docs.chain.link/cre/llms-full-ts.txt

## Core Architecture

```
Trigger (cron / HTTP / blockchain event)
    → Callback (your business logic)
        → Capabilities (EVM read/write, HTTP fetch, confidential HTTP)
            → Result (consensus-verified across multiple nodes)
```

Key pieces:
- **Workflows**: Compiled WASM binaries running on DONs
- **Capabilities**: Decentralized microservices (EVM read, EVM write, HTTP fetch, confidential HTTP)
- **Triggers**: Cron schedules, HTTP requests, blockchain events
- **KeystoneForwarder**: The on-chain contract that receives workflow results

## Local Testing

```bash
cre workflow simulate
```

This compiles your workflow to WASM and runs it locally, making **real calls** to live APIs and public blockchains. You can test end-to-end flows without deploying.

## How It Relates to Cash Case

### What CRE IS good for:
- **Agent orchestration** — CRE workflows could trigger AI agent decisions off-chain and write results on-chain. This aligns with our AI agent system and the 0g Labs / Base bounties for autonomous agents.
- **Cross-chain coordination** — CRE can read from one chain and write to another, potentially simplifying our CCIP betting bridge.
- **Off-chain computation** — Banker offer calculations, strategy evaluation, and game state analysis could run as CRE workflows with consensus verification.
- **Event-driven automation** — Watch for game phase changes and trigger agent actions automatically.

### What CRE does NOT replace:
- **VRF** — CRE doesn't generate verifiable randomness. We still need Chainlink VRF for our Schrödinger's Case seed. CRE orchestrates workflows; VRF provides provably fair entropy.
- **Price Feeds** — We still use Chainlink Price Feeds for ETH/USD conversion. CRE could *read* a price feed as part of a workflow, but doesn't replace the feed itself.

### The mocks question:
Our current `MockVRFCoordinator` and `MockPriceFeed` exist because Hardhat tests can't call real Chainlink services. CRE's `cre workflow simulate` tests workflows against live APIs, but our unit tests test *contract logic*, not workflow orchestration. So:

- **CRE won't eliminate our Solidity mocks** — we still need `MockVRFCoordinator` to simulate VRF callbacks in Hardhat tests
- **CRE could reduce integration test complexity** — instead of mocking cross-chain flows, a CRE workflow could orchestrate a real end-to-end test against testnets
- **CRE is most valuable for our agent system** — agents making decisions off-chain and executing on-chain is exactly the CRE use case

## Bounty Angle

CRE integration strengthens our pitch for:
- **0g Labs Best DeFAI App** ($7K-$14K) — AI agents powered by CRE workflows
- **Base Self-Sustaining Agents** ($10K) — CRE-orchestrated autonomous game play
- **Kite AI Agent-Native Payments** ($10K) — CRE workflows handling agent payment flows

## TL;DR

CRE is powerful but solves a different problem than our mocks. It's an orchestration layer, not a testing framework. Our Hardhat mocks stay. But CRE could be the backbone for our AI agent system — agents as CRE workflows making consensus-verified decisions. Worth exploring as a "phase 2" integration or mentioning in the pitch as future architecture.

---

> **Update (March 2026):** CRE was fully integrated and is now the core of the prototype. Four CRE workflows are built and E2E tested on Base Sepolia:
>
> 1. **confidential-reveal** — CRE Confidential Compute replaces commit-reveal entirely. Values are derived from VRF seed + CRE-held secret, written via Keystone Forwarder. 1 TX per round.
> 2. **sponsor-jackpot** — Log-trigger on CaseOpenRequested. Picks random jackpot amount from top 2 remaining values, writes addToJackpot().
> 3. **game-timer** — Cron trigger every 10 min. Expires stale games, clears jackpots. Two writeReport calls in one workflow.
> 4. **banker-ai** — Log-trigger on RoundComplete. Computes EV-based offer in TypeScript, calls Gemini 2.5 Flash for personality message, dual writeReport to game contract + BestOfBanker gallery.
>
> The conclusion above ("CRE could be the backbone") turned out to be exactly right — it IS the backbone. See `prototype/workflows/` and `Whitepaper.md` Sections 5, 7, 10.
