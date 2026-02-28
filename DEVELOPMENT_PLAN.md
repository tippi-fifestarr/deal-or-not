# Deal or NOT - Development Plan

**Last Updated**: February 28, 2026
**Branch**: `prototype-12boxupgrade-uni`
**Status**: Phase 2 Complete

---

## Project Vision

On-chain Deal or No Deal game show using Chainlink products for provably fair randomness, automated workflows, and future confidential compute integration.

**Core Principle**: "Brodinger's Case" - Case values don't exist until observed (quantum superposition analogy)

---

## Current Status

### ✅ Phase 1: Base Game (Complete)
- **Smart Contract**: `prototype/contracts/src/DealOrNot.sol`
  - Chainlink VRF v2.5 for quantum seed
  - Commit-reveal protocol (3-layer randomness)
  - Quantum collapse engine (`_collapseCase()`)
  - On-chain banker algorithm with variance
  - Single-player mode functional
  - 5 cases, 4 rounds prototype

- **Frontend**: Next.js 16 + Tailwind v3
  - Game creation and play flow
  - Case selection and reveals
  - Banker offer display
  - Deal/No Deal decisions
  - Game state visualization

- **Chainlink Integration**:
  - VRF v2.5 for provably fair randomness
  - Price Feeds (ETH/USD) for prize conversion
  - On-chain banker offers (pure function)

### ✅ Phase 2: CRE Auto-Reveal (Complete)
- **Contract Support**:
  - `keystoneForwarder` address (DON authorized caller)
  - `autoRevealEnabled` flag
  - `_requirePlayerOrForwarder()` authorization
  - Admin functions: `setKeystoneForwarder()`, `setAutoRevealEnabled()`

- **CRE Workflow**: `prototype/workflows/case-reveal-orchestrator.ts`
  - Event listener for `CaseCommitted`
  - Automatic 1-block wait
  - Auto-reveal via Keystone Forwarder
  - DON consensus (4-of-6 BFT)
  - Fallback handling

- **Documentation**:
  - `workflows/README.md` - Architecture and setup
  - `workflows/INTEGRATION.md` - Frontend integration guide
  - Configuration templates and examples

- **UX Improvement**: Player sends 1 TX instead of 2 (commit only, CRE handles reveal)

---

## ❌ NOT Being Implemented

The following features are **excluded from the roadmap**:

### AI Banker with LLM Integration
- ~~AI-powered offers using Claude API~~
- ~~Player psychology analysis~~
- ~~Market condition analysis~~
- ~~Multi-game learning~~

**Rationale**: Keeping the banker algorithm deterministic and on-chain. AI introduces complexity, API dependencies, and unpredictable costs.

### Prediction Market Banker Integration
- ~~Banker adjusting offers based on prediction market odds~~
- ~~AI reading crowd wisdom from betting markets~~

**Rationale**: Banker should be based on game state and EV, not external market speculation.

### Cross-Chain via CCIP (Phase 5)
- ~~CCIP bridge for cross-chain games~~
- ~~Multi-chain prize pools~~

**Rationale**: Single-chain focus for MVP. Multi-chain adds significant complexity.

---

## 🚀 Development Roadmap

### Phase 3: Confidential Compute (Planned)
**Goal**: True quantum superposition - case values literally don't exist until revealed

**Status**: Not started
**Priority**: High
**Complexity**: High

#### Features
- **Threshold Encryption (DKG)**
  - DON generates shared key via Distributed Key Generation
  - No single node has full decryption key
  - Case values encrypted on-chain as `bytes encryptedValue`

- **TEE Enclaves (Intel SGX / AMD SEV)**
  - Values assigned in secure enclaves
  - Computation isolated from DON nodes
  - Attestation proofs for verification

- **On-Chain State Changes**
  - Replace `uint256 caseValues[5]` with `bytes[5] encryptedValues`
  - New function: `revealWithProof(gameId, caseIndex, proof)`
  - Decryption happens only at reveal time

