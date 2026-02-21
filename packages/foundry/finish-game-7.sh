#!/bin/bash
# Complete Game 7 to final box

GAME=0x28b59787DC51A64AB16931bcD3179C90D17de620
RPC=http://127.0.0.1:8545
HOST_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
PLAYER1_PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
PLAYER2_PK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
SECRET1=0x000000000000000000000000000000000000000000000000000000000000006f
SECRET2=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
PLAYER1=$(cast wallet address --private-key $PLAYER1_PK)
PLAYER2=$(cast wallet address --private-key $PLAYER2_PK)

echo "🎮 Completing Game 7"
echo "Game: $GAME"
echo ""

# Open lottery
cast send $GAME "openLottery()" --private-key $HOST_PK --rpc-url $RPC > /dev/null && echo "✅ Lottery opened"

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

# Get contestant
CONTESTANT=$(cast call $GAME "game()(address,address)" --rpc-url $RPC | sed -n '2p' | xargs)
if [ "$CONTESTANT" = "$PLAYER1" ]; then
  WINNER_PK=$PLAYER1_PK
  echo "🏆 Player 1 won"
else
  WINNER_PK=$PLAYER2_PK
  echo "🏆 Player 2 won"
fi

# Select case 13
cast send $GAME "selectCase(uint256)" 13 --private-key $WINNER_PK --rpc-url $RPC > /dev/null && echo "✅ Selected case #13"

# Play through all rounds
echo ""
echo "Playing all rounds..."
for ROUND in 1 2 3 4 5 6 7 8 9; do
  echo -n "Round $ROUND..."
  for CASE in {0..25}; do
    if [ $CASE -ne 13 ]; then
      OPENED=$(cast call $GAME "briefcases(uint256)(uint256,bool)" $CASE --rpc-url $RPC 2>/dev/null | sed -n '2p' | xargs)
      if [ "$OPENED" = "false" ]; then
        VALUE=$(cast call $GAME "briefcases(uint256)(uint256)" $CASE --rpc-url $RPC 2>/dev/null | xargs)
        cast send $GAME "openCase(uint256,uint256,uint256[2],uint256[2][2],uint256[2])" \
          $CASE $VALUE "[0,0]" "[[0,0],[0,0]]" "[0,0]" \
          --private-key $WINNER_PK --rpc-url $RPC > /dev/null 2>&1 && break
      fi
    fi
  done

  if [ $ROUND -lt 9 ]; then
    cast send $GAME "rejectDeal()" --private-key $WINNER_PK --rpc-url $RPC > /dev/null 2>&1
  fi
  echo " ✅"
done

echo ""
echo "🎊 GAME COMPLETE!"
echo "================="
echo "Game: $GAME"
echo "Final case: #13 (unopened)"
echo ""
echo "Jackpot pool: 1 ETH"
echo ""
echo "View at: http://localhost:3000/game/$GAME"
