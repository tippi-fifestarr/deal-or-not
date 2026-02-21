#!/bin/bash
# Complete Game Simulation - Play through all rounds leaving final case

set -e

GAME=0xe952855d88f7bbbdd68342e662eb2f03317d2783
PLAYER2_PK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
HOST_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
RPC=http://127.0.0.1:8545
SELECTED_CASE=13

echo "🎮 Deal or No Deal - Complete Game Simulation"
echo "=============================================="
echo ""
echo "Game: $GAME"
echo "Winner: Player 2"
echo "Selected Case: #$SELECTED_CASE"
echo ""

# Round 1: Open 6 cases
echo "🎲 ROUND 1: Opening 6 cases"
echo "----------------------------"
CASES_TO_OPEN=(0 1 2 3 4 5)
for CASE_IDX in "${CASES_TO_OPEN[@]}"; do
  if [ $CASE_IDX -ne $SELECTED_CASE ]; then
    echo -n "  Case #$CASE_IDX: "
    VALUE=$(cast call $GAME "briefcases(uint256)(uint256,bool,bool,address)" $CASE_IDX --rpc-url $RPC 2>/dev/null | head -1 | xargs)
    cast send $GAME "openCase(uint256,uint256,uint256[2],uint256[2][2],uint256[2])" \
      $CASE_IDX \
      $VALUE \
      "[0,0]" \
      "[[0,0],[0,0]]" \
      "[0,0]" \
      --private-key $PLAYER2_PK \
      --rpc-url $RPC > /dev/null 2>&1
    echo "✅ Opened (value: $VALUE)"
  fi
done

# Get banker offer for round 1
echo ""
echo "☎️  Banker is calling..."
OFFER=$(cast call $GAME "game()(address,address,uint8,uint8,bytes32,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)" --rpc-url $RPC | sed -n '9p' | xargs)
echo "💰 Banker offers: $OFFER wei"
echo ""
read -p "Deal or No Deal? (d/n): " CHOICE

if [ "$CHOICE" = "d" ]; then
  echo "📞 Calling acceptDeal..."
  cast send $GAME "acceptDeal()" --private-key $PLAYER2_PK --rpc-url $RPC > /dev/null
  echo "✅ DEAL! Game over."
  exit 0
else
  echo "❌ NO DEAL! Continuing to next round..."
  cast send $GAME "rejectDeal()" --private-key $PLAYER2_PK --rpc-url $RPC > /dev/null
fi

# Round 2: Open 5 cases
echo ""
echo "🎲 ROUND 2: Opening 5 cases"
echo "----------------------------"
CASES_TO_OPEN=(6 7 8 9 10)
for CASE_IDX in "${CASES_TO_OPEN[@]}"; do
  if [ $CASE_IDX -ne $SELECTED_CASE ]; then
    echo -n "  Case #$CASE_IDX: "
    VALUE=$(cast call $GAME "briefcases(uint256)(uint256,bool,bool,address)" $CASE_IDX --rpc-url $RPC 2>/dev/null | head -1 | xargs)
    cast send $GAME "openCase(uint256,uint256,uint256[2],uint256[2][2],uint256[2])" \
      $CASE_IDX \
      $VALUE \
      "[0,0]" \
      "[[0,0],[0,0]]" \
      "[0,0]" \
      --private-key $PLAYER2_PK \
      --rpc-url $RPC > /dev/null 2>&1
    echo "✅ Opened (value: $VALUE)"
  fi
done

# Get banker offer for round 2
echo ""
echo "☎️  Banker is calling..."
OFFER=$(cast call $GAME "game()(address,address,uint8,uint8,bytes32,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)" --rpc-url $RPC | sed -n '9p' | xargs)
echo "💰 Banker offers: $OFFER wei"
echo ""
read -p "Deal or No Deal? (d/n): " CHOICE

if [ "$CHOICE" = "d" ]; then
  echo "📞 Calling acceptDeal..."
  cast send $GAME "acceptDeal()" --private-key $PLAYER2_PK --rpc-url $RPC > /dev/null
  echo "✅ DEAL! Game over."
  exit 0
else
  echo "❌ NO DEAL! Continuing to next round..."
  cast send $GAME "rejectDeal()" --private-key $PLAYER2_PK --rpc-url $RPC > /dev/null
fi

# Round 3: Open 4 cases
echo ""
echo "🎲 ROUND 3: Opening 4 cases"
echo "----------------------------"
CASES_TO_OPEN=(11 12 14 15)
for CASE_IDX in "${CASES_TO_OPEN[@]}"; do
  if [ $CASE_IDX -ne $SELECTED_CASE ]; then
    echo -n "  Case #$CASE_IDX: "
    VALUE=$(cast call $GAME "briefcases(uint256)(uint256,bool,bool,address)" $CASE_IDX --rpc-url $RPC 2>/dev/null | head -1 | xargs)
    cast send $GAME "openCase(uint256,uint256,uint256[2],uint256[2][2],uint256[2])" \
      $CASE_IDX \
      $VALUE \
      "[0,0]" \
      "[[0,0],[0,0]]" \
      "[0,0]" \
      --private-key $PLAYER2_PK \
      --rpc-url $RPC > /dev/null 2>&1
    echo "✅ Opened (value: $VALUE)"
  fi
done

echo ""
echo "🎊 Simulation paused at Round 3"
echo "================================"
echo ""
echo "Remaining cases:"
REMAINING=0
for i in {0..25}; do
  if [ $i -ne $SELECTED_CASE ]; then
    OPENED=$(cast call $GAME "briefcases(uint256)(uint256,bool,bool,address)" $i --rpc-url $RPC 2>/dev/null | sed -n '2p' | xargs)
    if [ "$OPENED" = "false" ]; then
      VALUE=$(cast call $GAME "briefcases(uint256)(uint256,bool,bool,address)" $i --rpc-url $RPC 2>/dev/null | head -1 | xargs)
      echo "  Case #$i: $VALUE wei"
      REMAINING=$((REMAINING + 1))
    fi
  fi
done

echo ""
echo "Selected case: #$SELECTED_CASE (unopened)"
echo "Total remaining: $((REMAINING + 1)) cases"
echo ""
echo "View game at: http://localhost:3000/game/$GAME"
