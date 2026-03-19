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
#   1. Agent orchestrator calls the agent's API endpoint for decisions
#   2. Confidential-reveal decrypts case values (targeting AGENTS contract)
#   3. Banker-AI calls Gemini for offer + personality message (targeting AGENTS contract)
#   4. Agent orchestrator calls agent API again for deal/no-deal
#
# Key difference from cre-simulate.sh:
#   The reveal and banker workflows normally target GAME_CONTRACT (QuickPlay).
#   This script generates configs that point them at AGENTS_CONTRACT instead.
#
# Prerequisites:
#   - CRE CLI installed (cre workflow simulate)
#   - env.sh configured with DEPLOYER_KEY, RPC_URL
#   - Agent registered in AgentRegistry with endpoint
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../script/env.sh"

: "${AGENTS_CONTRACT:?Set AGENTS_CONTRACT in env.sh}"
: "${AGENT_REGISTRY:?Set AGENT_REGISTRY in env.sh}"
: "${DEPLOYER_KEY:=${PRIVATE_KEY:?Set PRIVATE_KEY or DEPLOYER_KEY}}"

WORKFLOWS="$SCRIPT_DIR/../workflows"
CHAIN_SELECTOR="ethereum-testnet-sepolia-base-1"

PHASE_NAMES=("WaitingForVRF" "Created" "Round" "WaitingForCRE" "AwaitingOffer" "BankerOffer" "FinalRound" "WaitingFinalCRE" "GameOver")

CMD="${1:?Usage: agent-support.sh <create|run|state> [args...]}"
shift

# ── Config generation (targets AGENTS_CONTRACT, not GAME_CONTRACT) ──

generate_agent_configs() {
  local deployer_addr
  deployer_addr=$(cast wallet address --private-key "$DEPLOYER_KEY")
  python3 -c "
import json, os
A = '$AGENTS_CONTRACT'
R = '$AGENT_REGISTRY'
C = '$CHAIN_SELECTOR'
GEMINI = os.environ.get('GEMINI_API_KEY_ALL', '')
BOB = os.environ.get('BEST_OF_BANKER', '')
OWNER = '$deployer_addr'

configs = {
    'confidential-reveal/config.staging.json': {
        'contractAddress': A, 'chainSelectorName': C, 'gasLimit': '300000',
        'agentMode': True,
    },
    'banker-ai/config.staging.json': {
        'contractAddress': A, 'chainSelectorName': C, 'gasLimit': '500000',
        'geminiModel': 'gemini-2.5-flash', 'agentMode': True,
        **(({'geminiApiKey': GEMINI}) if GEMINI else {}),
    },
    'agent-gameplay-orchestrator/config.staging.json': {
        'contractAddress': A,
        'agentRegistryAddress': R,
        'chainSelectorName': C, 'gasLimit': '500000',
        'owner': OWNER,
    },
}

for path, data in configs.items():
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
"
}

cleanup() {
  rm -f "$WORKFLOWS/confidential-reveal/config.staging.json" \
       "$WORKFLOWS/banker-ai/config.staging.json" \
       "$WORKFLOWS/agent-gameplay-orchestrator/config.staging.json"
  # Always restore CRE forwarder on exit (in case we swapped it for FinalRound)
  cast send "$AGENTS_CONTRACT" "setCREForwarder(address)" 0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5 \
    --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" --json > /dev/null 2>&1 || true
}

trap cleanup EXIT

# ── Helpers ──

get_game_state() {
  cast call "$AGENTS_CONTRACT" \
    "getGameState(uint256)(address,uint256,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])" \
    "$1" --rpc-url "$RPC_URL" 2>/dev/null
}

get_phase() {
  local raw
  raw=$(get_game_state "$1")
  readarray -t fields <<< "$raw"
  echo "${fields[2]}"
}

run_orchestrator() {
  local tx=$1 idx=${2:-0}
  echo "  [orchestrator] tx=$tx idx=$idx" >&2
  cd "$WORKFLOWS"
  local result
  result=$(cre workflow simulate ./agent-gameplay-orchestrator \
    --evm-tx-hash "$tx" --evm-event-index "$idx" \
    -T staging-settings --broadcast --non-interactive --trigger-index 0 2>&1)
  echo "$result" | grep "USER LOG" >&2
  # Extract the action TX hash from "Agent action executed: ... tx=0x..."
  local action_tx
  action_tx=$(echo "$result" | grep "Agent action executed" | grep -oP 'tx=0x[a-f0-9]+' | cut -d= -f2)
  if [ -z "$action_tx" ]; then
    # Fallback: any tx= in the output
    action_tx=$(echo "$result" | grep -oP 'tx=0x[a-f0-9]+' | tail -1 | cut -d= -f2)
  fi
  echo "$action_tx"
}