- **Security Benefits**
  - No pre-computation possible (currently VRF seed + blockhash = deterministic)
  - Even DON nodes cannot predict values
  - True "Brodinger's Case" implementation

#### Implementation Steps
1. Research Chainlink Confidential Compute documentation
2. Design threshold encryption scheme
3. Update contract for encrypted state
4. Create TEE-based workflow
5. Add attestation verification
6. Test on testnet with Chainlink DON

#### Resources
- [Chainlink Confidential Computing](https://docs.chain.link)
- [TEE Overview](https://en.wikipedia.org/wiki/Trusted_execution_environment)

---

### Phase 4: Multi-Player Mode (Planned)
**Goal**: Multiple players compete in same game

**Status**: Contract support exists, frontend not built
**Priority**: Medium
**Complexity**: Medium

#### Features
- **Game Modes**
  - Competitive: Last player standing wins entire pool
  - Cooperative: Players share based on performance
  - Spectator: Watch live games

- **Turn-Based Mechanics**
  - Round-robin case selection
  - Shared case pool (values collapse for all)
  - Individual banker offers (different EV per player)

- **Contract Changes Needed**
  - Extend `Game` struct for multiple players
  - Player turn management
  - Prize distribution logic
  - Elimination mechanics

- **Frontend Changes**
  - Lobby system (join games)
  - Player list display
  - Turn indicator
  - Multi-player game board

#### Implementation Steps
1. Design multi-player game flow
2. Update contract with player array
3. Add turn management logic
4. Build lobby UI
5. Implement multi-player game board
6. Test with 2-4 players locally

---

### Phase 5: Frontend Polish (Planned)
**Goal**: Game show experience

**Status**: Not started
**Priority**: Medium
**Complexity**: Low-Medium

#### Features
- **Animations**
  - Case opening effects
  - Value reveal animations
  - Deal/No Deal decision cinematics
  - Confetti for big wins

- **Sound & Music**
  - Background music (game show theme)
  - Case open sound effects
  - Dramatic stings (banker offers, reveals)
  - Victory/defeat sounds

- **Banker Character**
  - Animated avatar
  - Speech bubbles for offers
  - Personality (taunts, encouragement)
  - Optional: Video clips integration

- **Game History**
  - Past games leaderboard
  - Player stats (win rate, average payout)
  - Best/worst deals
  - Share results to social

- **Mobile Responsiveness**
  - Touch-friendly case selection
  - Portrait/landscape layouts
  - Optimized animations for mobile

#### Implementation Steps
1. Design animation library (Framer Motion?)
2. Source sound effects (royalty-free)
3. Create banker avatar/character
4. Build game history database
5. Add social sharing
6. Mobile optimization pass

---

### Phase 6: Prize Pools & Monetization (Planned)
**Goal**: Real money games

**Status**: Not started
**Priority**: High (for launch)
**Complexity**: Medium

#### Features
- **Entry Fees**
  - Pay ETH to create game
  - Fee determines prize pool scale
  - Minimum/maximum entry amounts

- **Prize Pool Mechanics**
  - Scale case values based on entry fee
  - Example: 0.01 ETH entry = 5x multiplier
  - Dynamic value arrays per game

- **Revenue Model**
  - House edge (5-10% of entry fee)
  - Used for:
    - Chainlink service fees (VRF, CRE)
    - Protocol development
    - Marketing/growth
  - Transparent fee display

- **Fairness Guarantees**
  - EV calculation shown upfront
  - Maximum theoretical payout displayed
  - Provably fair VRF seed
  - All logic verifiable on-chain

#### Implementation Steps
1. Add entry fee parameter to `createGame()`
2. Scale case values dynamically
3. Implement house edge collection
4. Add prize pool display to frontend
5. Create fee transparency page
6. Legal review (gambling regulations)

---

### Phase 7: Deployment & Launch (Planned)
**Goal**: Production deployment on Base

**Status**: Not started
**Priority**: High (before launch)
**Complexity**: Medium

#### Pre-Launch Checklist

**Smart Contract**
- [ ] Security audit (external firm)
- [ ] Gas optimization pass
- [ ] Deploy to Base Sepolia testnet
- [ ] Beta testing (50+ games)
- [ ] Fix any discovered issues
- [ ] Deploy to Base mainnet
- [ ] Verify on Basescan
- [ ] Transfer ownership to multisig

**Chainlink Setup**
- [ ] VRF subscription funded
- [ ] Keystone Forwarder configured
- [ ] CRE workflow deployed to DON
- [ ] Monitoring/alerting setup
- [ ] Fallback mechanisms tested

**Frontend**
- [ ] Deploy to Vercel
- [ ] Custom domain (dealornot.xyz?)
- [ ] SEO optimization
- [ ] Analytics integration (Plausible/Fathom)
- [ ] Error tracking (Sentry)
- [ ] Mobile testing (iOS/Android)

**Legal & Compliance**
- [ ] Terms of Service
- [ ] Privacy Policy
- [ ] Gambling license research (if needed)
- [ ] Geo-restrictions (if required)
- [ ] Age verification (18+)

**Marketing**
- [ ] Landing page
- [ ] Demo video
- [ ] Twitter/X announcement
- [ ] Discord community
- [ ] Farcaster integration?
- [ ] Launch on Product Hunt

---

## Technical Architecture

### Smart Contract Stack
```
DealOrNot.sol (Game Logic)
├── VRFConsumerBaseV2Plus (Chainlink VRF)
├── AggregatorV3Interface (Price Feeds)
├── BankerAlgorithm.sol (Offer Calculation)
└── Ownable (Access Control)
```

### Frontend Stack
```
Next.js 16 (App Router)
├── React 19
├── Tailwind CSS v3
├── wagmi (Ethereum React Hooks)
├── viem (Ethereum Client)
└── @tanstack/react-query (State Management)
```

### Chainlink Integration
```
Phase 1: VRF v2.5 (Random Seed)
Phase 1: Price Feeds (ETH/USD)
Phase 2: CRE Auto-Reveal (Keystone Forwarder)
Phase 3: Confidential Compute (Threshold Encryption + TEE)
```

---

## Key Decisions & Rationale

### Why Base?
- Low gas costs (~$0.005 per transaction)
- Fast finality (~2 seconds)
- Coinbase ecosystem
- Growing DeFi/gaming community

### Why 5 Cases (Not 26)?
- Prototype simplicity
- Faster game completion (4 rounds vs 10)
- Lower gas costs (smaller arrays)
- Can scale to 12 or 26 later

### Why Commit-Reveal (Not Just VRF)?
- VRF seed alone is deterministic → pre-computation attack
- Blockhash adds entropy unknown at commit time
- 256-block reveal window enforced
- Future: Replace with Confidential Compute for true randomness

### Why No AI Banker?
- Deterministic = verifiable = trustless
- AI = black box, API dependencies, costs
- On-chain algorithm is transparent
- Players can verify fairness

### Why Exclude CCIP Cross-Chain?
- Single-chain focus reduces complexity
- CCIP adds bridge risk
- Prize pools easier to manage on one chain
- Can add later if demand exists

---

## Development Environment

### Prerequisites
- Node.js v22 (via nvm)
- Foundry (for smart contracts)
- MetaMask or Rabby wallet
- Base Sepolia ETH (from faucet)
- Alchemy API key (RPC)

### Setup
```bash
# Clone repo
git clone https://github.com/rdobbeck/deal-or-not.git
cd deal-or-not

# Checkout development branch
git checkout prototype-12boxupgrade-uni

# Install dependencies
cd prototype/frontend
npm install

cd ../contracts
forge install

# Run local dev
cd ../frontend
npm run dev
```

### Testing Locally
```bash
# Terminal 1: Anvil (local blockchain)
cd prototype/contracts
anvil

# Terminal 2: Deploy contract
forge script script/Deploy.s.sol --broadcast --rpc-url http://localhost:8545

# Terminal 3: Frontend
cd prototype/frontend
npm run dev

# Browser: http://localhost:3000
```

---

## Metrics & Success Criteria

### Phase 3 Success (Confidential Compute)
- [ ] Values cannot be predicted before reveal
- [ ] TEE attestation verifies secure execution
- [ ] Gas costs acceptable (< $0.10 per game on Base)
- [ ] 100+ test games with no failures

### Phase 4 Success (Multi-Player)
- [ ] 4-player games run smoothly
- [ ] Turn-based flow feels natural
- [ ] No race conditions or exploits
- [ ] Average game time < 10 minutes

### Phase 5 Success (Frontend Polish)
- [ ] Animations smooth on mobile
- [ ] Sound enhances experience (not annoying)
- [ ] Game history loads < 1 second
- [ ] 90%+ positive user feedback

### Phase 6 Success (Monetization)
- [ ] Prize pools funded properly
- [ ] House edge collected accurately
- [ ] No exploits found in beta
- [ ] Break-even on Chainlink costs

### Launch Success
- [ ] 1,000+ games played in first month
- [ ] 100+ daily active players
- [ ] < 0.1% error rate
- [ ] Featured on Base ecosystem page
- [ ] Positive community sentiment

---

## Open Questions

### Technical
1. **Confidential Compute Timeline**: When will Chainlink Confidential Compute be production-ready?
2. **TEE Hardware Requirements**: What infrastructure does DON need for TEE?
3. **Gas Optimization**: Can we reduce contract deployment size?
4. **Scaling**: What's the max concurrent games before performance degrades?

### Product
1. **Entry Fee Range**: What's the sweet spot? (0.001 - 0.1 ETH?)
2. **House Edge**: 5% or 10%? User testing needed.
3. **Game Duration**: Should we add a time limit per round?
4. **Banker Personality**: Serious banker vs. comedic character?

### Business
1. **Legal**: Do we need a gambling license?
2. **Geo-Restrictions**: Block certain countries?
3. **Revenue Split**: What % to protocol treasury vs. Chainlink fees?
4. **Partnerships**: Integrate with Base ecosystem projects?

### Community
1. **Governance**: DAO for protocol upgrades?
2. **Token**: Launch a game token? (Probably not needed)
3. **Tournaments**: Seasonal leaderboards with prizes?
4. **Social**: Spectator betting? (Separate from main game)

---

## Resources

### Documentation
- [Chainlink VRF v2.5](https://docs.chain.link/vrf/v2-5/overview)
- [Chainlink Price Feeds](https://docs.chain.link/data-feeds)
- [Chainlink Functions (CRE)](https://docs.chain.link/chainlink-functions)
- [Base Developer Docs](https://docs.base.org)

### Repositories
- This Project: https://github.com/rdobbeck/deal-or-not
- Scaffold-ETH 2: https://github.com/scaffold-eth/scaffold-eth-2
- Chainlink Contracts: https://github.com/smartcontractkit/chainlink

### Community
- Base Discord: https://discord.gg/base
- Chainlink Discord: https://discord.gg/chainlink
- Project Discord: TBD

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| Feb 28, 2026 | 0.2.0 | Phase 2 (CRE Auto-Reveal) complete |
| Feb 27, 2026 | 0.1.0 | Phase 1 (Base Game) complete |
| Feb 26, 2026 | 0.0.1 | Initial prototype |

---

## Contact

**Project Lead**: SkillProof
**Email**: skillproof@proton.me
**GitHub**: https://github.com/rdobbeck/deal-or-not

---

**Next Steps**: Implement Phase 3 (Confidential Compute) or Phase 4 (Multi-Player) - discuss priority with team.
