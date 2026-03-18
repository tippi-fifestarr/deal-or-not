#!/usr/bin/env bash
# Aptos QuickPlay game helper — mirrors play-game.sh for EVM
# Usage: ./scripts/play-aptos.sh <command> [args...]
#
# Commands:
#   create              Create a new game ($0.25 entry fee in APT)
#   pick  <GID> <CASE>  Pick your case (0-4)
#   open  <GID> <CASE>  Open a case -> Resolver reveals value
#   accept <GID>        Accept the deal (Bank pays you)
#   reject <GID>        Reject the deal
#   keep  <GID>         Keep your case (resolver-mediated, final round)
#   swap  <GID>         Swap your case (resolver-mediated, final round)
#   state <GID>         Show game state
#   reveal <GID>        [RESOLVER] Reveal a pending case value
#   banker <GID> [CENTS] [RESOLVER] Set banker offer
#   sweeten [OCTAS]     Sweeten the bank
#   fee                 Estimate current entry fee
#   next-id             Show next game ID
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env-aptos.sh"

require_module_addr || exit 1

CMD="${1:?Usage: play-aptos.sh <create|pick|open|accept|reject|keep|swap|state|reveal|banker|sweeten|fee|next-id> [args...]}"
shift

# ── Helper: parse game state tuple from view result ──
parse_game_state() {
  local GID="$1"
  local RESULT
  RESULT=$(aptos move view \
    --function-id "${QUICKPLAY}::get_game_state" \
    --args "address:${APTOS_MODULE_ADDR}" "u64:${GID}" \
    --url "$APTOS_NODE_URL" 2>/dev/null)

  if [[ -z "$RESULT" ]]; then
    aptos_err "Failed to fetch game state for game $GID"
    return 1
  fi

  echo "$RESULT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
# Result is an array: [player, phase, player_case, current_round, total_collapsed,
#                      banker_offer, final_payout, apt_per_dollar, case_values, opened]
r = data['Result'] if 'Result' in data else data
phases = ['Created', 'Round', 'WaitingForReveal', 'AwaitingOffer', 'BankerOffer', 'FinalRound', 'GameOver']
phase_num = int(r[1])
phase_name = phases[phase_num] if phase_num < len(phases) else f'Unknown({phase_num})'
print(f'  Player:         {r[0]}')
print(f'  Phase:          {phase_name} ({phase_num})')
print(f'  Player Case:    {r[2]}')
print(f'  Current Round:  {r[3]}')
print(f'  Total Collapsed:{r[4]}')
print(f'  Banker Offer:   {r[5]} cents')
print(f'  Final Payout:   {r[6]} cents')
print(f'  APT/Dollar:     {r[7]}')
print(f'  Case Values:    {r[8]}')
print(f'  Opened:         {r[9]}')
" 2>/dev/null || echo "$RESULT"
}

