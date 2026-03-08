#!/usr/bin/env bash
# Agent Game Support — creates agent games and auto-runs CRE workflows
# Usage: ./scripts/agent-support.sh <create|run|state> [args...]
#
# Commands:
#   create              Create a new agent game (deployer as agent)
#   run    <GID>        Run full game loop (pick, open, reveal, banker, decision)
#   state  <GID>        Show game state
#
# This script drives agent games through the CRE pipeline:
#   1. Agent orchestrator calls Ryan's Railway server for decisions
#   2. Confidential-reveal decrypts case values
#   3. Banker-AI calls Gemini for offer + personality message
#   4. Agent orchestrator calls Railway server again for deal/no-deal
#
# Prerequisites:
#   - CRE CLI installed (cre workflow simulate)
#   - env.sh configured with DEPLOYER_KEY, RPC_URL
#   - Agent registered in AgentRegistry with Railway endpoint
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

AGENTS="0x4cEdE5dD14dCa8F71a766E3b3eb1fB5801835083"
WF_DIR="$SCRIPT_DIR/../workflows"
REVEAL_DIR="$WF_DIR/confidential-reveal"
BANKER_DIR="$WF_DIR/banker-ai"

PHASE_NAMES=("WaitingForVRF" "Created" "Round" "WaitingForCRE" "AwaitingOffer" "BankerOffer" "FinalRound" "WaitingFinalCRE" "GameOver")

CMD="${1:?Usage: agent-support.sh <create|run|state> [args...]}"
shift

# ── Helpers ──

get_game_state() {
  local gid=$1
  cast call "$AGENTS" "getGameState(uint256)(address,uint256,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])" "$gid" --rpc-url "$RPC_URL" 2>/dev/null
}

get_phase() {
  local raw
  raw=$(get_game_state "$1")
  readarray -t fields <<< "$raw"
  echo "${fields[2]}"
}

swap_config() {
  local dir=$1
  cp "$dir/config.staging.json" "$dir/config.staging.json.bak"
  cp "$dir/config.agents.json" "$dir/config.staging.json"
}

restore_config() {
  local dir=$1
  cp "$dir/config.staging.json.bak" "$dir/config.staging.json"
  rm -f "$dir/config.staging.json.bak"
}

# Run agent orchestrator and extract TX hash
run_orchestrator() {
  local tx=$1 idx=$2
  cd "$WF_DIR"
  local result
  result=$(cre workflow simulate ./agent-gameplay-orchestrator \
    --evm-tx-hash "$tx" --evm-event-index "$idx" \
    -T staging-settings --broadcast --non-interactive --trigger-index 0 2>&1)
  echo "$result" | grep "USER LOG" >&2
  echo "$result" | grep "Agent action executed" | grep -o "tx=0x[a-f0-9]*" | cut -d= -f2
}

# Run confidential-reveal (with agents config swap) and extract TX hash
run_reveal() {
  local tx=$1 idx=$2
  swap_config "$REVEAL_DIR"
  cd "$WF_DIR"
  local result
  result=$(cre workflow simulate ./confidential-reveal \
    --evm-tx-hash "$tx" --evm-event-index "$idx" \
    -T staging-settings --broadcast --non-interactive --trigger-index 0 2>&1)
  restore_config "$REVEAL_DIR"
  echo "$result" | grep "USER LOG" >&2
  echo "$result" | grep "Fulfilled" | grep -o "tx=0x[a-f0-9]*" | cut -d= -f2
}

# Run banker-ai (with agents config swap) and extract TX hash
run_banker() {
  local tx=$1 idx=$2
  swap_config "$BANKER_DIR"
  cd "$WF_DIR"
  local result
  result=$(cre workflow simulate ./banker-ai \
    --evm-tx-hash "$tx" --evm-event-index "$idx" \
    -T staging-settings --broadcast --non-interactive --trigger-index 0 2>&1)
  restore_config "$BANKER_DIR"
  echo "$result" | grep "USER LOG" >&2
  echo "$result" | grep "AI Banker offer" | grep -o "tx=0x[a-f0-9]*" | cut -d= -f2
}

