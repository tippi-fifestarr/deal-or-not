#!/bin/bash
# Test Game Flow Script for Deal or No Deal
# This script tests the complete game flow from creation to completion

set -e  # Exit on error

echo "======================================"
echo "Deal or No Deal - Full Game Flow Test"
echo "======================================"
echo ""

# Get contract addresses from deployments
FACTORY="0x3c2d8336e9fb2c76cee9c0663f1c450f108ed03c"

echo "📝 Factory Address: $FACTORY"
echo ""

# Wallet addresses from Anvil
HOST="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
PLAYER1="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
PLAYER2="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"

HOST_PK="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
PLAYER1_PK="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
PLAYER2_PK="0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"

# Secrets for commit-reveal
SECRET1="0x1111111111111111111111111111111111111111111111111111111111111111"
SECRET2="0x2222222222222222222222222222222222222222222222222222222222222222"

echo "Phase 1: Create Game"
echo "--------------------"

# Generate Merkle root (mock for now)
MERKLE_ROOT="0x$(openssl rand -hex 32)"

echo "  Creating game with:"
echo "  - Entry fee: 0.1 ETH"
echo "  - Lottery duration: 300s (5 min)"
echo "  - Reveal duration: 180s (3 min)"
echo "  - Min players: 2"
echo "  - Merkle root: $MERKLE_ROOT"
echo ""

# Create game via factory (using cast send and capturing event)
RESULT=$(cast send $FACTORY "createGame(bytes32,uint256,uint256,uint256,uint8,uint256,uint16,uint16,uint16,address,uint8)" \
  $MERKLE_ROOT \
  100000000000000000 \
  300 \
  180 \
  2 \
  600 \
  8000 \
  200 \
  200 \
  "0x0000000000000000000000000000000000000000" \
  0 \
  --rpc-url http://127.0.0.1:8545 \
  --private-key $HOST_PK 2>&1)

# Extract game address from logs
GAME=$(echo "$RESULT" | grep -o 'gameId.*0x[a-fA-F0-9]\{40\}' | head -1 | grep -o '0x[a-fA-F0-9]\{40\}')

if [ -z "$GAME" ]; then
  echo "❌ Failed to extract game address from transaction"
  echo "$RESULT"
  exit 1
fi

echo "✅ Game created!"
echo "  Game address: $GAME"
echo ""

# Wait a moment for the transaction to be mined
sleep 2

echo "Phase 2: Open Lottery"
echo "--------------------"

cast send $GAME "openLottery()" --private-key $HOST_PK --rpc-url http://127.0.0.1:8545 > /dev/null
echo "✅ Lottery opened"
echo ""

echo "Phase 3: Players Enter Lottery"
echo "-------------------------------"

# Player 1 commits
COMMIT1=$(cast keccak "$(echo -n "${SECRET1}${PLAYER1}" | sed 's/0x//g')")
echo "  Player 1 committing: $COMMIT1"
cast send $GAME "enterLottery(bytes32)" $COMMIT1 --value 100000000000000000 --private-key $PLAYER1_PK --rpc-url http://127.0.0.1:8545 > /dev/null
echo "✅ Player 1 entered"

# Player 2 commits
COMMIT2=$(cast keccak "$(echo -n "${SECRET2}${PLAYER2}" | sed 's/0x//g')")
echo "  Player 2 committing: $COMMIT2"
cast send $GAME "enterLottery(bytes32)" $COMMIT2 --value 100000000000000000 --private-key $PLAYER2_PK --rpc-url http://127.0.0.1:8545 > /dev/null
echo "✅ Player 2 entered"
echo ""

echo "Phase 4: Fast-forward Time"
echo "--------------------------"
echo "  Advancing 301 seconds..."
cast rpc evm_increaseTime 301 --rpc-url http://127.0.0.1:8545 > /dev/null
cast rpc evm_mine --rpc-url http://127.0.0.1:8545 > /dev/null
echo "✅ Time advanced"
echo ""

echo "Phase 5: Close Lottery"
echo "---------------------"
cast send $GAME "closeLotteryEntries()" --private-key $HOST_PK --rpc-url http://127.0.0.1:8545 > /dev/null
echo "✅ Lottery closed"
echo ""

echo "Phase 6: Players Reveal Secrets"
echo "--------------------------------"
echo "  Player 1 revealing secret..."
cast send $GAME "revealSecret(bytes32)" $SECRET1 --private-key $PLAYER1_PK --rpc-url http://127.0.0.1:8545 > /dev/null
echo "✅ Player 1 revealed"

echo "  Player 2 revealing secret..."
cast send $GAME "revealSecret(bytes32)" $SECRET2 --private-key $PLAYER2_PK --rpc-url http://127.0.0.1:8545 > /dev/null
echo "✅ Player 2 revealed"
echo ""

echo "Phase 7: Fast-forward Reveal Window"
echo "------------------------------------"
echo "  Advancing 181 seconds..."
cast rpc evm_increaseTime 181 --rpc-url http://127.0.0.1:8545 > /dev/null
cast rpc evm_mine --rpc-url http://127.0.0.1:8545 > /dev/null
echo "✅ Time advanced"
echo ""

echo "Phase 8: Draw Winner"
echo "--------------------"
cast send $GAME "drawWinner()" --private-key $HOST_PK --rpc-url http://127.0.0.1:8545 > /dev/null
echo "✅ Winner drawn"
echo ""

# Get game state
STATE=$(cast call $GAME "state()(uint8)" --rpc-url http://127.0.0.1:8545)
echo "  Current game state: $STATE"
echo ""

echo "======================================"
echo "✅ GAME FLOW TEST COMPLETED"
echo "======================================"
echo ""
echo "Next steps for manual testing:"
echo "1. Open http://localhost:3000/browse to see the game"
echo "2. Click on the game to view details"
echo "3. The winner should be able to select a briefcase"
echo "4. Test the full gameplay (opening cases, banker offers, etc.)"
echo ""
