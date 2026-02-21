# Chainlink VRF Integration

This document explains how to use Chainlink VRF for provably fair lottery randomness in Deal or No Deal.

## Overview

The game now supports **three randomness methods**:

1. **CommitReveal** (default) - Players commit hashes then reveal secrets
2. **ChainlinkVRF** (production) - Chainlink's verifiable random function
3. **BlockRandomness** (testing) - Simple blockhash-based randomness

## Architecture

### Contracts

- `ChainlinkVRFLottery.sol` - Mixin contract adding VRF functionality
- `MockVRFCoordinator.sol` - Local testing coordinator (instant fulfillment)
- `GameTypes.sol` - Includes `RandomnessMethod` enum

### How It Works

#### With Chainlink VRF:

1. **Players Enter Lottery** - Single transaction, no secret needed
2. **Host Closes Lottery** - Automatically requests VRF randomness
3. **VRF Callback** - Chainlink calls `fulfillRandomWords()` with random number
4. **Winner Selected** - Game automatically selects winner and distributes prizes
5. **Game Starts** - No reveal phase needed!

#### Flow Comparison:

**Commit-Reveal (Current):**
```
Enter → Wait → Close → Reveal → Wait → Draw Winner
  1tx    5min    1tx     1tx     5min      1tx
```

**Chainlink VRF:**
```
Enter → Wait → Close (requests VRF) → Winner Auto-Selected
  1tx    5min    1tx + VRF fee           (2-3 blocks)
```

## Configuration

### Creating a VRF Game

```solidity
GameConfig memory config = GameConfig({
    entryFee: 0.1 ether,
    lotteryDuration: 300,
    revealDuration: 0,  // Not needed for VRF
    turnTimeout: 3600,
    hostFeeBps: 500,
    protocolFeeBps: 500,
    refundBps: 5000,
    minPlayers: 2,
    randomnessMethod: RandomnessMethod.ChainlinkVRF  // 👈 Set this
});

factory.createGame(merkleRoot, config, salt);
```

### VRF Coordinator Addresses

**Mainnets:**
- Ethereum: `0x271682DEB8C4E0901D1a1550aD2e64D568E69909`
- Polygon: `0xAE975071Be8F8eE67addBC1A82488F1C24858067`
- Arbitrum: `0x50d47e4142598E3411aA864e08a44284e471AC6f`
- Optimism: `0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634`
- Base: `0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634`

**Testnets:**
- Sepolia: `0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625`
- Mumbai: `0x7a1BaC17Ccc5b313516C5E16fb24f7659aA5ebed`

### Key Hashes

Each network has specific key hashes for different gas lanes:

**Ethereum Mainnet:**
- 200 gwei: `0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef`
- 500 gwei: `0xff8dedfbfa60af186cf3c830acbc32c05aae823045ae5ea7da1e45fbfaba4f92`

**Sepolia:**
- 150 gwei: `0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c`

### Subscription Setup

1. Go to [vrf.chain.link](https://vrf.chain.link)
2. Create a subscription
3. Fund it with LINK tokens
4. Add your game factory as a consumer

```solidity
VRFConfig memory vrfConfig = VRFConfig({
    subscriptionId: YOUR_SUB_ID,  // From vrf.chain.link
    keyHash: KEY_HASH,            // See above
    callbackGasLimit: 500000,     // Gas for callback
    requestConfirmations: 3       // Block confirmations
});
```

## Cost Comparison

### Commit-Reveal
- **Gas Cost**: ~150k gas total (enter + reveal + draw)
- **User Friction**: High (2 txs per player + waiting)
- **LINK Cost**: $0
- **Time**: ~10+ minutes

### Chainlink VRF
- **Gas Cost**: ~100k gas (enter + auto-draw)
- **User Friction**: Low (1 tx per player)
- **LINK Cost**: ~$2-5 per game (one-time)
- **Time**: ~5 minutes + 2 blocks

**For a 10-player game with 0.1 ETH entry ($200 pot):**
- VRF cost = $3 (1.5% of pot)
- Better UX + security worth it! ✅

## Local Testing

The `MockVRFCoordinator` provides instant fulfillment for testing:

```bash
# Deploy with mock VRF
forge script script/Deploy.s.sol --broadcast

# Mock auto-fulfills in same transaction
# No need to wait or manually trigger callback
```

## Production Deployment

1. **Get LINK tokens** on your target network
2. **Create VRF subscription** at vrf.chain.link
3. **Fund subscription** with LINK
4. **Deploy contracts** with real VRF coordinator address
5. **Add factory as consumer** to your subscription
6. **Create games** with `RandomnessMethod.ChainlinkVRF`

## Security Considerations

### Why VRF is More Secure

1. **No player influence** - Randomness comes from oracle
2. **No griefing** - Players can't refuse to reveal
3. **Verifiable** - Cryptographic proof of randomness
4. **Battle-tested** - Used by major protocols

### Potential Issues

1. **VRF fulfillment failure** - Rare but handle with timeouts
2. **Subscription out of LINK** - Monitor balance
3. **Network congestion** - May delay callback

## Upgrading Existing Games

To add VRF to the current implementation, you would:

1. Make `DealOrNoDeal` inherit from `ChainlinkVRFLottery`
2. Modify `closeLotteryEntries()` to check randomness method
3. If VRF: call `_requestRandomness()` instead of going to reveal state
4. Implement `_onRandomnessFulfilled()` to select winner

This allows **backward compatibility** - old commit-reveal games still work!

## Resources

- [Chainlink VRF Docs](https://docs.chain.link/vrf/v2/introduction)
- [VRF Subscription Manager](https://vrf.chain.link)
- [LINK Token Faucets](https://faucets.chain.link)

## Next Steps

- [ ] Integrate VRF mixin into DealOrNoDeal contract
- [ ] Update factory to support VRF config
- [ ] Add VRF UI components to frontend
- [ ] Deploy to testnet with real VRF
- [ ] Monitor costs and optimize gas
