# Deal or No Deal - Project Summary

## Project Overview

**Deal or No Deal** is an onchain blockchain game built on Scaffold-ETH 2 using the Foundry flavor. It implements the classic TV game show with:

- **Fair commit-reveal lottery** for selecting the player
- **ZK proofs** for cryptographic verification of case values
- **Progressive jackpot** that grows with each game
- **Banker algorithm** for dynamic offers based on expected value
- **Briefcase NFTs** representing game participation

### Repository

- **Remote**: https://github.com/rdobbeck/deal-or-not.git
- **Local**: `/Users/uni/deal-or-no-deal`

## Architecture

### Smart Contracts (Foundry)

Located in `packages/foundry/contracts/`:

1. **DealOrNoDealFactory.sol** - Main factory for creating games
   - Creates game instances with CREATE2 for deterministic addresses
   - Manages progressive jackpot pool
   - Emits `GameDeployed` event (not `GameCreated`!)

2. **DealOrNoDeal.sol** - Main game logic
   - Lottery phases: NotStarted → LotteryOpen → LotteryReveal → LotteryComplete → Playing → BankerOffer → GameOver
   - Commit-reveal mechanism using `keccak256(abi.encodePacked(secret, msg.sender))`
   - Banker offers based on expected value calculation
   - Case selection and reveal with ZK proof verification

3. **BriefcaseNFT.sol** - NFT representing lottery entries
4. **BankerAlgorithm.sol** - Offer calculation logic
5. **ZKGameVerifier.sol** - Zero-knowledge proof verification
6. **ChainlinkVRFLottery.sol** - Chainlink VRF integration (alternative randomness)
7. **MockVRFCoordinator.sol** - Mock for testing

### Frontend (Next.js)

Located in `packages/nextjs/`:

- **app/page.tsx** - Homepage with game introduction
- **app/browse/page.tsx** - Browse all games with filters
- **app/stats/page.tsx** - Statistics dashboard with leaderboard
- **app/game/page.tsx** - Game lobby with create game form
- **app/game/[id]/page.tsx** - Individual game view with live gameplay
- **components/game/** - Reusable game UI components:
  - `BriefcaseGrid.tsx` - 26 briefcase display
  - `BankerOffer.tsx` - Deal/No Deal UI
  - `GameStatus.tsx` - State indicator
  - `LotteryEntry.tsx` - Commit-reveal entry form
  - `PrizeBoard.tsx` - Eliminated values
  - `EVDashboard.tsx` - Expected value analytics

### Hooks

- **useScaffoldReadContract** - Read contract data
- **useScaffoldWriteContract** - Write to contracts
- **useScaffoldEventHistory** - Query blockchain events
- **useGameContract** - Custom hook for game-specific reads
- **useEthPrice** - Fetch ETH/USD price from Uniswap
- **useGameNotifications** - Browser notifications for game events

## Critical Bugs Fixed (Feb 2026)

### Bug #001: Event Name Mismatch ✅ FIXED
- **Symptom**: Games not appearing on browse/stats pages
- **Root Cause**: Frontend listening for `GameCreated`, factory emits `GameDeployed`
- **Fix**: Updated event name in `app/browse/page.tsx` and `app/stats/page.tsx`
- **Files Changed**:
  - `packages/nextjs/app/browse/page.tsx` line 19
  - `packages/nextjs/app/stats/page.tsx` line 15

### Bug #002: InvalidReveal Error (0x9ea6d127) ✅ FIXED
- **Symptom**: Players unable to reveal secrets, blocking all gameplay
- **Root Cause**: Hash calculation mismatch between commit and reveal
  - Commit used `cast abi-encode` which pads values to 32 bytes
  - Contract uses `abi.encodePacked` which concatenates raw bytes
  - Manual bash concat kept `0x` prefix: `"000...06f0x70997970..."` (invalid hex)
  - Also: Player addresses must be checksummed to match `msg.sender`

- **Solution**:
  ```bash
  # WRONG (manual concat with sed):
  COMMIT=$(cast keccak "$(echo -n "${SECRET}${PLAYER}" | sed 's/0x//')")

  # CORRECT (using cast concat-hex):
  PLAYER=$(cast wallet address --private-key $PLAYER_PK)  # checksummed
  COMMIT=$(cast keccak "$(cast concat-hex $SECRET $PLAYER)")
  ```

- **Files Changed**:
  - `play-game.sh` - Fixed commit calculation
  - `test/CommitRevealDebug.t.sol` - Debug test showing expected hash
  - `packages/nextjs/app/game/page.tsx` - Added `randomnessMethod: 0` to GameConfig

- **Test Verification**:
  ```bash
  cd /Users/uni/deal-or-no-deal
  ./play-game.sh  # Now completes reveal phase successfully
  ```

## Key Technical Details

### Commit-Reveal Lottery

The game uses a two-phase commit-reveal scheme to prevent front-running:

1. **Commit Phase** (LotteryOpen):
   ```solidity
   bytes32 commitHash = keccak256(abi.encodePacked(secret, msg.sender));
   ```

2. **Reveal Phase** (LotteryReveal):
   ```solidity
   bytes32 expectedHash = keccak256(abi.encodePacked(secret, msg.sender));
   require(expectedHash == entry.commitHash, "InvalidReveal");
   ```

3. **Winner Selection** (after reveal window):
   - Combine all revealed secrets: `keccak256(abi.encodePacked(secret1, secret2, ...))`
   - Use resulting hash to deterministically select winner

**CRITICAL**: Player address MUST be checksummed (mixed case) because Solidity's `msg.sender` is always checksummed.

### GameConfig Struct

When creating a game, you must provide ALL fields including `randomnessMethod`:

```typescript
const config = {
  entryFee: parseEther("0.1"),
  lotteryDuration: BigInt(300),      // 5 minutes
  revealDuration: BigInt(180),        // 3 minutes
  turnTimeout: BigInt(3600),          // 1 hour
  hostFeeBps: 500,                    // 5%
  protocolFeeBps: 500,                // 5%
  refundBps: 5000,                    // 50%
  minPlayers: 2,
  randomnessMethod: 0,                // 0 = CommitReveal, 1 = Chainlink VRF
};
```

### Testing with Foundry

```bash
# Terminal 1: Start local Anvil chain
cd /Users/uni/deal-or-no-deal
yarn chain

# Terminal 2: Deploy contracts
yarn deploy

# Terminal 3: Run automated game flow test
./play-game.sh

# Terminal 4: Start frontend
yarn start
# Then visit http://localhost:3000
```

### Test Wallets (Anvil Default)

```bash
# Host (deployer)
HOST=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
HOST_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Player 1
PLAYER1=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
PLAYER1_PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

# Player 2
PLAYER2=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
PLAYER2_PK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
```

## Current Status (Feb 20, 2026)

### ✅ Completed
- Smart contracts deployed and tested
- Commit-reveal lottery mechanism working
- Frontend pages rendering correctly
- Bug #001 fixed (event discovery)
- Bug #002 fixed (InvalidReveal)
- All changes committed and pushed to GitHub

### ⚠️ Known Issues
- Bug #003: Briefcase selection fails with error `0x8ef7077e` (not yet investigated)
- Frontend USD pricing may be slow to load (Uniswap pool query)
- ZK proof verification not yet fully tested

### 📋 Next Steps
1. Investigate and fix briefcase selection error (0x8ef7077e)
2. Complete full game flow test (all 10 rounds to completion)
3. Test progressive jackpot win scenario
4. Load test with multiple simultaneous games
5. Frontend UI/UX improvements:
   - Add loading states
   - Better error messages
   - Mobile responsiveness
6. Deploy to testnet (Base Sepolia recommended)
7. Security audit before mainnet

## Development Commands

### Foundry
```bash
# Compile contracts
yarn compile

# Run tests
yarn test

# Deploy locally
yarn deploy

# Deploy to specific network
yarn deploy --network base
```

### Frontend
```bash
# Start dev server
yarn start

# Build for production
yarn next:build

# Lint and format
yarn lint
yarn format
```

### Testing
```bash
# Automated game flow
./play-game.sh

# Manual testing steps
# 1. Visit http://localhost:3000/browse
# 2. Create a game
# 3. Enter lottery with test accounts
# 4. Fast-forward time with: cast rpc evm_increaseTime 301 --rpc-url http://127.0.0.1:8545
# 5. Close lottery and reveal secrets
# 6. Draw winner and play game
```

## Important Files Reference

### Configuration
- `packages/foundry/foundry.toml` - Foundry config
- `packages/nextjs/scaffold.config.ts` - Frontend network config
- `packages/nextjs/next.config.mjs` - Next.js config

### Documentation
- `TEST_PLAN.md` - Comprehensive test plan (4 phases)
- `TEST_RESULTS.md` - Test execution results and bug tracking
- `CHAINLINK_VRF.md` - Chainlink VRF integration guide
- `SECURITY_AUDIT.md` - Security considerations

### Test Scripts
- `play-game.sh` - Automated full game flow test
- `test-game-flow.sh` - Alternative test script

## Git Workflow

```bash
# Commit with comprehensive message
git add -A
git commit -m "Description

Details...

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to GitHub
git push origin main
```

## Troubleshooting

### "InvalidReveal" error during lottery
- **Check**: Player address is checksummed
- **Check**: Commit hash uses `abi.encodePacked` equivalent (cast concat-hex)
- **Check**: Same secret and address used for both commit and reveal

### Games not appearing on browse page
- **Check**: Factory contract address in `scaffold.config.ts`
- **Check**: Event name is `GameDeployed` not `GameCreated`
- **Check**: Contract ABIs are up to date (run `yarn deploy` after contract changes)

### Husky pre-commit hook fails
- **Check**: ESLint errors in changed files
- **Fix**: Remove unused imports, fix type errors
- **Skip** (not recommended): `git commit --no-verify`

## Project Goals

1. **Fair & Transparent**: Onchain randomness prevents manipulation
2. **Engaging UX**: Real-time updates, notifications, smooth gameplay
3. **Scalable**: Support multiple concurrent games
4. **Secure**: ZK proofs, commit-reveal, audited contracts
5. **Progressive**: Jackpot incentivizes high-risk gameplay

## Contact

- **GitHub**: https://github.com/rdobbeck/deal-or-not
- **Deployer**: SkillProof <skillproof@proton.me>

---

**Last Updated**: February 20, 2026
**Status**: Development/Testing Phase
**Network**: Local (Anvil), will deploy to Base Sepolia → Base Mainnet
