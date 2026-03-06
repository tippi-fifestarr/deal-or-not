#!/usr/bin/env bash
# CRE Support — watches a game and auto-runs CRE workflows
# Usage: ./scripts/cre-support.sh <GAME_ID> [POLL_INTERVAL]
#
# Run this in a terminal while a player uses the browser UI.
# It polls game state and automatically triggers CRE simulates
# when the game enters WaitingCRE / AwaitingOffer / WaitingFinalCRE.
#
# Strategy: track block numbers between polls so event searches
# only scan the narrow window where the event must have occurred.
# This avoids Alchemy free tier rate limits (10-block max per getLogs).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

GAME_ID="${1:?Usage: cre-support.sh <GAME_ID> [POLL_INTERVAL_SECONDS]}"
POLL="${2:-5}"

preflight_check "cre-support"

# Phase constants (bash 0-indexed)
PHASE_NAMES=("WaitingForVRF" "Created" "Round" "WaitingForCRE" "AwaitingOffer" "BankerOffer" "FinalRound" "WaitingFinalCRE" "GameOver")

# Event topics (precomputed)
TOPIC_CASE_OPEN="0xab3b62f6fd63e2b9a116e4f83e0a16b1e4df0ddf7a348ac2407e400fa73a29d8"
TOPIC_ROUND_COMPLETE="0xc9cd1e1a7382c02c47d1955e4ac06db27ff51188b5a155faaafa0088150086a6"

# Track what we've already processed (avoid re-running on same TX)
LAST_REVEAL_OPEN_TX=""
LAST_BANKER_TX=""

# Block tracking — updated each poll cycle
PREV_BLOCK=0

get_phase() {
  local raw
  raw=$(cast call "$CONTRACT" "getGameState(uint256)(address,address,uint8,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])" "$GAME_ID" --rpc-url "$RPC_URL" 2>/dev/null) || { echo "-1"; return; }
  readarray -t fields <<< "$raw"
  echo "${fields[3]}"
}

get_phase_name() {
  local p="$1"
  [[ "$p" -lt 0 || "$p" -gt 8 ]] && { echo "Unknown"; return; }
  echo "${PHASE_NAMES[$p]}"
}

