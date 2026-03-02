# Testing DealOrNotConfidential

## Setup

### Install Dependencies

```bash
cd prototype/contracts

# Install Chainlink contracts
forge install smartcontractkit/chainlink-brownie-contracts@1.2.0 --no-commit

# Install OpenZeppelin (if needed)
forge install OpenZeppelin/openzeppelin-contracts@v5.0.0 --no-commit

# Install Forge Standard Library
forge install foundry-rs/forge-std --no-commit
```

### Verify Installation

```bash
ls lib/
# Should see: chainlink-brownie-contracts  forge-std  openzeppelin-contracts
```

## Run Tests

### All Tests

```bash
forge test
```

### Specific Test File

```bash
forge test --match-path test/DealOrNotConfidential.t.sol
```

### Verbose Output

```bash
forge test -vv  # Shows test names and results
forge test -vvv # Shows stack traces for failures
forge test -vvvv # Shows all traces
```

### Specific Test Function

```bash
forge test --match-test test_CreateGame -vvv
```

## Test Coverage

```bash
forge coverage
```

## Gas Report

```bash
forge test --gas-report
```

## Test Structure

**File:** `test/DealOrNotConfidential.t.sol`

**Test Categories:**
1. **Game Creation** - VRF integration, subscription setup
2. **Case Picking** - Player case selection
3. **Commit-Reveal** - Hash commitment and reveal validation
4. **Functions Integration** - Callback handling, value assignment
5. **Banker Offers** - Offer calculation, acceptance/rejection
6. **Full Game Flow** - End-to-end integration test

**Mocks Used:**
- `VRFCoordinatorV2_5Mock` - Simulates VRF fulfillment
- `MockV3Aggregator` - Simulates ETH/USD price feed
- `functionsRouter` address - Simulates Functions callback

## Expected Test Results

All tests should pass:

```
[PASS] test_CalculateBankerOffer()
[PASS] test_CommitCase()
[PASS] test_ConvertCentsToWei()
[PASS] test_CreateGame()
[PASS] test_FullGameFlow()
[PASS] test_FulfillRequest_AssignsCaseValue()
[PASS] test_FulfillRequest_EmitsCaseCollapsed()
[PASS] test_PickCase()
[PASS] test_PickCase_RevertIfInvalidCase()
[PASS] test_PickCase_RevertIfNotCreated()
[PASS] test_RevealCase_RevertIfPlayerCase()
[PASS] test_RevealCase_RevertIfTooEarly()
[PASS] test_RevealCase_RevertIfWrongSalt()
[PASS] test_RevealCase_SendsFunctionsRequest()
[PASS] test_SetBankerOffer()
[PASS] test_VRFFulfillment()
[PASS] test_AcceptDeal()
[PASS] test_RejectDeal()

Test result: ok. 18 passed; 0 failed; finished in 12.34s
```

## Key Test Scenarios

### 1. VRF Fulfillment
Tests that VRF coordinator properly fulfills random seed and advances game phase.

### 2. Commit-Reveal Security
Tests that:
- Cannot reveal before 1 block wait
- Cannot reveal with wrong salt
- Cannot open player's own case
- Cannot open same case twice

### 3. Functions Integration
Tests that:
- Functions request is sent on reveal
- Callback properly assigns case value
- Values are marked as used
- Game phase advances correctly

### 4. Full Game Flow
Integration test covering:
1. Create game → VRF fulfills
2. Pick case
3. Commit case to open
4. Reveal → Functions request
5. Functions callback assigns value
6. Banker makes offer
7. Player accepts → Game over

## Troubleshooting

### "Error: Failed to resolve imports"

**Solution:** Install missing dependencies

```bash
forge install
```

### "Error: Could not find artifact"

**Solution:** Clean and rebuild

```bash
forge clean
forge build
```

### "Error: Stack too deep"

**Solution:** Already configured in `foundry.toml`:

```toml
via_ir = true
```

This enables the Intermediate Representation compiler which fixes stack depth issues.

### Tests Timeout

If Chainlink Functions mock causes timeouts, simplify the test:

```solidity
// Instead of full Functions flow, directly call fulfillRequest
vm.prank(functionsRouter);
game.fulfillRequest(requestId, abi.encode(caseValue), "");
```

## Pre-Deployment Checklist

Before deploying to testnet, ensure:

- [ ] All tests pass (`forge test`)
- [ ] No compilation warnings (`forge build`)
- [ ] Gas usage is reasonable (`forge test --gas-report`)
- [ ] Contract size < 24KB (`forge build --sizes`)
- [ ] Test coverage > 80% (`forge coverage`)

## Next Steps After Tests Pass

1. Deploy to Base Sepolia using deployment script
2. Verify contract on Basescan
3. Add to VRF subscription
4. Add to Functions subscription
5. Upload Functions source code
6. Upload encrypted secrets
7. Test full flow on testnet
