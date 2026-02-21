#!/bin/bash
GAME=0x28b59787DC51A64AB16931bcD3179C90D17de620
RPC=http://127.0.0.1:8545
PLAYER2_PK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a

echo "🎬 THE FINAL REVEAL!"
echo "==================="
echo ""

# Check all unopened cases
echo "Remaining unopened cases:"
for i in {0..25}; do
  OPENED=$(cast call $GAME "briefcases(uint256)(uint256,bool,bool,address)" $i --rpc-url $RPC 2>/dev/null | sed -n '2p' | xargs)
  if [ "$OPENED" = "false" ]; then
    VALUE=$(cast call $GAME "briefcases(uint256)(uint256)" $i --rpc-url $RPC 2>/dev/null | xargs)
    echo "  Case #$i: $VALUE wei"
  fi
done

echo ""
echo "📦 Opening final case #13..."
VALUE=$(cast call $GAME "briefcases(uint256)(uint256)" 13 --rpc-url $RPC | xargs)
echo "   Value: $VALUE wei ($(python3 -c "print(f'{$VALUE / 1e18:.10f}')") ETH)"

echo ""
echo "Calling openFinalCase..."
cast send $GAME "openFinalCase(uint256,uint256[2],uint256[2][2],uint256[2])" \
  $VALUE \
  "[0,0]" \
  "[[0,0],[0,0]]" \
  "[0,0]" \
  --private-key $PLAYER2_PK \
  --rpc-url $RPC

echo ""
echo "🎊 GAME RESOLVED!"
echo "================"

# Check outcome
OUTCOME=$(cast call $GAME "game()(address,address,uint8,uint8)" --rpc-url $RPC | sed -n '4p' | xargs)
echo "Outcome: $OUTCOME"

# Get final payout
PAYOUT=$(cast call $GAME "game()(address,address,uint8,uint8,bytes32,uint256)" --rpc-url $RPC | sed -n '6p' | xargs)
echo "Payout: $PAYOUT wei"
python3 -c "print(f'        {$PAYOUT / 1e18:.10f} ETH')"
python3 -c "print(f'        \${$PAYOUT / 1e18 * 1960:.2f} USD (@ \$1,960/ETH)')"
