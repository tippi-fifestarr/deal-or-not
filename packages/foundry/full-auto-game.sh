#!/bin/bash
# Fully Automated Game - Play to final box

set -e

RPC=http://127.0.0.1:8545
HOST_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
PLAYER1_PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
PLAYER2_PK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
SECRET1=0x000000000000000000000000000000000000000000000000000000000000006f
SECRET2=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

# Derive checksummed addresses
PLAYER1=$(cast wallet address --private-key $PLAYER1_PK)
PLAYER2=$(cast wallet address --private-key $PLAYER2_PK)

FACTORY=0x3c2d8336e9fb2c76cee9c0663f1c450f108ed03c

echo "🎮 Deal or No Deal - Full Auto Game"
echo "===================================="
echo ""

# Create game
echo "📝 Creating game..."
MERKLE_ROOT=0x$(openssl rand -hex 32)
TX=$(cast send $FACTORY "createGame(bytes32,(uint256,uint256,uint256,uint256,uint16,uint16,uint16,uint8,uint8),bytes32)" \
  $MERKLE_ROOT \
  "(100000000000000,300,300,3600,500,500,5000,2,0)" \
  0x$(openssl rand -hex 32) \
  --private-key $HOST_PK \
  --rpc-url $RPC 2>&1)

GAME=$(echo "$TX" | grep -o 'gameId.*0x[a-fA-F0-9]\{40\}' | head -1 | grep -o '0x[a-fA-F0-9]\{40\}')
echo "✅ Game: $GAME"

# Open lottery
cast send $GAME "openLottery()" --private-key $HOST_PK --rpc-url $RPC > /dev/null
echo "✅ Lottery opened"

# Enter lottery
COMMIT1=$(cast keccak "$(cast concat-hex $SECRET1 $PLAYER1)")
COMMIT2=$(cast keccak "$(cast concat-hex $SECRET2 $PLAYER2)")
cast send $GAME "enterLottery(bytes32)" $COMMIT1 --value 100000000000000 --private-key $PLAYER1_PK --rpc-url $RPC > /dev/null
cast send $GAME "enterLottery(bytes32)" $COMMIT2 --value 100000000000000 --private-key $PLAYER2_PK --rpc-url $RPC > /dev/null
echo "✅ Players entered"

# Close and reveal
cast rpc anvil_increaseTime 310 --rpc-url $RPC > /dev/null
cast rpc anvil_mine 1 --rpc-url $RPC > /dev/null
cast send $GAME "closeLotteryEntries()" --private-key $HOST_PK --rpc-url $RPC > /dev/null
cast send $GAME "revealSecret(bytes32)" $SECRET1 --private-key $PLAYER1_PK --rpc-url $RPC > /dev/null
cast send $GAME "revealSecret(bytes32)" $SECRET2 --private-key $PLAYER2_PK --rpc-url $RPC > /dev/null
echo "✅ Secrets revealed"

# Draw winner
cast rpc anvil_increaseTime 310 --rpc-url $RPC > /dev/null
cast rpc anvil_mine 1 --rpc-url $RPC > /dev/null
cast send $GAME "drawWinner()" --private-key $HOST_PK --rpc-url $RPC > /dev/null
echo "✅ Winner drawn"

# Get contestant address
CONTESTANT=$(cast call $GAME "game()(address,address)" --rpc-url $RPC | sed -n '2p' | xargs)
echo "🏆 Contestant: $CONTESTANT"

# Determine winner private key
if [ "$CONTESTANT" = "$PLAYER1" ]; then
  WINNER_PK=$PLAYER1_PK
  echo "   Player 1 won!"
else
  WINNER_PK=$PLAYER2_PK
  echo "   Player 2 won!"
fi

# Select briefcase
SELECTED_CASE=13
cast send $GAME "selectCase(uint256)" $SELECTED_CASE --private-key $WINNER_PK --rpc-url $RPC > /dev/null
echo "✅ Selected case #$SELECTED_CASE"

# Play all rounds (auto NO DEAL, open all cases except selected)
ROUNDS=(6 5 4 3 2 1 1 1 1 1)
CASE_IDX=0

for ROUND_NUM in 0 1 2 3 4 5 6 7 8 9; do
  CASES_THIS_ROUND=${ROUNDS[$ROUND_NUM]}
  echo ""
  echo "🎲 Round $((ROUND_NUM + 1)): Opening $CASES_THIS_ROUND cases"

  OPENED=0
  while [ $OPENED -lt $CASES_THIS_ROUND ] && [ $CASE_IDX -lt 26 ]; do
    if [ $CASE_IDX -ne $SELECTED_CASE ]; then
      VALUE=$(cast call $GAME "briefcases(uint256)(uint256)" $CASE_IDX --rpc-url $RPC | xargs)
      cast send $GAME "openCase(uint256,uint256,uint256[2],uint256[2][2],uint256[2])" \
        $CASE_IDX $VALUE "[0,0]" "[[0,0],[0,0]]" "[0,0]" \
        --private-key $WINNER_PK --rpc-url $RPC > /dev/null 2>&1
      echo "  ✅ Case #$CASE_IDX: $VALUE wei"
      OPENED=$((OPENED + 1))
    fi
    CASE_IDX=$((CASE_IDX + 1))
  done

  # Reject banker offer (except last round)
  if [ $ROUND_NUM -lt 9 ]; then
    cast send $GAME "rejectDeal()" --private-key $WINNER_PK --rpc-url $RPC > /dev/null
    echo "  ❌ NO DEAL!"
  fi
done

echo ""
echo "🎊 GAME COMPLETE - Final Box Ready!"
echo "==================================="
echo ""
echo "Game: $GAME"
echo "Winner: $CONTESTANT"
echo "Final Case: #$SELECTED_CASE (UNOPENED)"
echo ""
echo "View at: http://localhost:3000/game/$GAME"