case "$CMD" in
  create)
    aptos_log "Creating new QuickPlay game with \$0.25 entry..."
    aptos_log "(Player profile: $APTOS_PROFILE_PLAYER)"
    aptos_run "$APTOS_PROFILE_PLAYER" "${QUICKPLAY}::create_game" \
      "address:${APTOS_MODULE_ADDR}"
    echo ""
    # Show the game ID
    NEXT=$(aptos move view \
      --function-id "${QUICKPLAY}::get_next_game_id" \
      --args "address:${APTOS_MODULE_ADDR}" \
      --url "$APTOS_NODE_URL" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['Result'][0])" 2>/dev/null)
    GID=$((NEXT - 1))
    aptos_ok "Game created! Game ID: $GID"
    echo "  Next: ./scripts/play-aptos.sh pick $GID <CASE>"
    ;;

  pick)
    GAME_ID="${1:?Usage: play-aptos.sh pick <GAME_ID> <CASE_INDEX>}"
    CASE="${2:?Usage: play-aptos.sh pick <GAME_ID> <CASE_INDEX>}"
    aptos_log "Picking case #$CASE for game $GAME_ID..."
    aptos_run "$APTOS_PROFILE_PLAYER" "${QUICKPLAY}::pick_case" \
      "address:${APTOS_MODULE_ADDR}" "u64:${GAME_ID}" "u8:${CASE}"
    aptos_ok "Case #$CASE picked!"
    echo "  Next: ./scripts/play-aptos.sh open $GAME_ID <CASE_TO_OPEN>"
    ;;

  open)
    GAME_ID="${1:?Usage: play-aptos.sh open <GAME_ID> <CASE_INDEX>}"
    CASE="${2:?Usage: play-aptos.sh open <GAME_ID> <CASE_INDEX>}"
    aptos_log "Opening case #$CASE for game $GAME_ID..."
    aptos_run "$APTOS_PROFILE_PLAYER" "${QUICKPLAY}::open_case" \
      "address:${APTOS_MODULE_ADDR}" "u64:${GAME_ID}" "u8:${CASE}"
    aptos_ok "Case #$CASE open requested! Phase → WaitingForReveal"
    echo "  Next: ./scripts/play-aptos.sh reveal $GAME_ID"
    echo "  (or run aptos-resolver.sh to auto-resolve)"
    ;;

  reveal)
    GAME_ID="${1:?Usage: play-aptos.sh reveal <GAME_ID>}"
    aptos_log "Revealing case value for game $GAME_ID (resolver)..."
    aptos_run "$APTOS_PROFILE_RESOLVER" "${QUICKPLAY}::reveal_case" \
      "address:${APTOS_MODULE_ADDR}" "u64:${GAME_ID}"
    aptos_ok "Case revealed!"
    ;;

  banker)
    GAME_ID="${1:?Usage: play-aptos.sh banker <GAME_ID> [OFFER_CENTS]}"
    if [[ -n "$2" ]]; then
      OFFER="$2"
    else
      # Calculate offer on-chain
      aptos_log "Calculating banker offer..."
      OFFER=$(aptos move view \
        --function-id "${QUICKPLAY}::calculate_banker_offer" \
        --args "address:${APTOS_MODULE_ADDR}" "u64:${GAME_ID}" \
        --url "$APTOS_NODE_URL" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['Result'][0])" 2>/dev/null)
      aptos_log "Calculated offer: $OFFER cents"
    fi
    aptos_log "Setting banker offer to $OFFER cents for game $GAME_ID..."
    aptos_run "$APTOS_PROFILE_RESOLVER" "${QUICKPLAY}::set_banker_offer" \
      "address:${APTOS_MODULE_ADDR}" "u64:${GAME_ID}" "u64:${OFFER}"
    aptos_ok "Banker offer set: $OFFER cents"
    ;;

  accept)
    GAME_ID="${1:?Usage: play-aptos.sh accept <GAME_ID>}"
    aptos_log "Accepting deal for game $GAME_ID..."
    aptos_run "$APTOS_PROFILE_PLAYER" "${QUICKPLAY}::accept_deal" \
      "address:${APTOS_MODULE_ADDR}" "u64:${GAME_ID}"
    aptos_ok "Deal accepted! Check your wallet for the payout."
    ;;

  reject)
    GAME_ID="${1:?Usage: play-aptos.sh reject <GAME_ID>}"
    aptos_log "Rejecting deal for game $GAME_ID..."
    aptos_run "$APTOS_PROFILE_PLAYER" "${QUICKPLAY}::reject_deal" \
      "address:${APTOS_MODULE_ADDR}" "u64:${GAME_ID}"
    aptos_ok "NO DEAL! Next round."
    ;;

  keep)
    GAME_ID="${1:?Usage: play-aptos.sh keep <GAME_ID>}"
    aptos_log "Keeping case for game $GAME_ID (resolver executes with randomness)..."
    aptos_run "$APTOS_PROFILE_RESOLVER" "${QUICKPLAY}::keep_case" \
      "address:${APTOS_MODULE_ADDR}" "u64:${GAME_ID}"
    aptos_ok "Case kept! Game over."
    ;;

  swap)
    GAME_ID="${1:?Usage: play-aptos.sh swap <GAME_ID>}"
    aptos_log "Swapping case for game $GAME_ID (resolver executes with randomness)..."
    aptos_run "$APTOS_PROFILE_RESOLVER" "${QUICKPLAY}::swap_case" \
      "address:${APTOS_MODULE_ADDR}" "u64:${GAME_ID}"
    aptos_ok "Case swapped! Game over."
    ;;

  state)
    GAME_ID="${1:-0}"
    aptos_log "Game $GAME_ID state:"
    parse_game_state "$GAME_ID"
    ;;

  sweeten)
    AMOUNT="${1:-100000000}" # default 1 APT
    aptos_log "Sweetening bank with $AMOUNT octas..."
    aptos_run "$APTOS_PROFILE_DEPLOYER" "${BANK}::sweeten" \
      "address:${APTOS_MODULE_ADDR}" "u64:${AMOUNT}"
    aptos_ok "Bank sweetened!"
    ;;

  fee)
    aptos_log "Current entry fee estimate:"
    aptos move view \
      --function-id "${QUICKPLAY}::estimate_entry_fee" \
      --args "address:${APTOS_MODULE_ADDR}" \
      --url "$APTOS_NODE_URL" 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
r = data['Result'] if 'Result' in data else data
base = int(r[0])
slippage = int(r[1])
print(f'  Base:          {base} octas ({base/1e8:.6f} APT)')
print(f'  With slippage: {slippage} octas ({slippage/1e8:.6f} APT)')
" 2>/dev/null
    ;;

  next-id)
    aptos move view \
      --function-id "${QUICKPLAY}::get_next_game_id" \
      --args "address:${APTOS_MODULE_ADDR}" \
      --url "$APTOS_NODE_URL" 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
r = data['Result'] if 'Result' in data else data
print(f'Next game ID: {r[0]}')
" 2>/dev/null
    ;;

  *)
    echo "Unknown command: $CMD"
    echo "Usage: play-aptos.sh <create|pick|open|accept|reject|keep|swap|state|reveal|banker|sweeten|fee|next-id> [args...]"
    exit 1
    ;;
esac
