# Cash Case — Plans & Status

## What's Done

### Contracts (all committed)
- **DealOrNoDeal.sol** — Legacy Fisher-Yates (exploitable). 89 tests passing. Kept as "before" for presentation.
- **CashCase.sol** — Brodinger's Case edition. Quantum collapse mechanic (values don't exist until observed). Commit-reveal per round prevents bot precomputation. 51 BrodingerCase tests + 57 CashCase tests passing.
- **CaseCheat.sol** — Exploit contract proving Fisher-Yates vulnerability. 4 tests with presentation-ready output.
- **BrodingerCheatProof.test.ts** — Side-by-side proof that CaseCheat fails against CashCase.
- **AgentRegistry.sol** — AI agent system for autonomous play.
- **CCIP contracts** — Cross-chain betting bridge (CaseCashGateway, CCIPBridge).
- **Deploy scripts** — 01 (DealOrNoDeal), 02 (CashCase), 03 (Registry), 04 (CCIP).

### Frontend
- Multi-chain aware (Base Sepolia, 0G, ADI, localhost)
- Chain selector, CCIP betting hooks
- Contract address config per chain

### Known Issues
- `@chainlink/contracts` needs OZ 4.9.6, `@chainlink/contracts-ccip` needs OZ 5.0.2 — incompatible in same project. Compilation breaks after `npx hardhat clean`. **This will be resolved by merging into Ryan's foundry repo.**

## Next: Merge with Ryan's Foundry Repo

Ryan has "deal-or-not" repo with:
- Foundry setup (some judges prefer it)
- Multiple smart contracts already deployed
- Site live on Vercel

### Merge Strategy
1. Copy our Solidity contracts into Ryan's repo (CashCase.sol, CaseCheat.sol, AgentRegistry.sol, CCIP contracts)
2. Copy test suites (adapt from Hardhat to Foundry if needed, or keep Hardhat as secondary)
3. Port deploy scripts or use Foundry's forge script
4. Frontend components merge into Ryan's Vercel app
5. Resolve dependency conflicts in Ryan's cleaner environment

### What to Bring Over
- `contracts/CashCase.sol` — the star of the show
- `contracts/attacks/CaseCheat.sol` — for the presentation exploit demo
- `contracts/AgentRegistry.sol` — AI agent system
- `contracts/ccip/` — cross-chain betting
- `test/BrodingerCase.test.ts` — 51 tests for CashCase
- `test/BrodingerCheatProof.test.ts` — side-by-side exploit proof
- Frontend components (chain selector, CCIP hooks, game contract hooks)

## Plan: Deploy to Sponsor Testnets

### Context

ETHDenver 2026 hackathon. Targeting 3 sponsor tracks:
- Base ($10k) — "Self-Sustaining Autonomous Agents" → agent system on Base Sepolia
- 0g Labs ($25k) — "On-Chain Agents / DeFAI" → game + agents on 0G Newton Testnet
- ADI Foundation ($25k) — "Open Project" ($19k) → game on ADI Chain