# Find event TX in recent blocks (optional game ID filter via topic1)
find_event_tx() {
  local topic0="$1" from_block=$2 search_blocks=${3:-60} game_id=${4:-}
  local to_block=$((from_block + search_blocks))

  # Build topic args — if game_id provided, pad to 32-byte topic1
  local topic1_arg=""
  if [ -n "$game_id" ]; then
    topic1_arg=$(printf "0x%064x" "$game_id")
  fi

  # Scan in 10-block windows, newest first (matches cre-support.sh pattern)
  local window_end=$to_block
  while [[ $window_end -ge $from_block ]]; do
    local window_from=$((window_end - 9))
    [[ $window_from -lt $from_block ]] && window_from=$from_block

    local result
    if [ -n "$topic1_arg" ]; then
      result=$(cast logs --from-block "$window_from" --to-block "$window_end" \
        --address "$AGENTS" --json "$topic0" "$topic1_arg" \
        --rpc-url "$RPC_URL" 2>/dev/null) || { window_end=$((window_end - 10)); continue; }
    else
      result=$(cast logs --from-block "$window_from" --to-block "$window_end" \
        --address "$AGENTS" --json "$topic0" \
        --rpc-url "$RPC_URL" 2>/dev/null) || { window_end=$((window_end - 10)); continue; }
    fi

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
  return 1
}

# ── Commands ──

