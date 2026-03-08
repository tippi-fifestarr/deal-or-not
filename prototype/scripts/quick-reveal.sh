#!/bin/zsh
# Quick manual reveal for game (simplified)
# Usage: ./quick-reveal.sh <GAME_ID>

SCRIPT_DIR="${0:a:h}"
source "$SCRIPT_DIR/env.sh"

GAME_ID="$1"
[[ -z "$GAME_ID" ]] && echo "Usage: quick-reveal.sh <GAME_ID>" && exit 1

echo "Manual Reveal for Game #$GAME_ID"
echo ""

# 1. Authorize deployer as CRE forwarder (if not already)
echo "Step 1: Authorizing deployer..."
cast send "$CONTRACT" "setCREForwarder(address)" "$DEPLOYER_ADDR" \
  --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" --gas-limit 100000 2>&1 | grep -q "transactionHash" && echo "✅ Authorized"

# 2. Get game state to find which case needs revealing
echo ""
echo "Step 2: Checking game state..."
zsh "$SCRIPT_DIR/play-game.sh" state "$GAME_ID"

# 3. Manual instructions
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Next: Manually reveal with cast send:"
echo ""
echo "cast send \$CONTRACT \\"
echo "  'fulfillCaseValue(uint256,uint8,uint256)' \\"
echo "  $GAME_ID <CASE_INDEX> <VALUE_CENTS> \\"
echo "  --private-key \$DEPLOYER_KEY \\"
echo "  --rpc-url \$RPC_URL"
echo ""
echo "VALUE_CENTS options: 1, 5, 10, 50, 100"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
