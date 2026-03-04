# Market Maker Infrastructure — TODO

**Status**: PredictionMarket.sol is implemented but lacks market maker infrastructure for liquidity provisioning.

---

## Current State

✅ **Implemented:**
- `PredictionMarket.sol` — Core prediction market contract
  - Create markets for agent game outcomes
  - Binary outcome markets (win/lose)
  - Users can bet on agent performance
  - Automated resolution via CRE workflow

❌ **Missing:**
- Market maker infrastructure for liquidity provisioning
- Automated liquidity pools
- Dynamic pricing based on supply/demand
- LP token system for liquidity providers
- Fee distribution mechanism

---

## Why Market Maker Infrastructure is Needed

### Problem
Without a market maker, prediction markets suffer from:
1. **Low Liquidity**: Users can't enter/exit positions easily
2. **Wide Spreads**: Inefficient pricing between buyers and sellers
3. **Poor UX**: Manual order matching is slow and clunky
4. **No Incentives**: No reason for users to provide liquidity

### Solution
Implement automated market maker (AMM) infrastructure similar to Uniswap V2 constant product formula or Balancer weighted pools.

---

## Proposed Architecture

### 1. Market Maker Contract (`AgentMarketMaker.sol`)

**Core Functions:**
```solidity
// Liquidity provision
function addLiquidity(uint256 marketId, uint256 amount) external returns (uint256 lpTokens);
function removeLiquidity(uint256 marketId, uint256 lpTokens) external returns (uint256 amount);

// Trading
function buyOutcome(uint256 marketId, uint8 outcome, uint256 maxPrice) external returns (uint256 shares);
function sellOutcome(uint256 marketId, uint8 outcome, uint256 minPrice) external returns (uint256 eth);

// Pricing (CPMM: Constant Product Market Maker)
function getPrice(uint256 marketId, uint8 outcome) external view returns (uint256 price);
```

**Key Features:**
- Constant Product Market Maker (x * y = k)
- Dynamic pricing based on pool reserves
- LP tokens for liquidity providers
- Fee mechanism (e.g., 2% trading fee to LPs)
- Slippage protection

### 2. LP Token System

**Approach 1: Separate ERC-20 per market**
```solidity
contract MarketLPToken is ERC20 {
    uint256 public immutable marketId;
    // Each market has its own LP token
}
```

**Approach 2: ERC-1155 multi-token**
```solidity
contract MarketLPTokens is ERC1155 {
    // Token ID = market ID
    // More gas efficient for multiple markets
}
```

### 3. Pricing Formula

**Constant Product (Uniswap V2-style):**
```
x * y = k

where:
- x = shares of outcome 0 (agent loses)
- y = shares of outcome 1 (agent wins)
- k = constant product

Price of outcome 1 = y / (x + y)
```

**Example:**
- Pool has 1000 ETH in "lose" and 1000 ETH in "win"
- Price of "win" = 1000 / (1000 + 1000) = 0.5 (50%)
- User buys 100 ETH worth of "win" shares
- New pool: 900 "lose", 1111 "win" (k = 1,000,000)
- New price: 1111 / (900 + 1111) = 0.552 (55.2%)

### 4. Fee Distribution

**Fee Structure:**
- **Trading Fee**: 2% on all trades
- **Protocol Fee**: 0.5% to treasury
- **LP Fee**: 1.5% to liquidity providers

**Distribution:**
```solidity
function distributeFees(uint256 marketId) internal {
    uint256 totalFees = accumulatedFees[marketId];
    uint256 protocolFee = (totalFees * 500) / 10000;  // 0.5%
    uint256 lpFee = totalFees - protocolFee;          // 1.5%

    treasury.transfer(protocolFee);
    lpRewards[marketId] += lpFee;
}
```

---

## Implementation Priority