case "$CMD" in
  create)
    DEPLOYER_ADDR=$(cast wallet address --private-key "$DEPLOYER_KEY")
    echo "Creating agent game for $DEPLOYER_ADDR..."
    TX=$(cast send "$AGENTS" "createAgentGame(address)" "$DEPLOYER_ADDR" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" --json 2>/dev/null | \
      python3 -c "import json,sys;print(json.load(sys.stdin)['transactionHash'])")
    CREATE_BLOCK=$(cast receipt "$TX" --rpc-url "$RPC_URL" --json 2>/dev/null | \
      python3 -c "import json,sys;print(int(json.load(sys.stdin)['blockNumber'],16))")

    # Read nextGameId AFTER the TX confirms
    sleep 2
    NEXT=$(cast call "$AGENTS" "nextGameId()(uint256)" --rpc-url "$RPC_URL")
    GID=$((NEXT - 1))
    echo "Game $GID created (block $CREATE_BLOCK)"
    echo ""
    echo "Waiting for VRF fulfillment..."
    sleep 6

    PHASE=$(get_phase "$GID")
    if [ "$PHASE" = "1" ]; then
      echo "VRF fulfilled! Game ready."
      echo ""
      echo "Next: ./scripts/agent-support.sh run $GID"
    else
      echo "VRF not yet fulfilled (phase=$PHASE). Wait and check:"
      echo "  ./scripts/agent-support.sh state $GID"
    fi
    ;;

  run)
    GID="${1:?Usage: agent-support.sh run <GAME_ID>}"
    MAX_ROUNDS=4

    PHASE=$(get_phase "$GID")
    echo "========================================="
    echo "  AGENT GAME $GID"
    echo "  Phase: ${PHASE_NAMES[$PHASE]}"
    echo "========================================="
    echo ""

    if [ "$PHASE" != "1" ]; then
      echo "ERROR: Game must be in Created phase (1), got $PHASE"
      exit 1
    fi

    # Find VRFSeedReceived TX
    VRF_TOPIC=$(cast keccak "VRFSeedReceived(uint256)")
    echo "Finding VRFSeedReceived event..."
    CURRENT_BLOCK=$(cast block-number --rpc-url "$RPC_URL")
    VRF_TX=$(find_event_tx "$VRF_TOPIC" $((CURRENT_BLOCK - 100)) 100 "$GID")
    if [ -z "$VRF_TX" ]; then
      echo "ERROR: VRFSeedReceived not found in recent blocks"
      exit 1
    fi
    echo "VRF TX: $VRF_TX"
    echo ""

    # Step 1: Agent picks case
    echo "--- PICK CASE ---"
    PICK_TX=$(run_orchestrator "$VRF_TX" 0)
    if [ -z "$PICK_TX" ]; then echo "ERROR: Pick failed"; exit 1; fi
    echo ""

    LAST_TX="$PICK_TX"

    # Main game loop — poll phase and run the right workflow
    for ROUND in $(seq 0 $((MAX_ROUNDS - 1))); do
      # Wait for chain state to settle
      sleep 2
      PHASE=$(get_phase "$GID")
      echo "--- ROUND $ROUND (phase=${PHASE_NAMES[$PHASE]}) ---"

      if [ "$PHASE" = "8" ]; then echo "Game over!"; break; fi

      # Phase 2 (Round): Agent opens a case via orchestrator
      if [ "$PHASE" = "2" ]; then
        echo "Agent opening case..."
        OPEN_TX=$(run_orchestrator "$LAST_TX" 0)
        if [ -z "$OPEN_TX" ]; then echo "ERROR: Open failed"; exit 1; fi
        LAST_TX="$OPEN_TX"
        echo ""
        sleep 2
        PHASE=$(get_phase "$GID")
      fi

      # Phase 3 (WaitingForCRE): Reveal the opened case value
      if [ "$PHASE" = "3" ]; then
        echo "Revealing case value..."
        REVEAL_TX=$(run_reveal "$LAST_TX" 0)
        if [ -z "$REVEAL_TX" ]; then echo "ERROR: Reveal failed"; exit 1; fi
        LAST_TX="$REVEAL_TX"
        echo ""
        sleep 2
        PHASE=$(get_phase "$GID")
      fi

      # Phase 4 (AwaitingOffer): Banker makes an offer
      if [ "$PHASE" = "4" ]; then
        echo "Banker making offer..."
        BANKER_TX=$(run_banker "$LAST_TX" 1)
        if [ -z "$BANKER_TX" ]; then echo "ERROR: Banker failed"; exit 1; fi
        LAST_TX="$BANKER_TX"
        echo ""
        sleep 2
        PHASE=$(get_phase "$GID")
      fi

      # Phase 5 (BankerOffer): Agent responds deal/no-deal
      if [ "$PHASE" = "5" ]; then
        echo "Agent responding to offer..."
        DEAL_TX=$(run_orchestrator "$LAST_TX" 0)
        if [ -z "$DEAL_TX" ]; then echo "ERROR: Deal response failed"; exit 1; fi
        LAST_TX="$DEAL_TX"
        echo ""
        sleep 2
        PHASE=$(get_phase "$GID")
      fi

      # Phase 6 (FinalRound): Agent decides keep/swap
      if [ "$PHASE" = "6" ]; then
        echo "Final round: agent deciding keep/swap..."
        FINAL_TX=$(run_orchestrator "$LAST_TX" 0)
        if [ -n "$FINAL_TX" ]; then LAST_TX="$FINAL_TX"; fi
        echo ""
        sleep 2
        PHASE=$(get_phase "$GID")
      fi

      # Phase 7 (WaitingFinalCRE): Reveal final case
      if [ "$PHASE" = "7" ]; then
        echo "Revealing final case..."
        FINAL_REVEAL_TX=$(run_reveal "$LAST_TX" 1)
        if [ -n "$FINAL_REVEAL_TX" ]; then LAST_TX="$FINAL_REVEAL_TX"; fi
        echo ""
        sleep 2
        PHASE=$(get_phase "$GID")
      fi

      if [ "$PHASE" = "8" ]; then echo "Game over!"; break; fi
    done

    echo ""
    echo "========================================="
    echo "  GAME $GID FINAL STATE"
    echo "========================================="
    RAW=$(get_game_state "$GID")
    readarray -t fields <<< "$RAW"
    echo "Phase:        ${PHASE_NAMES[${fields[2]}]}"
    echo "Player Case:  ${fields[3]}"
    echo "Rounds:       ${fields[4]}"
    echo "Banker Offer: ${fields[6]} cents"
    echo "Final Payout: ${fields[7]} cents"
    echo "Case Values:  ${fields[9]}"
    echo "Opened:       ${fields[10]}"
    ;;

  state)
    GID="${1:?Usage: agent-support.sh state <GAME_ID>}"
    RAW=$(get_game_state "$GID")
    readarray -t fields <<< "$RAW"
    echo "=== Game $GID ==="
    echo "Agent:        ${fields[0]}"
    echo "Agent ID:     ${fields[1]}"
    echo "Phase:        ${fields[2]} (${PHASE_NAMES[${fields[2]}]})"
    echo "Player Case:  ${fields[3]}"
    echo "Round:        ${fields[4]}"
    echo "Collapsed:    ${fields[5]}"
    echo "Banker Offer: ${fields[6]} cents"
    echo "Final Payout: ${fields[7]} cents"
    echo "ETH/USD:      ${fields[8]}"
    echo "Case Values:  ${fields[9]}"
    echo "Opened:       ${fields[10]}"
    ;;

  *)
    echo "Unknown command: $CMD"
    echo "Usage: agent-support.sh <create|run|state> [args...]"
    exit 1
    ;;
esac
