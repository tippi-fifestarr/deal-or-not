#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# 🤖 Claude Auto-Player — Full lottery flow in one command
# ═══════════════════════════════════════════════════════════════════════
#
# Enters the lottery, polls for state change, reveals automatically.
#
# Usage:
#   ./scripts/claude-auto-player.sh <game-contract-address> [entry-fee-in-ether]
#
# ENV:
#   PRIVATE_KEY  — Claude's wallet private key
#   RPC_URL      — (optional) defaults to https://sepolia.base.org
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
ENTRY_FEE="${2:-0.0001}"
POLL_INTERVAL="${POLL_INTERVAL:-5}"  # seconds between state checks

if [ -z "$GAME_ADDR" ] || [ -z "$PRIVATE_KEY" ]; then
  echo "❌ Usage: PRIVATE_KEY=0x... $0 <game-address> [entry-fee]"
  echo "   Or set CLAUDE_PRIVATE_KEY in .env.local"
  exit 1
fi

CLAUDE_ADDR=$(cast wallet address "$PRIVATE_KEY")
echo "🤖 ═══════════════════════════════════════════════"
echo "   Claude Auto-Player for Deal or NOT!"
echo "   Address: $CLAUDE_ADDR"
echo "   Game:    $GAME_ADDR"
echo "   Fee:     $ENTRY_FEE ETH"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Helper: Read game state enum ──
get_game_state() {
  # game().state is the first field in the tuple
  # GameState enum: Created=0, LotteryOpen=1, LotteryReveal=2, LotteryComplete=3, ...
  local raw
  raw=$(cast call "$GAME_ADDR" "game()" --rpc-url "$RPC_URL" 2>/dev/null | head -1)
  # First 32 bytes of the return data is the state enum
  echo "$raw" | sed 's/^0x//' | cut -c1-64 | xargs -I{} printf "%d" "0x{}" 2>/dev/null || echo "-1"
}

state_name() {
  case $1 in
    0) echo "Created" ;;
    1) echo "LotteryOpen" ;;
    2) echo "LotteryReveal" ;;
    3) echo "LotteryComplete" ;;
    4) echo "CaseSelection" ;;
    5) echo "RoundActive" ;;
    6) echo "BankerOffer" ;;
    7) echo "FinalReveal" ;;
    8) echo "GameOver" ;;
    9) echo "Cancelled" ;;
    *) echo "Unknown($1)" ;;
  esac
}

# ── Check current state ──
CURRENT_STATE=$(get_game_state)
echo "📊 Current game state: $(state_name $CURRENT_STATE) ($CURRENT_STATE)"

if [ "$CURRENT_STATE" -lt 1 ]; then
  echo ""
  echo "⏳ Game not yet in LotteryOpen state. Waiting..."
  while true; do
    sleep "$POLL_INTERVAL"
    CURRENT_STATE=$(get_game_state)
    echo "   State: $(state_name $CURRENT_STATE)"
    if [ "$CURRENT_STATE" -ge 1 ]; then break; fi
  done
fi

if [ "$CURRENT_STATE" -gt 2 ]; then
  echo "❌ Game already past lottery phase (state=$CURRENT_STATE). Too late!"
  exit 1
fi

# ═══════════════════════════════════════════════════════════════════════
# STEP 1: Enter lottery (if state is LotteryOpen)
# ═══════════════════════════════════════════════════════════════════════
if [ "$CURRENT_STATE" -eq 1 ]; then
  echo ""
  echo "🎰 ═══ STEP 1: Entering Lottery ═══"
  
  # Generate secret
  SECRET=$(cast keccak "claude-auto-$(date +%s)-$$-$RANDOM")
  echo "🔑 Secret: $SECRET"
  
  # Compute commitHash = keccak256(abi.encodePacked(secret, address))
  PACKED=$(printf '%s%s' "${SECRET:2}" "$(echo ${CLAUDE_ADDR:2} | tr '[:upper:]' '[:lower:]')")
  COMMIT_HASH=$(cast keccak "0x$PACKED")
  echo "📝 Commit: $COMMIT_HASH"
  
  # Send tx
  echo "📤 Sending enterLottery..."
  TX=$(cast send "$GAME_ADDR" \
    "enterLottery(bytes32)" "$COMMIT_HASH" \
    --value "${ENTRY_FEE}ether" \
    --private-key "$PRIVATE_KEY" \
    --rpc-url "$RPC_URL" \
    --json 2>&1)
  
  if echo "$TX" | grep -q '"status":"0x1"'; then
    TX_HASH=$(echo "$TX" | jq -r '.transactionHash')
    echo "✅ Entered lottery! TX: $TX_HASH"
  else
    echo "❌ Entry failed:"
    echo "$TX" | head -5
    exit 1
  fi
  
  # Save secret
  echo "$SECRET" > "/tmp/claude-player3-${GAME_ADDR}.secret"
else
  # Already in reveal phase, load saved secret
  SECRET_FILE="/tmp/claude-player3-${GAME_ADDR}.secret"
  if [ ! -f "$SECRET_FILE" ]; then
    echo "❌ In reveal phase but no saved secret found!"
    exit 1
  fi
  SECRET=$(cat "$SECRET_FILE")
  echo "🔑 Loaded saved secret for reveal phase"
fi

# ═══════════════════════════════════════════════════════════════════════
# STEP 2: Wait for LotteryReveal state
# ═══════════════════════════════════════════════════════════════════════
echo ""
echo "⏳ ═══ STEP 2: Waiting for reveal phase ═══"
echo "   (Host or anyone calls closeLotteryEntries after deadline)"

while true; do
  CURRENT_STATE=$(get_game_state)
  if [ "$CURRENT_STATE" -ge 2 ]; then break; fi
  echo "   ⏳ Still in $(state_name $CURRENT_STATE)... (checking every ${POLL_INTERVAL}s)"
  sleep "$POLL_INTERVAL"
done

if [ "$CURRENT_STATE" -ne 2 ]; then
  echo "❌ Game jumped past reveal phase (state=$(state_name $CURRENT_STATE))"
  exit 1
fi

echo "🎉 Reveal phase is open!"

# ═══════════════════════════════════════════════════════════════════════
# STEP 3: Reveal secret
# ═══════════════════════════════════════════════════════════════════════
echo ""
echo "🔓 ═══ STEP 3: Revealing Secret ═══"
echo "📤 Sending revealSecret..."

TX=$(cast send "$GAME_ADDR" \
  "revealSecret(bytes32)" "$SECRET" \
  --private-key "$PRIVATE_KEY" \
  --rpc-url "$RPC_URL" \
  --json 2>&1)

if echo "$TX" | grep -q '"status":"0x1"'; then
  TX_HASH=$(echo "$TX" | jq -r '.transactionHash')
  echo "✅ Secret revealed! TX: $TX_HASH"
  rm -f "/tmp/claude-player3-${GAME_ADDR}.secret"
else
  echo "❌ Reveal failed:"
  echo "$TX" | head -5
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "🤖 Claude has entered and revealed!"
echo ""
echo "   Next steps:"
echo "   1. Wait for reveal window to close"
echo "   2. Anyone calls: drawWinner()"
echo ""
echo "   Quick draw command:"
echo "   cast send $GAME_ADDR 'drawWinner()' \\"
echo "     --private-key \$PRIVATE_KEY --rpc-url $RPC_URL"
echo "═══════════════════════════════════════════════════"
