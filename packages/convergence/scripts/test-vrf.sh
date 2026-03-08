#!/usr/bin/env bash
# VRF diagnostics — check VRF coordinator, subscription, and game VRF state
# Usage: ./scripts/test-vrf.sh [command]
#
# Commands:
#   (none)       Run all diagnostics
#   coordinator  Check VRF Coordinator config
#   game <GID>   Check VRF state for a specific game
#   wait <GID>   Wait for VRF callback (poll every 3s, max 30s)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../script/env.sh"

: "${GAME_CONTRACT:?Set GAME_CONTRACT in env.sh}"
: "${VRF_COORDINATOR:?Set VRF_COORDINATOR in env.sh}"

CMD="${1:-all}"

# Strip cast's scientific notation suffix: "14 [1.4e1]" -> "14"
strip() { echo "$1" | awk '{print $1}'; }

# Get total game count (contract uses nextGameId, not gameCount)
get_game_count() {
  local raw
  raw=$(cast call "$GAME_CONTRACT" "nextGameId()(uint256)" --rpc-url "$RPC_URL" 2>/dev/null) || \
  raw=$(cast call "$GAME_CONTRACT" "gameCount()(uint256)" --rpc-url "$RPC_URL" 2>/dev/null) || \
  raw="0"
  strip "$raw"
}

run_coordinator() {
  echo "=== VRF Coordinator ==="
  echo "Address: $VRF_COORDINATOR"
  echo ""
  echo "--- Game contract VRF config ---"
  echo "Game contract: $GAME_CONTRACT"
  echo ""
  LATEST=$(get_game_count)
  echo "Total games created: $LATEST"
}

run_game_vrf() {
  local GID="${1:-0}"
  echo "=== VRF State for Game #$GID ==="
  echo ""
  STATE=$(cast call "$GAME_CONTRACT" \
    "getGameState(uint256)(address,address,uint8,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])" \
    "$GID" --rpc-url "$RPC_URL" 2>&1) || {
    echo "ERROR: Could not read game state: $STATE"
    return 1
  }
  PHASE=$(echo "$STATE" | sed -n '4p' | tr -d ' ')
  PHASE_NAME="${PHASE_NAMES[$PHASE]:-Unknown}"
  echo "Phase: $PHASE ($PHASE_NAME)"
  if [[ "$PHASE" == "0" ]]; then
    echo "Status: WAITING FOR VRF — callback has not arrived yet"
    echo "  VRF typically takes ~10s on Base Sepolia"
    echo "  Try: ./scripts/test-vrf.sh wait $GID"
  elif [[ "$PHASE" -ge "1" ]]; then
    echo "Status: VRF RECEIVED — game is ready"
    ETH_PER_DOLLAR=$(strip "$(echo "$STATE" | sed -n '10p')")
    echo "ethPerDollar (snapshotted at game creation): $ETH_PER_DOLLAR"
    if [[ "$ETH_PER_DOLLAR" != "0" ]]; then
      echo "  = ETH/USD \$$(python3 -c "print(f'{1e26 / int(\"$ETH_PER_DOLLAR\") / 1e8:.2f}')" 2>/dev/null || echo "?")"
    fi
  fi
}

run_wait() {
  local GID="${1:?Usage: test-vrf.sh wait <GAME_ID>}"
  echo "=== Waiting for VRF on Game #$GID ==="
  echo ""
  local MAX=10
  for i in $(seq 1 $MAX); do
    STATE=$(cast call "$GAME_CONTRACT" \
      "getGameState(uint256)(address,address,uint8,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])" \
      "$GID" --rpc-url "$RPC_URL" 2>&1)
    PHASE=$(echo "$STATE" | sed -n '4p' | tr -d ' ')
    if [[ "$PHASE" -ge "1" ]]; then
      echo "VRF received! Phase: $PHASE (${PHASE_NAMES[$PHASE]:-?})"
      echo "  Waited $((i * 3))s"
      return 0
    fi
    echo "  [$i/$MAX] Phase 0 (WaitingForVRF)... waiting 3s"
    sleep 3
  done
  echo "TIMEOUT: VRF not received after $((MAX * 3))s"
  echo "  Check VRF subscription at https://vrf.chain.link"
  return 1
}

case "$CMD" in
  coordinator) run_coordinator ;;
  game)        run_game_vrf "${2:-0}" ;;
  wait)        run_wait "${2:?Usage: test-vrf.sh wait <GAME_ID>}" ;;
  all)
    run_coordinator
    echo ""
    # Show state of most recent game if any exist
    LATEST=$(get_game_count)
    if [[ "$LATEST" != "0" ]]; then
      LAST_GID=$((LATEST - 1))
      echo ""
      run_game_vrf "$LAST_GID"
    fi
    ;;
  *)
    echo "Unknown command: $CMD"
    echo "Usage: test-vrf.sh [coordinator|game <GID>|wait <GID>|all]"
    exit 1
    ;;
esac