# Find TX hash by searching a specific block range for a topic
# Usage: find_event_in_range <topic> <from_block> <to_block>
# Outputs TX hash or empty string. Always returns 0.
#
# NOTE: uses arithmetic loop instead of `seq` because seq outputs
# scientific notation for large numbers (block numbers > ~10M).
find_event_in_range() {
  local topic="$1" from="$2" to="$3"
  [[ $from -lt 0 ]] && from=0

  # Alchemy free tier: max 10 blocks per eth_getLogs call
  # Scan in 10-block windows, newest first
  local window_end=$to
  while [[ $window_end -ge $from ]]; do
    local window_from=$((window_end - 9))
    [[ $window_from -lt $from ]] && window_from=$from

    local result
    result=$(cast logs \
      --from-block "$window_from" \
      --to-block "$window_end" \
      --address "$CONTRACT" \
      --json \
      "$topic" \
      --rpc-url "$RPC_URL" 2>/dev/null) || { window_end=$((window_end - 10)); continue; }

    local tx
    tx=$(echo "$result" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if d: print(d[-1]['transactionHash'])
" 2>/dev/null)

    if [[ -n "$tx" ]]; then
      echo "$tx"
      return 0
    fi

    window_end=$((window_end - 10))
  done
  echo ""
  return 0
}

# -- Main Loop --

echo "======================================="
echo "  CRE Support -- Game #$GAME_ID"
echo "  Polling every ${POLL}s"
echo "  Press Ctrl+C to stop"
echo "======================================="
echo ""

# Initialize block tracking
PREV_BLOCK=$(cast block-number --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
PREV_PHASE=-1

while true; do
  PHASE=$(get_phase)
  [[ "$PHASE" == "-1" ]] && { sleep "$POLL"; continue; }  # RPC error, retry
  PHASE_NAME=$(get_phase_name "$PHASE")

  # Get current block for event search window
  CUR_BLOCK=$(cast block-number --rpc-url "$RPC_URL" 2>/dev/null || echo "$PREV_BLOCK")

  # Only act on phase change
  if [[ "$PHASE" != "$PREV_PHASE" ]]; then
    echo ""
    echo "--- Phase: $PHASE_NAME ($PHASE) ---"

    # Search window: from PREV_BLOCK to CUR_BLOCK (+ small buffer)
    SEARCH_FROM=$((PREV_BLOCK - 5))
    SEARCH_TO=$CUR_BLOCK

    case "$PHASE" in
      0)
        echo "  Waiting for VRF callback (~10s)..."
        ;;
      1)
        echo "  Game ready! Waiting for player to pick a case in the UI..."
        ;;
      2)
        echo "  Round in progress -- waiting for player to open a case..."
        ;;
      3|7)
        # WaitingForCRE or WaitingFinalCRE — auto-run reveal
        [[ "$PHASE" == "7" ]] && echo "  Final case opened -- running CRE reveal..." || echo "  Case opened -- running CRE reveal..."
        echo "  Searching blocks $SEARCH_FROM -> $SEARCH_TO..."

        OPEN_TX=$(find_event_in_range "$TOPIC_CASE_OPEN" "$SEARCH_FROM" "$SEARCH_TO")
        if [[ -n "$OPEN_TX" && "$OPEN_TX" != "$LAST_REVEAL_OPEN_TX" ]]; then
          LAST_REVEAL_OPEN_TX="$OPEN_TX"
          echo "  Found openCase TX: $OPEN_TX"

          # keepCase/swapCase emit CaseKept/CaseSwapped at log 0, CaseOpenRequested at log 1
          # openCase emits CaseOpenRequested at log 0
          [[ "$PHASE" == "7" ]] && EVENT_IDX=1 || EVENT_IDX=0

          echo ""
          echo "  +-- cre-reveal.sh -----"
          "$SCRIPT_DIR/cre-reveal.sh" "$OPEN_TX" "$EVENT_IDX" 2>&1 | sed 's/^/  | /' || echo "  | reveal failed"
          echo "  +----------------------"

          echo ""
          echo "  +-- cre-jackpot.sh (optional) -----"
          "$SCRIPT_DIR/cre-jackpot.sh" "$OPEN_TX" "$EVENT_IDX" 2>&1 | sed 's/^/  | /' || echo "  | (jackpot skipped -- non-critical)"
          echo "  | No jackpot? Run: cast send \$SPONSOR_JACKPOT \"registerSponsor(string,string)\" \"Name\" \"\" --value 0.01ether"
          echo "  | Then: cast send \$SPONSOR_JACKPOT \"sponsorGame(uint256)\" $GAME_ID"
          echo "  +----------------------------------"
        elif [[ -z "$OPEN_TX" ]]; then
          echo "  WARNING: Could not find CaseOpenRequested TX in blocks $SEARCH_FROM-$SEARCH_TO"
          echo "     Run manually: cre-reveal.sh <TX_HASH>"
          echo "     (Copy TX hash from MetaMask activity tab)"
        else
          echo "  Already processed TX $OPEN_TX"
        fi
        ;;
      4)
        # AwaitingOffer — auto-run banker
        # RoundComplete is emitted by the CRE reveal TX, which could be
        # several blocks after the player's openCase TX. Search wider.
        echo "  Cases revealed -- running AI Banker..."
        echo "  Searching blocks $SEARCH_FROM -> $SEARCH_TO..."

        REVEAL_TX=$(find_event_in_range "$TOPIC_ROUND_COMPLETE" "$SEARCH_FROM" "$SEARCH_TO")
        if [[ -n "$REVEAL_TX" && "$REVEAL_TX" != "$LAST_BANKER_TX" ]]; then
          LAST_BANKER_TX="$REVEAL_TX"
          echo "  Found RoundComplete TX: $REVEAL_TX"

          echo ""
          echo "  +-- cre-banker.sh -----"
          "$SCRIPT_DIR/cre-banker.sh" "$REVEAL_TX" 2>&1 | sed 's/^/  | /' || echo "  | banker failed"
          echo "  +----------------------"
        elif [[ -z "$REVEAL_TX" ]]; then
          echo "  WARNING: Could not find RoundComplete TX in blocks $SEARCH_FROM-$SEARCH_TO"
          echo "     Falling back to manual banker (no Gemini message)..."
          echo ""
          echo "  +-- play-game.sh ring -----"
          "$SCRIPT_DIR/play-game.sh" ring "$GAME_ID" 2>&1 | sed 's/^/  | /' || echo "  | manual banker failed"
          echo "  +--------------------------"
        else
          echo "  Already processed TX $REVEAL_TX"
        fi
        ;;
      5)
        echo "  Banker offer is in! Waiting for player to Deal or NOT..."
        ;;
      6)
        echo "  Final Round -- waiting for player to keep or swap..."
        ;;
      8)
        echo "  GAME OVER!"
        echo ""
        "$SCRIPT_DIR/game-state.sh" "$GAME_ID"
        echo ""
        echo "CRE Support finished."
        exit 0
        ;;
    esac

    PREV_PHASE="$PHASE"
  fi

  # Update block tracking for next iteration
  PREV_BLOCK="$CUR_BLOCK"
  sleep "$POLL"
done
