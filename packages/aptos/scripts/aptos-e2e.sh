#!/usr/bin/env bash
# End-to-end game runner for Aptos Deal-or-Not
# Plays a complete game: create → pick → 3 rounds of open/reveal/offer/reject → keep
#
# Usage: ./scripts/aptos-e2e.sh [--accept-round N]
#   --accept-round N  Accept the deal after round N (default: play all rounds, then keep)
#
# Requires: APTOS_MODULE_ADDR set, deployer/resolver/player profiles configured
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env-aptos.sh"

require_module_addr || exit 1

ACCEPT_ROUND=""
[[ "$1" == "--accept-round" ]] && ACCEPT_ROUND="$2"

PLAY="bash $SCRIPT_DIR/play-aptos.sh"

# ── Phase constants ──
PHASE_CREATED=0
PHASE_ROUND=1
PHASE_WAITING_FOR_REVEAL=2
PHASE_AWAITING_OFFER=3
PHASE_BANKER_OFFER=4
PHASE_FINAL_ROUND=5
PHASE_GAME_OVER=6

get_phase() {
  local GID="$1"
  aptos move view \
    --function-id "${QUICKPLAY}::get_game_state" \
    --args "address:${APTOS_MODULE_ADDR}" "u64:${GID}" \
    --url "$APTOS_NODE_URL" 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
r = data.get('Result', data)
print(r[1])
" 2>/dev/null
}

wait_for_phase() {
  local GID="$1"
  local EXPECTED="$2"
  local MAX_WAIT=30
  local ELAPSED=0
  while [[ $ELAPSED -lt $MAX_WAIT ]]; do
    PHASE=$(get_phase "$GID")
    [[ "$PHASE" == "$EXPECTED" ]] && return 0
    sleep 1
    ELAPSED=$((ELAPSED + 1))
  done
  aptos_err "Timeout waiting for phase $EXPECTED (stuck at $PHASE)"
  return 1
}

echo ""
aptos_log "════════════════════════════════════════════════"
aptos_log "  DEAL OR NOT — Aptos E2E Test"
aptos_log "════════════════════════════════════════════════"
echo ""

# ── Step 1: Create game ──
aptos_log "[1/9] Creating game..."
$PLAY create
# Get the game ID
NEXT=$(aptos move view \
  --function-id "${QUICKPLAY}::get_next_game_id" \
  --args "address:${APTOS_MODULE_ADDR}" \
  --url "$APTOS_NODE_URL" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['Result'][0])" 2>/dev/null)
GID=$((NEXT - 1))
aptos_ok "Game created: ID $GID"
echo ""

# ── Step 2: Pick case ──
aptos_log "[2/9] Picking case #2..."
$PLAY pick "$GID" 2
aptos_ok "Case #2 selected"
echo ""

# ── Round 1 ──
aptos_log "[3/9] Round 1: Opening case #0..."
$PLAY open "$GID" 0
sleep 1
aptos_log "  Resolver: revealing..."
$PLAY reveal "$GID"
sleep 1

if [[ "$ACCEPT_ROUND" == "1" ]]; then
  aptos_log "  Setting banker offer..."
  $PLAY banker "$GID"
  sleep 1
  aptos_log "  DEAL! Accepting..."
  $PLAY accept "$GID"
  aptos_ok "Game over (accepted round 1)"
  $PLAY state "$GID"
  exit 0
fi

aptos_log "  Setting banker offer..."
$PLAY banker "$GID"
sleep 1
aptos_log "  NO DEAL!"
$PLAY reject "$GID"
aptos_ok "Round 1 complete"
echo ""

# ── Round 2 ──
aptos_log "[5/9] Round 2: Opening case #1..."
$PLAY open "$GID" 1
sleep 1
aptos_log "  Resolver: revealing..."
$PLAY reveal "$GID"
sleep 1

if [[ "$ACCEPT_ROUND" == "2" ]]; then
  aptos_log "  Setting banker offer..."
  $PLAY banker "$GID"
  sleep 1
  aptos_log "  DEAL! Accepting..."
  $PLAY accept "$GID"
  aptos_ok "Game over (accepted round 2)"
  $PLAY state "$GID"
  exit 0
fi

aptos_log "  Setting banker offer..."
$PLAY banker "$GID"
sleep 1
aptos_log "  NO DEAL!"
$PLAY reject "$GID"
aptos_ok "Round 2 complete"
echo ""

# ── Round 3 (final reveal) ──
aptos_log "[7/9] Round 3: Opening case #3 (last non-player case)..."
$PLAY open "$GID" 3
sleep 1
aptos_log "  Resolver: revealing..."
$PLAY reveal "$GID"
sleep 1

# Should now be in FinalRound
PHASE=$(get_phase "$GID")
if [[ "$PHASE" != "$PHASE_FINAL_ROUND" ]]; then
  aptos_err "Expected FinalRound phase, got $PHASE"
  $PLAY state "$GID"
  exit 1
fi
aptos_ok "FinalRound reached!"
echo ""

# ── Final decision: keep ──
aptos_log "[8/9] Final decision: KEEP case #2..."
$PLAY keep "$GID"
sleep 1

# ── Verify game over ──
PHASE=$(get_phase "$GID")
if [[ "$PHASE" != "$PHASE_GAME_OVER" ]]; then
  aptos_err "Expected GameOver phase, got $PHASE"
  exit 1
fi

echo ""
aptos_log "[9/9] Final game state:"
$PLAY state "$GID"

echo ""
aptos_log "════════════════════════════════════════════════"
aptos_ok "E2E TEST PASSED!"
aptos_log "════════════════════════════════════════════════"