### Phase 1: Core AMM (High Priority)
- [ ] `AgentMarketMaker.sol` contract
- [ ] Constant product pricing formula
- [ ] Basic liquidity provision (add/remove)
- [ ] Trading functions (buy/sell outcomes)
- [ ] LP token system (ERC-1155 for efficiency)

### Phase 2: Advanced Features (Medium Priority)
- [ ] Fee distribution mechanism
- [ ] Slippage protection
- [ ] Time-weighted average price (TWAP) oracle
- [ ] Emergency pause/unpause
- [ ] Market seeding (initial liquidity from protocol)

### Phase 3: Optimization (Low Priority)
- [ ] Gas optimizations
- [ ] Multi-market liquidity routing
- [ ] Liquidity mining incentives
- [ ] Volume-based fee tiers
- [ ] Impermanent loss protection

---

## Integration with Existing Contracts

### PredictionMarket.sol Changes

**Current:**
```solidity
contract PredictionMarket {
    // Manual betting - users directly deposit funds
    function placeBet(uint256 marketId, uint8 outcome, uint256 amount) external;
}
```

**Proposed:**
```solidity
contract PredictionMarket {
    AgentMarketMaker public immutable marketMaker;

    // Route trades through AMM
    function placeBet(uint256 marketId, uint8 outcome, uint256 amount, uint256 maxSlippage) external {
        marketMaker.buyOutcome(marketId, outcome, maxSlippage);
    }
}
```

### CRE Workflow Integration

**agent-gameplay-orchestrator** should:
1. Trigger market resolution when game completes
2. Distribute winnings to LP holders
3. Update market stats in AgentRegistry

```typescript
// In onGameComplete handler:
const marketId = getMarketForGame(gameId);
if (marketId > 0) {
  const resolveCallData = encodeFunctionData({
    abi: marketMakerAbi,
    functionName: "resolveMarket",
    args: [marketId, won ? 1 : 0],
  });

  // Execute via CRE report
  evmClient.writeReport(runtime, {
    receiver: MARKET_MAKER_ADDRESS,
    report: reportResponse,
  });
}
```

---

## Frontend UI Requirements

### Market Maker Interface

**New Pages:**
1. `/markets` — Browse all active prediction markets
2. `/markets/[marketId]` — Market details with trading interface
3. `/markets/liquidity` — LP dashboard (positions, earnings, APR)

**Components:**
- `TradingChart` — Price history and depth chart
- `OrderForm` — Buy/sell outcome shares with slippage settings
- `LiquidityForm` — Add/remove liquidity
- `PositionTracker` — Show user's LP positions and PnL

**Example Trading Interface:**
```tsx
<GlassCard>
  <h3>Bet on Agent Performance</h3>
  <div>
    <label>Outcome</label>
    <select>
      <option>Agent Wins (≥$0.50)</option>
      <option>Agent Loses (<$0.50)</option>
    </select>
  </div>
  <div>
    <label>Amount (ETH)</label>
    <input type="number" placeholder="0.1" />
  </div>
  <div>
    <label>Current Price</label>
    <span>0.65 ETH (65% implied probability)</span>
  </div>
  <div>
    <label>Estimated Shares</label>
    <span>0.153 shares</span>
  </div>
  <GlassButton>Place Bet</GlassButton>
</GlassCard>
```

---

## Economic Design Considerations

### Liquidity Bootstrapping

**Problem:** New markets have no liquidity initially.

**Solutions:**
1. **Protocol Seeding**: Deploy 0.1 ETH into each new market automatically
2. **Liquidity Mining**: Reward early LPs with bonus tokens/points
3. **Agent-Funded Pools**: Agents can seed their own markets to attract bettors

### Impermanent Loss Mitigation

**Problem:** LPs lose money if price moves significantly from 50/50.

**Solutions:**
1. **Dynamic Fees**: Increase fees during high volatility
2. **IL Protection**: Protocol subsidizes LP losses above 5%
3. **Concentrated Liquidity**: Allow LPs to provide liquidity in specific price ranges

### Market Manipulation Prevention

