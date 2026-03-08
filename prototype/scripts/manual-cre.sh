#!/bin/zsh
# Manual CRE simulation (no SDK needed)
# Usage: ./manual-cre.sh <GAME_ID>

setopt KSH_ARRAYS  # Use 0-based indexing for arrays

SCRIPT_DIR="${0:a:h}"
source "$SCRIPT_DIR/env.sh"

GAME_ID="${1:?Usage: manual-cre.sh <GAME_ID>}"

echo "🔧 Manual CRE Mode"
echo "  Game: $GAME_ID"
echo ""

# Check if deployer is CRE forwarder
CURRENT_FORWARDER=$(cast call "$CONTRACT" "creForwarder()(address)" --rpc-url "$RPC_URL")
if [[ "$CURRENT_FORWARDER" != "$DEPLOYER_ADDR" ]]; then
  echo "⚙️  Setting deployer as CRE forwarder..."
  cast send "$CONTRACT" \
    "setCREForwarder(address)" "$DEPLOYER_ADDR" \
    --private-key "$DEPLOYER_KEY" \
    --rpc-url "$RPC_URL" \
    --gas-limit 100000 > /dev/null
  echo "✅ Deployer authorized"
  echo ""
fi

# Get game state
echo "📊 Reading game state..."
STATE=$(cast call "$CONTRACT" \
  "getGameState(uint256)(address,address,uint8,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])" \
  "$GAME_ID" --rpc-url "$RPC_URL")

# Parse state (line by line)
LINES=(${(f)STATE})
PHASE="${LINES[3]}"
ROUND="${LINES[5]}"
VRF_SEED="${LINES[9]}"

# Calculate used bitmap from opened[] array
OPENED_STR="${LINES[11]}"
BITMAP=0
for i in {0..4}; do
  VAL=$(echo "$OPENED_STR" | grep -o "\[$i\].*" | cut -d']' -f2 | xargs)
  if [[ "$VAL" == "true" ]]; then
    BITMAP=$((BITMAP | (1 << i)))
  fi
done

echo "  Phase: $PHASE (3=WaitingForCRE)"
echo "  Round: $ROUND"
echo "  VRF Seed: $VRF_SEED"
echo "  Opened bitmap: $BITMAP"
echo ""

# Find which case to reveal
LAST_OPENED=""
for i in {0..4}; do
  VAL=$(echo "$OPENED_STR" | grep -o "\[$i\].*" | cut -d']' -f2 | xargs)
  if [[ "$VAL" == "true" ]]; then
    LAST_OPENED=$i
  fi
done

if [[ -z "$LAST_OPENED" ]]; then
  echo "❌ No cases opened yet"
  exit 1
fi

echo "🎲 Computing case value for case #$LAST_OPENED..."

# Calculate value using Node.js
cd "$SCRIPT_DIR"
VALUE=$(node manual-reveal.js "$GAME_ID" "$LAST_OPENED" "$VRF_SEED" "$BITMAP")

echo "  Value: $VALUE cents"
echo ""

# Fulfill case value
echo "📝 Fulfilling case value onchain..."
TX=$(cast send "$CONTRACT" \
  "fulfillCaseValue(uint256,uint8,uint256)" \
  "$GAME_ID" "$LAST_OPENED" "$VALUE" \
  --private-key "$DEPLOYER_KEY" \
  --rpc-url "$RPC_URL" \
  --gas-limit 200000)

echo "✅ Case revealed!"
echo "  TX: $(echo "$TX" | grep transactionHash | awk '{print $2}')"
echo ""

# Check if we need to set banker offer
NEW_PHASE=$(cast call "$CONTRACT" "games(uint256)(address,address,uint8,uint8,uint8,uint8,uint8,uint256)" "$GAME_ID" --rpc-url "$RPC_URL" | sed -n '4p')

if [[ "$NEW_PHASE" == "4" ]]; then
  echo "🏦 Game is AwaitingOffer - setting banker offer..."

  # Simple banker offer: average of remaining values
  OFFER=50

  cast send "$CONTRACT" \
    "setBankerOffer(uint256,uint256)" \
    "$GAME_ID" "$OFFER" \
    --private-key "$DEPLOYER_KEY" \
    --rpc-url "$RPC_URL" \
    --gas-limit 150000 > /dev/null

  echo "✅ Banker offer set: $OFFER cents"
fi

echo ""
echo "✅ Done! Game state updated."
