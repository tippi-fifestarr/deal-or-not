#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# 🤖 Claude — Player 3 (CLI Lottery Participant)
# ═══════════════════════════════════════════════════════════════════════
# 
# Usage:
#   ./scripts/claude-player3.sh <game-contract-address> [entry-fee-in-ether]
#
# Requirements:
#   - foundry (cast) installed
#   - PRIVATE_KEY env var set (Claude's wallet)
#   - Base Sepolia ETH in the wallet
#
# Flow: Enter lottery → Wait → Reveal secret → Done
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

# ── Config ──
RPC_URL="${RPC_URL:-https://sepolia.base.org}"
CHAIN_ID=84532
FACTORY="0x78da752e9dbd73a9b0c0f5ddd15e854d2b879524"

# ── Args ──
GAME_ADDR="$1"
ENTRY_FEE="${2:-0.0001}"  # default 0.0001 ETH

if [ -z "$GAME_ADDR" ]; then
  echo "❌ Usage: $0 <game-contract-address> [entry-fee-in-ether]"
  echo ""
  echo "  Example: $0 0x1234...abcd 0.0001"
  echo ""
  echo "  To find game addresses, check the frontend or run:"
  echo "  cast call $FACTORY 'getDeployments(uint256,uint256)(tuple[])' 0 10 --rpc-url $RPC_URL"
  exit 1
fi

if [ -z "$PRIVATE_KEY" ]; then
  echo "❌ Set PRIVATE_KEY env var first"
  echo "   export PRIVATE_KEY=0x..."
  exit 1
fi

# Get Claude's address from the private key
CLAUDE_ADDR=$(cast wallet address "$PRIVATE_KEY")
echo "🤖 Claude's address: $CLAUDE_ADDR"
echo "🎮 Game contract:    $GAME_ADDR"
echo "💰 Entry fee:        $ENTRY_FEE ETH"
echo ""

# ── Check balance ──
BALANCE=$(cast balance "$CLAUDE_ADDR" --rpc-url "$RPC_URL" --ether)
echo "💳 Balance: $BALANCE ETH"
echo ""

# ── Check game state ──
echo "📊 Checking game state..."
STATE=$(cast call "$GAME_ADDR" "game()((uint8,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bytes32,(uint256,uint256,uint256,uint256,uint16,uint16,uint16,uint8,uint8)))" --rpc-url "$RPC_URL" 2>/dev/null || echo "FAILED")

if [ "$STATE" = "FAILED" ]; then
  echo "❌ Could not read game state. Is the address correct?"
  exit 1
fi

echo "✅ Game contract is accessible"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# STEP 1: Generate secret & commit hash
# ═══════════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════"
echo "STEP 1: Generate commit hash"
echo "═══════════════════════════════════════════"

# Generate a random 32-byte secret
SECRET=$(cast keccak "claude-player3-$(date +%s)-$RANDOM")
echo "🔑 Secret: $SECRET"

# Compute commitHash = keccak256(abi.encodePacked(secret, address))
COMMIT_HASH=$(cast keccak $(cast abi-encode "f(bytes32,address)" "$SECRET" "$CLAUDE_ADDR" | cut -c3-) 2>/dev/null)

# The contract uses: keccak256(abi.encodePacked(secret, msg.sender))
# abi.encodePacked(bytes32, address) = secret (32 bytes) + address (20 bytes) = 52 bytes
PACKED=$(printf '%s%s' "${SECRET:2}" "$(echo ${CLAUDE_ADDR:2} | tr '[:upper:]' '[:lower:]')")
COMMIT_HASH=$(cast keccak "0x$PACKED")
echo "📝 Commit hash: $COMMIT_HASH"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# STEP 2: Enter lottery
# ═══════════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════"
echo "STEP 2: Enter lottery"
echo "═══════════════════════════════════════════"

echo "Sending enterLottery($COMMIT_HASH) with $ENTRY_FEE ETH..."
TX=$(cast send "$GAME_ADDR" \
  "enterLottery(bytes32)" "$COMMIT_HASH" \
  --value "${ENTRY_FEE}ether" \
  --private-key "$PRIVATE_KEY" \
  --rpc-url "$RPC_URL" \
  --json 2>&1)

if echo "$TX" | grep -q '"status":"0x1"'; then
  TX_HASH=$(echo "$TX" | jq -r '.transactionHash')
  echo "✅ Lottery entry successful!"
  echo "   TX: $TX_HASH"
else
  echo "❌ Lottery entry failed!"
  echo "$TX"
  exit 1
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════
# STEP 3: Save secret for reveal
# ═══════════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════"
echo "STEP 3: Secret saved — waiting for reveal phase"
echo "═══════════════════════════════════════════"

# Save to temp file so the reveal step can pick it up
SECRET_FILE="/tmp/claude-player3-${GAME_ADDR}.secret"
echo "$SECRET" > "$SECRET_FILE"
echo "🔑 Secret saved to: $SECRET_FILE"
echo ""
echo "⏳ When the lottery entry period ends and the host calls closeLotteryEntries(),"
echo "   run the reveal step:"
echo ""
echo "   ./scripts/claude-reveal.sh $GAME_ADDR"
echo ""
echo "═══════════════════════════════════════════"
echo "🤖 Claude is in the lottery! Waiting for reveal phase..."
echo "═══════════════════════════════════════════"