**Risks:**
- Wash trading to manipulate odds
- Front-running game results
- Agents betting on themselves

**Mitigations:**
1. **Min Bet Size**: Prevent dust spam
2. **Max Position Size**: Cap bets to 10% of pool
3. **Time Locks**: Lock trades until game completion
4. **CRE Monitoring**: Detect suspicious betting patterns

---

## Deployment Strategy

### Phase 1: Testnet (Base Sepolia)
1. Deploy `AgentMarketMaker.sol`
2. Create test markets for 5 top agents
3. Seed with protocol liquidity (0.1 ETH per market)
4. Test trading, liquidity provision, resolution
5. Monitor for bugs and exploits

### Phase 2: Mainnet (Base)
1. Audit contract code (Certora, OpenZeppelin)
2. Deploy with 1-week timelock for upgrades
3. Launch with liquidity mining incentives
4. Gradually increase market caps based on demand
5. Expand to multi-agent tournaments

---

## Gas Cost Estimates

**Optimistic (with optimizations):**
- Create market: ~100k gas (~$0.01 on Base)
- Add liquidity: ~80k gas (~$0.008)
- Trade: ~120k gas (~$0.012)
- Remove liquidity: ~90k gas (~$0.009)
- Resolve market: ~150k gas (~$0.015)

**Pessimistic (without optimizations):**
- Create market: ~200k gas (~$0.02)
- Add liquidity: ~150k gas (~$0.015)
- Trade: ~200k gas (~$0.02)
- Remove liquidity: ~150k gas (~$0.015)
- Resolve market: ~250k gas (~$0.025)

---

## Alternative Approaches

### Option 1: Use Existing Protocol (e.g., Polymarket SDK)
**Pros:**
- Faster implementation
- Battle-tested code
- Existing liquidity

**Cons:**
- Less control over economics
- Integration complexity
- May not support agent-specific features

### Option 2: Order Book (Central Limit Order Book)
**Pros:**
- Better price discovery
- No impermanent loss for LPs
- Pro traders prefer it

**Cons:**
- More complex implementation
- Worse UX for casual users
- Requires active market makers

### Option 3: Prediction Market Aggregator
**Pros:**
- Route to best liquidity across protocols
- Lower slippage
- More markets

**Cons:**
- Depends on external protocols
- Higher gas costs
- Complexity

---

## Open Questions

1. **Market Resolution**: Who resolves markets if CRE workflow fails? Fallback to manual resolution?
2. **Market Creation**: Should anyone be able to create markets or only protocol/agents?
3. **Fee Structure**: Should fees be dynamic based on market volatility?
4. **Cross-Chain**: Support betting from other chains via CCIP?
5. **Oracle**: Use Chainlink Price Feeds for market pricing or rely on internal reserves?

---

## References

- **Uniswap V2 Whitepaper**: https://uniswap.org/whitepaper.pdf
- **Polymarket Docs**: https://docs.polymarket.com/
- **Balancer V2**: https://docs.balancer.fi/
- **Gnosis Conditional Tokens**: https://docs.gnosis.io/conditionaltokens/

---

## Timeline Estimate

**With 1 developer:**
- Phase 1 (Core AMM): 2-3 weeks
- Phase 2 (Advanced Features): 1-2 weeks
- Phase 3 (Optimization): 1 week
- Testing & Audit: 2-4 weeks

**Total**: 6-10 weeks

**With 2 developers:**
- Phase 1: 1-2 weeks
- Phase 2: 1 week
- Phase 3: 1 week
- Testing & Audit: 2-4 weeks

**Total**: 5-8 weeks

---

**Note**: This infrastructure is **not required** for initial hackathon submission but should be prioritized for production launch to make prediction markets actually usable.

**Priority**: Medium — Can launch with basic manual betting first, then upgrade to AMM in v2.

---

**Created**: 2026-03-03
**Last Updated**: 2026-03-03
**Status**: Planning / Not Started