### Target Chains

 Target Chains

 ┌──────────────────────────┬───────┬───────────────────────────────┬──────────────────────────────┬───────┐
 │          Chain           │  ID   │              RPC              │          Chainlink?          │ Token │
 ├──────────────────────────┼───────┼───────────────────────────────┼──────────────────────────────┼───────┤
 │ Base Sepolia             │ 84532 │ https://sepolia.base.org      │ Yes (VRF v2.5 + Price Feeds) │ ETH   │
 ├──────────────────────────┼───────┼───────────────────────────────┼──────────────────────────────┼───────┤
 │ 0G Newton Testnet        │ 16602 │ https://evmrpc-testnet.0g.ai  │ No                           │ A0GI  │
 ├──────────────────────────┼───────┼───────────────────────────────┼──────────────────────────────┼───────┤
 │ ADI Chain (mainnet only) │ 36900 │ https://rpc.adifoundation.ai/ │ No                           │ ADI   │
 └──────────────────────────┴───────┴───────────────────────────────┴──────────────────────────────┴───────┘

 Plan

 Step 1: Test and commit CashCase.sol --- DONE

 - CashCase.test.ts (57 tests) + BrodingerCase.test.ts (51 tests) + BrodingerCheatProof.test.ts (4 tests)
 - Fixed abi.encode vs abi.encodePacked hash mismatch
 - All committed

 Step 2: Add mock-deployable mode for non-Chainlink chains

 For 0G and ADI (no Chainlink), deploy MockVRFCoordinator + MockV3Aggregator alongside the game contract. The existing mocks in contracts/mocks/ already work — they just need to be
 deployed on those chains too.

 Create a simple deploy checklist/script that:
 1. Deploys MockV3Aggregator (price = $2000)
 2. Deploys VRFCoordinatorV2_5Mock
 3. Creates + funds VRF subscription
 4. Deploys CashCase with mock addresses
 5. Adds CashCase as VRF consumer
 6. Deploys AgentRegistry

 For Remix: flatten CashCase.sol + mocks so user can deploy directly.

 Files: scripts/flatten.sh or use npx hardhat flatten

 Step 3: Add chain configs to hardhat.config.ts --- DONE

 Added 0G Newton (16602) and ADI Chain (36900) to hardhat.config.ts.

 File: hardhat.config.ts

 Step 4: Update deploy script for CashCase

 Create deploy/05-deploy-cashcase.ts that:
 - On local/testnet-without-chainlink: deploys mocks first, then CashCase
 - On Base Sepolia: uses real Chainlink addresses (VRF Coordinator, key hash, ETH/USD price feed from Chainlink docs)
 - Also deploys AgentRegistry
 - Prints all addresses for frontend env vars

 Files: deploy/05-deploy-cashcase.ts

 Step 5: Update frontend for multi-chain --- IN PROGRESS

 - Chain selector component added
 - Contract address config per chain added
 - CCIP betting hooks added
 - Still needs: testing with actual testnet deployments

 Files: frontend/app/page.tsx, frontend/lib/contracts.ts, frontend/components/ChainSelector.tsx, frontend/lib/chains.ts

 Step 6: Create VRF auto-fulfiller for non-Chainlink chains

 On 0G and ADI, there are no Chainlink keepers to fulfill VRF. Need scripts/auto-fulfill-vrf.ts adapted to connect to those RPCs and auto-fulfill mock VRF requests (same as local, just
 different RPC).

 File: scripts/auto-fulfill-vrf.ts (update to accept --network flag, already works with hardhat --network param)

 Step 7: Deployment (user does via Remix or hardhat)

 Base Sepolia (real Chainlink):
 1. User creates VRF subscription at vrf.chain.link for Base Sepolia
 2. Fund subscription with LINK (get from faucets.chain.link)
 3. Look up VRF Coordinator + key hash + ETH/USD price feed from Chainlink supported networks
 4. Deploy CashCase via Remix with real Chainlink params
 5. Add contract as VRF consumer in subscription dashboard
 6. Deploy AgentRegistry (no constructor args)

 0G Newton Testnet (mock Chainlink):
 1. Get testnet A0GI from 0G faucet (0.1/day limit)
 2. Deploy MockV3Aggregator + VRFCoordinatorV2_5Mock via Remix
 3. Create subscription + fund it on mock coordinator
 4. Deploy CashCase with mock addresses
 5. Deploy AgentRegistry
 6. Run auto-fulfill-vrf.ts pointed at 0G RPC

 ADI Chain (mock Chainlink):
 1. Bridge ADI/ETH via bridge.adifoundation.ai
 2. Same mock deployment flow as 0G
 3. Run auto-fulfill-vrf.ts pointed at ADI RPC

 Step 8: Update JUDGES.md

 Reflect Brodinger's Case design, multi-chain deployment, and target the 3 sponsor tracks.

 File: JUDGES.md

 Verification

 1. npx hardhat test — all old tests still pass + new CashCase tests pass
 2. Deploy to Base Sepolia via Remix → play a game with MetaMask on Base Sepolia
 3. Deploy to 0G with mocks → verify game works with auto-fulfiller running
 4. Frontend connects to each chain and shows correct game state
 5. Agent system registers + runs on at least one testnet

 Order of Operations

 1. Step 1 (tests) — must come first, might find bugs in CashCase.sol
 2. Steps 2-4 (deploy infra) — parallel-ish
 3. Step 5 (frontend) — after we have at least one testnet deployment
 4. Steps 6-7 (deploy) — user deploys via Remix once contracts are ready
 5. Step 8 (docs) — last