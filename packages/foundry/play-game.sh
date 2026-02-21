#!/bin/bash
set -e

echo "🎮 Deal or No Deal - Complete Game Flow"
echo "========================================"

# Configuration
FACTORY=0x3c2d8336e9fb2c76cee9c0663f1c450f108ed03c
RPC=http://127.0.0.1:8545

# Host (Anvil Account #0)
HOST_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Players (derive checksummed addresses from private keys to match msg.sender)
PLAYER1_PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
PLAYER1=$(cast wallet address --private-key $PLAYER1_PK)
SECRET1=0x000000000000000000000000000000000000000000000000000000000000006f

PLAYER2_PK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
PLAYER2=$(cast wallet address --private-key $PLAYER2_PK)
SECRET2=0x00000000000000000000000000000000000000000000000000000000000000de

echo ""
echo "📝 Step 1: Create Game"
MERKLE_ROOT=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
SALT=0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc

# Get current total games before creating
GAME_ID=$(cast call $FACTORY "totalGames()" --rpc-url $RPC)

cast send $FACTORY "createGame(bytes32,(uint256,uint256,uint256,uint256,uint16,uint16,uint16,uint8,uint8),bytes32)" \
  $MERKLE_ROOT \
  "(100000000000000,300,300,3600,500,500,5000,2,0)" \
  $SALT \
  --private-key $HOST_PK \
  --rpc-url $RPC > /dev/null

# Get game address using getDeployment
GAME=$(cast call $FACTORY "getDeployment(uint256)" $GAME_ID --rpc-url $RPC | head -1 | cut -c27-66)
echo "✅ Game created at: 0x$GAME"
GAME="0x$GAME"

echo ""
echo "🎰 Step 2: Open Lottery"
cast send $GAME "openLottery()" --private-key $HOST_PK --rpc-url $RPC > /dev/null
echo "✅ Lottery opened"

echo ""
echo "🎫 Step 3: Players Enter Lottery"
# NOTE: Must use concat-hex (abi.encodePacked) not abi-encode to match contract's keccak256(abi.encodePacked(secret, player))
COMMIT1=$(cast keccak "$(cast concat-hex $SECRET1 $PLAYER1)")
cast send $GAME "enterLottery(bytes32)" $COMMIT1 --value 100000000000000 --private-key $PLAYER1_PK --rpc-url $RPC > /dev/null
echo "✅ Player 1 entered (commit: $COMMIT1)"

COMMIT2=$(cast keccak "$(cast concat-hex $SECRET2 $PLAYER2)")
cast send $GAME "enterLottery(bytes32)" $COMMIT2 --value 100000000000000 --private-key $PLAYER2_PK --rpc-url $RPC > /dev/null
echo "✅ Player 2 entered (commit: $COMMIT2)"

echo ""
echo "⏰ Step 4: Advance Time & Close Lottery"
cast rpc anvil_increaseTime 310 --rpc-url $RPC > /dev/null
cast rpc anvil_mine 1 --rpc-url $RPC > /dev/null
cast send $GAME "closeLotteryEntries()" --private-key $HOST_PK --rpc-url $RPC > /dev/null
echo "✅ Lottery entries closed (reveal window now open)"

echo ""
echo "🔓 Step 5: Reveal Secrets (during reveal window)"
cast send $GAME "revealSecret(bytes32)" $SECRET1 --private-key $PLAYER1_PK --rpc-url $RPC > /dev/null
echo "✅ Player 1 revealed"

cast send $GAME "revealSecret(bytes32)" $SECRET2 --private-key $PLAYER2_PK --rpc-url $RPC > /dev/null
echo "✅ Player 2 revealed"

echo ""
echo "⏰ Step 6: Advance Time & Draw Winner"
cast rpc anvil_increaseTime 310 --rpc-url $RPC > /dev/null
cast rpc anvil_mine 1 --rpc-url $RPC > /dev/null
cast send $GAME "drawWinner()" --private-key $HOST_PK --rpc-url $RPC > /dev/null
echo "✅ Winner drawn!"

echo ""
echo "🏆 Step 7: Check Winner"
WINNER_LOG=$(cast logs --address $GAME 0x2466dc7af8178fc23ab9159be36c83bd00abb0499270a2ee0b0df372c500dd31 --rpc-url $RPC | grep -A 1 "data:" | tail -1 | cut -c9-74)
WINNER_IDX=$((16#${WINNER_LOG:0:64}))
if [ $WINNER_IDX -eq 0 ]; then
  WINNER=$PLAYER1
  WINNER_PK=$PLAYER1_PK
  echo "🎉 Player 1 won!"
else
  WINNER=$PLAYER2
  WINNER_PK=$PLAYER2_PK
  echo "🎉 Player 2 won!"
fi

echo ""
echo "💼 Step 8: Winner Selects Briefcase"
SELECTED_CASE=13
cast send $GAME "selectCase(uint256)" $SELECTED_CASE --private-key $WINNER_PK --rpc-url $RPC > /dev/null
echo "✅ Selected briefcase #$SELECTED_CASE"

echo ""
echo "🎮 Step 9: Complete Round 1 (open 6 cases)"
echo "Opening cases: 0, 1, 2, 3, 4, 5"
for i in 0 1 2 3 4 5; do
  if [ $i -ne $SELECTED_CASE ]; then
    # Get the case value (from the shuffled distribution)
    VALUE=$(cast call $GAME "getBriefcase(uint256)" $i --rpc-url $RPC | head -1 | cut -c1-66)

    # Open with zero proof (MockGroth16Verifier accepts anything)
    cast send $GAME "openCase(uint256,uint256,uint256[2],uint256[2][2],uint256[2])" \
      $i \
      $VALUE \
      "[0,0]" \
      "[[0,0],[0,0]]" \
      "[0,0]" \
      --private-key $HOST_PK \
      --rpc-url $RPC > /dev/null
    echo "  ✅ Opened case #$i"
  fi
done

echo ""
echo "🎊 Round 1 Complete!"
echo "===================="
echo "Game Address: $GAME"
echo "Winner: $WINNER"
echo "Selected Case: #$SELECTED_CASE"
echo ""
echo "View in UI: http://localhost:3003/game/$GAME"
