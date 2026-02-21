#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# 🤖 Claude — Reveal Lottery Secret
# ═══════════════════════════════════════════════════════════════════════
#
# Usage:
#   ./scripts/claude-reveal.sh <game-contract-address>
#
# Prerequisites:
#   - Must have already run claude-player3.sh for this game
#   - Game must be in LotteryReveal state (closeLotteryEntries called)
# ═══════════════════════════════════════════════════════════════════════

set -e

# Auto-load .env.local if it exists
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"
if [ -f "$ENV_FILE" ] && [ -z "$PRIVATE_KEY" ]; then
  echo "📂 Loading .env.local..."
  set -a; source "$ENV_FILE"; set +a
  PRIVATE_KEY="${PRIVATE_KEY:-$CLAUDE_PRIVATE_KEY}"
fi

RPC_URL="${RPC_URL:-https://sepolia.base.org}"
GAME_ADDR="$1"

if [ -z "$GAME_ADDR" ]; then
  echo "❌ Usage: $0 <game-contract-address>"
  exit 1
fi

if [ -z "$PRIVATE_KEY" ]; then
  echo "❌ Set PRIVATE_KEY env var first"
  exit 1
fi

SECRET_FILE="/tmp/claude-player3-${GAME_ADDR}.secret"
if [ ! -f "$SECRET_FILE" ]; then
  echo "❌ No secret found for game $GAME_ADDR"
  echo "   Did you run claude-player3.sh first?"
  exit 1
fi

SECRET=$(cat "$SECRET_FILE")
CLAUDE_ADDR=$(cast wallet address "$PRIVATE_KEY")

echo "🤖 Claude revealing secret for game: $GAME_ADDR"
echo "🔑 Secret: $SECRET"
echo "📬 Address: $CLAUDE_ADDR"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# Reveal secret
# ═══════════════════════════════════════════════════════════════════════
echo "Sending revealSecret($SECRET)..."
TX=$(cast send "$GAME_ADDR" \
  "revealSecret(bytes32)" "$SECRET" \
  --private-key "$PRIVATE_KEY" \
  --rpc-url "$RPC_URL" \
  --json 2>&1)

if echo "$TX" | grep -q '"status":"0x1"'; then
  TX_HASH=$(echo "$TX" | jq -r '.transactionHash')
  echo "✅ Secret revealed successfully!"
  echo "   TX: $TX_HASH"
  rm -f "$SECRET_FILE"
else
  echo "❌ Reveal failed!"
  echo "$TX"
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════"
echo "🤖 Claude has revealed! Lottery can now be drawn."
echo "═══════════════════════════════════════════"
echo ""
echo "Next: Anyone can call drawWinner() after the reveal window closes:"
echo "  cast send $GAME_ADDR 'drawWinner()' --private-key \$PRIVATE_KEY --rpc-url $RPC_URL"
