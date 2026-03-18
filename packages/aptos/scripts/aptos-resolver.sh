#!/usr/bin/env bash
# Aptos Resolver — Polling state machine for the two-TX randomness pattern
#
# This is the "missing piece" that the original port didn't build.
# On EVM, Chainlink CRE triggers reveal/banker/keep/swap automatically via events.
# On Aptos, there's no event-triggered automation — so we poll and act.
#
# Usage: ./scripts/aptos-resolver.sh <GAME_ID> [--poll <seconds>] [--keep|--swap]
#
# The resolver watches a game and automatically:
#   WaitingForReveal → calls reveal_case (randomness)
#   AwaitingOffer    → calculates + sets banker offer
#   FinalRound       → waits for --keep/--swap flag, then executes
#   GameOver         → exits
#
# Architecture note (for Aptos team):
#   This script replaces what Chainlink CRE does on EVM. Aptos doesn't have:
#   - Event-triggered workflows (CRE)
#   - Scheduled transactions (Greg: "supposed to be done in November")
#   - Keeper/automation services (like Chainlink Automation)
#   So we poll. In production, this would be a Node.js service or cron job.
#   See LEARNING_JOURNAL.md Phase 10 for the full architecture discussion.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env-aptos.sh"

require_module_addr || exit 1

GAME_ID="${1:?Usage: aptos-resolver.sh <GAME_ID> [--poll <seconds>] [--keep|--swap]}"
shift

POLL_INTERVAL=3
FINAL_CHOICE=""

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --poll) POLL_INTERVAL="$2"; shift 2 ;;
    --keep) FINAL_CHOICE="keep"; shift ;;
    --swap) FINAL_CHOICE="swap"; shift ;;
    *) aptos_err "Unknown flag: $1"; exit 1 ;;
  esac
done

# ── Phase constants (must match deal_or_not_quickplay.move) ──
PHASE_CREATED=0
PHASE_ROUND=1
PHASE_WAITING_FOR_REVEAL=2
PHASE_AWAITING_OFFER=3
PHASE_BANKER_OFFER=4
PHASE_FINAL_ROUND=5
PHASE_GAME_OVER=6

PHASE_NAMES=("Created" "Round" "WaitingForReveal" "AwaitingOffer" "BankerOffer" "FinalRound" "GameOver")

# ── Get current game phase ──
get_phase() {
  aptos move view \
    --function-id "${QUICKPLAY}::get_game_state" \
    --args "address:${APTOS_MODULE_ADDR}" "u64:${GAME_ID}" \
    --url "$APTOS_NODE_URL" 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
r = data.get('Result', data)
print(r[1])
" 2>/dev/null
}

# ── Calculate banker offer ──
calc_offer() {
  aptos move view \
    --function-id "${QUICKPLAY}::calculate_banker_offer" \
    --args "address:${APTOS_MODULE_ADDR}" "u64:${GAME_ID}" \
    --url "$APTOS_NODE_URL" 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
r = data.get('Result', data)
print(r[0])
" 2>/dev/null
}

# ── Main loop ──
PREV_PHASE=""
aptos_log "Resolver started for game $GAME_ID (poll every ${POLL_INTERVAL}s)"
aptos_log "Resolver profile: $APTOS_PROFILE_RESOLVER"
if [[ -n "$FINAL_CHOICE" ]]; then
  aptos_log "Final choice preset: $FINAL_CHOICE"
fi
echo ""

while true; do
  PHASE=$(get_phase)

  if [[ -z "$PHASE" ]]; then
    aptos_err "Failed to read game state. Retrying..."
    sleep "$POLL_INTERVAL"
    continue
  fi

  PHASE_NAME="${PHASE_NAMES[$PHASE]:-Unknown}"

  # Only log on phase change (deduplication, like cre-simulate.sh)
  if [[ "$PHASE" != "$PREV_PHASE" ]]; then
    aptos_log "Phase: $PHASE_NAME ($PHASE)"
  fi

  case "$PHASE" in
    "$PHASE_WAITING_FOR_REVEAL")
      if [[ "$PHASE" != "$PREV_PHASE" ]]; then
        aptos_log "→ Calling reveal_case (randomness)..."
        aptos_run "$APTOS_PROFILE_RESOLVER" "${QUICKPLAY}::reveal_case" \
          "address:${APTOS_MODULE_ADDR}" "u64:${GAME_ID}" > /dev/null 2>&1
        aptos_ok "Case revealed!"
      fi
      ;;

    "$PHASE_AWAITING_OFFER")
      if [[ "$PHASE" != "$PREV_PHASE" ]]; then
        OFFER=$(calc_offer)
        aptos_log "→ Setting banker offer: $OFFER cents..."
        aptos_run "$APTOS_PROFILE_RESOLVER" "${QUICKPLAY}::set_banker_offer" \
          "address:${APTOS_MODULE_ADDR}" "u64:${GAME_ID}" "u64:${OFFER}" > /dev/null 2>&1
        aptos_ok "Banker offer set: $OFFER cents"
      fi
      ;;

    "$PHASE_FINAL_ROUND")
      if [[ "$PHASE" != "$PREV_PHASE" ]]; then
        if [[ -n "$FINAL_CHOICE" ]]; then
          aptos_log "→ Executing ${FINAL_CHOICE}_case (randomness)..."
          aptos_run "$APTOS_PROFILE_RESOLVER" "${QUICKPLAY}::${FINAL_CHOICE}_case" \
            "address:${APTOS_MODULE_ADDR}" "u64:${GAME_ID}" > /dev/null 2>&1
          aptos_ok "Final case resolved! ($FINAL_CHOICE)"
        else
          aptos_log "⏳ Waiting for player's final choice..."
          aptos_log "  Re-run with: ./scripts/aptos-resolver.sh $GAME_ID --keep"
          aptos_log "  Or:          ./scripts/aptos-resolver.sh $GAME_ID --swap"
          # Keep polling — in production, this would check an on-chain flag
          # set by request_keep/request_swap entry functions
        fi
      fi
      ;;

    "$PHASE_GAME_OVER")
      if [[ "$PHASE" != "$PREV_PHASE" ]]; then
        aptos_ok "Game $GAME_ID is over!"
        # Show final state
        bash "$SCRIPT_DIR/play-aptos.sh" state "$GAME_ID"
      fi
      exit 0
      ;;

    *)
      # Phases 0 (Created), 1 (Round), 4 (BankerOffer) — player's turn
      ;;
  esac

  PREV_PHASE="$PHASE"
  sleep "$POLL_INTERVAL"
done