run_reveal() {
  local tx=$1 idx=${2:-0}
  echo "  [reveal] tx=$tx idx=$idx" >&2
  cd "$WORKFLOWS"
  local result
  result=$(cre workflow simulate ./confidential-reveal \
    --evm-tx-hash "$tx" --evm-event-index "$idx" \
    -T staging-settings --broadcast --non-interactive --trigger-index 0 2>&1)
  echo "$result" | grep "USER LOG" >&2
  local reveal_tx
  reveal_tx=$(echo "$result" | grep "Fulfilled" | grep -oP 'tx=0x[a-f0-9]+' | cut -d= -f2)
  if [ -z "$reveal_tx" ]; then
    reveal_tx=$(echo "$result" | grep -oP 'tx=0x[a-f0-9]+' | tail -1 | cut -d= -f2)
  fi
  echo "$reveal_tx"
}

run_banker() {
  local tx=$1 idx=${2:-1}
  echo "  [banker] tx=$tx idx=$idx" >&2
  cd "$WORKFLOWS"
  local result
  result=$(cre workflow simulate ./banker-ai \
    --evm-tx-hash "$tx" --evm-event-index "$idx" \
    -T staging-settings --broadcast --non-interactive --trigger-index 0 2>&1)
  echo "$result" | grep "USER LOG" >&2
  local banker_tx
  banker_tx=$(echo "$result" | grep "AI Banker offer" | grep -oP 'tx=0x[a-f0-9]+' | cut -d= -f2)
  if [ -z "$banker_tx" ]; then
    banker_tx=$(echo "$result" | grep -oP 'tx=0x[a-f0-9]+' | tail -1 | cut -d= -f2)
  fi
  echo "$banker_tx"
}

