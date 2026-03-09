# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Overview

**Deal or NOT** is a fully on-chain game show ("Deal or No Deal") powered by 5 Chainlink products: VRF, CRE Confidential Compute, Price Feeds, CCIP, and Gemini 2.5 Flash via CRE HTTP. Deployed on Base Sepolia.

Live at **dealornot.vercel.app**.

## Repository Structure

```
deal-or-not/
├── packages/convergence/       # Production package (active development)
│   ├── contracts/              # 16 Solidity contracts
│   ├── test/                   # Forge tests (244 tests, 13 suites)
│   ├── workflows/              # 6 CRE TypeScript workflows
│   ├── scripts/                # Bash CLI (play-game, cre-simulate, e2e-full)
│   ├── script/                 # Forge deploy scripts + env.sh
│   └── dealornot/              # Next.js 16 frontend
│
├── prototype/                  # Original monolith (safety net, don't modify)
│   ├── contracts/              # Foundry, single contract
│   ├── frontend/               # Legacy frontend (was shared, now superseded)
│   └── workflows/              # CRE workflows (original versions)
│
├── docs/                       # Planning docs, whitepaper, hackathon submission
├── legacy/                     # Historical archive (ETHDenver, early attempts)
└── agent-server/               # HTTP API with 3 agent strategies
```

**Active work happens in `packages/convergence/`.** Read `packages/convergence/CLAUDE.md` for detailed contract functions, game phases, CRE workflow details, and frontend architecture.

## Common Commands

```bash
# Contracts
cd packages/convergence
forge build                     # Compile all 16 contracts
forge test                      # Run 244 tests
forge test --summary            # Quick pass/fail overview

# Frontend
cd packages/convergence/dealornot
bun install && bun run dev      # Dev server on http://localhost:3001

# Game CLI (requires Foundry + cast)
bash scripts/play-game.sh create            # Create a game ($0.25 entry)
bash scripts/play-game.sh state <GID>       # Check game state
bash scripts/play-game.sh pick <GID> 2      # Pick case #2
bash scripts/play-game.sh open <GID> 0      # Open case #0

# CRE workflows (requires CRE CLI)
bash scripts/cre-simulate.sh reveal <TX> 0  # Reveal case value
bash scripts/cre-simulate.sh banker <TX> 1  # AI banker offer
bash scripts/cre-simulate.sh support <GID>  # Auto-orchestrate all workflows

# Frontend deployment
cd packages/convergence/dealornot
npx vercel --prod
```

## Architecture

| Layer | Tech | Key Files |
|-------|------|-----------|
| Contracts | Foundry / Solidity | `packages/convergence/contracts/` |
| Frontend | Next.js 16, React 19, wagmi v2, RainbowKit | `packages/convergence/dealornot/` |
| CRE Workflows | TypeScript, @chainlink/cre-sdk | `packages/convergence/workflows/` |
| CCIP Bridge | Solidity (Gateway + Bridge) | `contracts/DealOrNotGateway.sol`, `contracts/DealOrNotBridge.sol` |
| AI Banker | Gemini 2.5 Flash via CRE Confidential HTTP | `workflows/banker-ai/` |

## Frontend Conventions

- **Next.js App Router** (not Pages Router)
- **Tailwind CSS 4** — no DaisyUI in convergence frontend
- **wagmi v2 + viem v2** — direct contract hooks (not Scaffold-ETH hooks)
- **`@/` path alias** for imports (e.g., `import { useGameState } from "@/hooks/useGameContract"`)
- **Glass UI system** — custom components in `components/glass/` (GlassCard, GlassButton, GlassBriefcase, etc.)
- **RainbowKit** for wallet connect + chain switching

### Contract Interaction Pattern

```typescript
import { useReadContract, useWriteContract } from "wagmi";
import { DEAL_OR_NOT_ABI } from "@/lib/abi";
import { CONTRACT_ADDRESS } from "@/lib/config";

// Reading
const { data } = useReadContract({
  address: CONTRACT_ADDRESS,
  abi: DEAL_OR_NOT_ABI,
  functionName: "getGameState",
  args: [gameId],
});

// Writing
const { writeContractAsync } = useWriteContract();
await writeContractAsync({
  address: CONTRACT_ADDRESS,
  abi: DEAL_OR_NOT_ABI,
  functionName: "createGame",
  value: entryFeeWei,
});
```

## Solidity Conventions

- **Foundry** for compilation, testing, deployment
- Libraries (VRFManager, PriceFeedHelper, BankerAlgorithm, GameMath) are imported by game contracts
- Deploy scripts in `script/` — run with `forge script`
- Environment: `script/env.sh` sources `.env` for keys and exports all contract addresses
- Tests use Foundry's `Test` base with `vm.prank`, `vm.expectRevert`, etc.

## Code Style

| Style | Category |
|-------|----------|
| `UpperCamelCase` | Components, types, contracts |
| `lowerCamelCase` | Variables, functions, hooks |
| `CONSTANT_CASE` | Constants, contract addresses |
| `snake_case` | Foundry script files, bash scripts |

## Key Constraints

- **VRF callback**: ~10s on Base Sepolia. Don't poll faster than 3s.
- **CRE workflows**: ~5-10s per simulation. Max sleep in scripts: 10-12s.
- **Gemini rate limits**: Free tier = 20 req/hour. 3 calls per game.
- **Price feed staleness**: 3600s default. SharedPriceFeed reverts with `StalePriceFeed()`.
- **env.sh doesn't persist across Bash tool calls**: Always inline `source script/env.sh && ...`
- **Don't install new deps without asking.**
- **Don't modify `prototype/`** — it's the safety net on main.

## Deployed Contracts

All addresses are in `packages/convergence/script/env.sh`. Key ones:

| Contract | Chain | Address |
|----------|-------|---------|
| DealOrNotQuickPlay | Base Sepolia | `0x46B6b547A4683ac5533CAce6aDc4d399b50424A7` |
| Bank | Base Sepolia | `0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB` |
| DealOrNotBridge | Base Sepolia | `0xB233eFD1623f843151C97a1fB32f9115AaE6a875` |
| DealOrNotGateway | ETH Sepolia | `0x366215E1F493f3420AbD5551c0618c2B28CBc18A` |

## Documentation

- `README.md` — Project overview, architecture, quick start for judges
- `claude-judges.md` — 5-minute technical review for hackathon judges
- `packages/convergence/CLAUDE.md` — Deep technical reference (contracts, phases, workflows, frontend)
- `docs/Whitepaper.md` — Why CRE is the right solution (4 approaches analyzed)
- `DEPLOYMENT_GUIDE.md` — How to deploy contracts