find_event_tx() {
  local topic0="$1" from_block=$2 search_blocks=${3:-60} game_id=${4:-}
  local to_block=$((from_block + search_blocks))

  local topic1_arg=""
  if [ -n "$game_id" ]; then
    topic1_arg=$(printf "0x%064x" "$game_id")
  fi

  local window_end=$to_block
  while [[ $window_end -ge $from_block ]]; do
    local window_from=$((window_end - 9))
    [[ $window_from -lt $from_block ]] && window_from=$from_block

    local result
    if [ -n "$topic1_arg" ]; then
      result=$(cast logs --from-block "$window_from" --to-block "$window_end" \
        --address "$AGENTS_CONTRACT" --json "$topic0" "$topic1_arg" \
        --rpc-url "$RPC_URL" 2>/dev/null) || { window_end=$((window_end - 10)); continue; }
    else
      result=$(cast logs --from-block "$window_from" --to-block "$window_end" \
        --address "$AGENTS_CONTRACT" --json "$topic0" \
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
    echo "Estimating entry fee..."
    FEE=$(cast call "$AGENTS_CONTRACT" "estimateEntryFee()(uint256,uint256)" --rpc-url "$RPC_URL" | tail -1 | awk '{print $1}')
    echo "Entry fee (with slippage): $FEE wei"
    echo ""
    echo "Creating agent game for $DEPLOYER_ADDR..."
    TX=$(cast send "$AGENTS_CONTRACT" "createAgentGame(address)" "$DEPLOYER_ADDR" \
      --value "$FEE" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" --json 2>/dev/null | \
      python3 -c "import json,sys;print(json.load(sys.stdin)['transactionHash'])")
    CREATE_BLOCK=$(cast receipt "$TX" --rpc-url "$RPC_URL" --json 2>/dev/null | \
      python3 -c "import json,sys;print(int(json.load(sys.stdin)['blockNumber'],16))")

    sleep 2
    NEXT=$(cast call "$AGENTS_CONTRACT" "nextGameId()(uint256)" --rpc-url "$RPC_URL")
    GID=$((NEXT - 1))
    echo "Game $GID created (block $CREATE_BLOCK)"
    echo ""
    echo "Waiting for VRF fulfillment..."
    sleep 10

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

    # Read agent endpoint for direct API calls (used in FinalRound)
    DEPLOYER_ADDR=$(cast wallet address --private-key "$DEPLOYER_KEY")
    AGENT_ENDPOINT=$(cast call "$AGENT_REGISTRY" "getAgentEndpoint(address)(string)" "$DEPLOYER_ADDR" --rpc-url "$RPC_URL" 2>/dev/null || echo "")

    # Generate configs targeting AGENTS_CONTRACT
    cd "$WORKFLOWS"
    generate_agent_configs
    echo "Generated CRE configs (targeting AGENTS_CONTRACT)"
    echo ""

    # Find VRFSeedReceived TX
    VRF_TOPIC=$(cast keccak "VRFSeedReceived(uint256,uint256)")
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

    # Main game loop
    for ROUND in $(seq 0 $((MAX_ROUNDS - 1))); do
      sleep 3
      PHASE=$(get_phase "$GID")
      echo "--- ROUND $ROUND (phase=${PHASE_NAMES[$PHASE]}) ---"

      if [ "$PHASE" = "8" ]; then echo "Game over!"; break; fi

      # Phase 2 (Round): Agent opens a case
      if [ "$PHASE" = "2" ]; then
        echo "Agent opening case..."
        OPEN_TX=$(run_orchestrator "$LAST_TX" 0)
        if [ -z "$OPEN_TX" ]; then echo "ERROR: Open failed"; exit 1; fi
        LAST_TX="$OPEN_TX"
        echo ""
        sleep 3
        PHASE=$(get_phase "$GID")
      fi

      # Phase 3 (WaitingForCRE): Reveal case value
      if [ "$PHASE" = "3" ]; then
        echo "Revealing case value..."
        REVEAL_TX=$(run_reveal "$LAST_TX" 0)
        if [ -z "$REVEAL_TX" ]; then echo "ERROR: Reveal failed"; exit 1; fi
        LAST_TX="$REVEAL_TX"
        echo ""
        sleep 3
        PHASE=$(get_phase "$GID")
      fi

      # Phase 4 (AwaitingOffer): Banker makes offer
      if [ "$PHASE" = "4" ]; then
        echo "Banker making offer..."
        BANKER_TX=$(run_banker "$LAST_TX" 1)
        if [ -z "$BANKER_TX" ]; then echo "ERROR: Banker failed"; exit 1; fi
        LAST_TX="$BANKER_TX"
        echo ""
        sleep 3
        PHASE=$(get_phase "$GID")
      fi

      # Phase 5 (BankerOffer): Agent responds deal/no-deal
      if [ "$PHASE" = "5" ]; then
        echo "Agent responding to offer..."
        DEAL_TX=$(run_orchestrator "$LAST_TX" 0)
        if [ -z "$DEAL_TX" ]; then echo "ERROR: Deal response failed"; exit 1; fi
        LAST_TX="$DEAL_TX"
        echo ""
        sleep 3
        PHASE=$(get_phase "$GID")
      fi

      # Phase 6 (FinalRound): Agent decides keep/swap
      # The orchestrator can't trigger on RoundComplete, so we call the agent API
      # directly and submit the action via cast.
      if [ "$PHASE" = "6" ]; then
        echo "Final round: querying agent for keep/swap..."
        # Ask agent API directly
        DECISION=$(curl -s -X POST "$AGENT_ENDPOINT" \
          -H "Content-Type: application/json" \
          -d "{\"gameId\":\"$GID\",\"phase\":\"FinalRound\",\"gameState\":{\"playerCase\":0,\"currentRound\":3,\"bankerOffer\":0,\"caseValues\":[],\"opened\":[],\"remainingValues\":[]},\"expectedValue\":0}" 2>/dev/null \
          | python3 -c "import json,sys; print(json.load(sys.stdin).get('action','keep'))" 2>/dev/null || echo "keep")
        echo "  Agent chose: $DECISION" >&2
        # agentKeepCase/agentSwapCase require CRE forwarder.
        # Temporarily set forwarder to deployer, call, then restore.
        DEPLOYER_ADDR=$(cast wallet address --private-key "$DEPLOYER_KEY")
        echo "  Setting CRE forwarder to deployer for direct call..."
        cast send "$AGENTS_CONTRACT" "setCREForwarder(address)" "$DEPLOYER_ADDR" \
          --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" --json > /dev/null 2>&1
        sleep 3
        if [ "$DECISION" = "swap" ]; then
          echo "  Submitting agentSwapCase..."
          FINAL_TX_HASH=$(cast send "$AGENTS_CONTRACT" "agentSwapCase(uint256)" "$GID" \
            --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" --json 2>/dev/null | \
            python3 -c "import json,sys;print(json.load(sys.stdin)['transactionHash'])")
        else
          echo "  Submitting agentKeepCase..."
          FINAL_TX_HASH=$(cast send "$AGENTS_CONTRACT" "agentKeepCase(uint256)" "$GID" \
            --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" --json 2>/dev/null | \
            python3 -c "import json,sys;print(json.load(sys.stdin)['transactionHash'])")
        fi
        if [ -n "$FINAL_TX_HASH" ]; then LAST_TX="$FINAL_TX_HASH"; fi
        sleep 3
        # Restore CRE forwarder BEFORE final reveal (reveal needs real forwarder)
        echo "  Restoring CRE forwarder..."
        cast send "$AGENTS_CONTRACT" "setCREForwarder(address)" 0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5 \
          --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" --json > /dev/null 2>&1
        echo ""
        sleep 3
        PHASE=$(get_phase "$GID")
      fi

      # Phase 7 (WaitingFinalCRE): Reveal final case
      if [ "$PHASE" = "7" ]; then
        echo "Revealing final case..."
        FINAL_REVEAL_TX=$(run_reveal "$LAST_TX" 1)
        if [ -n "$FINAL_REVEAL_TX" ]; then LAST_TX="$FINAL_REVEAL_TX"; fi
        echo ""
        sleep 3
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
    echo "=== Agent Game $GID ==="
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
