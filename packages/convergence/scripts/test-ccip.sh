#!/usr/bin/env bash
# CCIP diagnostics — check Bridge/Gateway wiring and cross-chain status
# Usage: ./scripts/test-ccip.sh [command]
#
# Commands:
#   (none)         Run all diagnostics
#   wiring         Check Bridge ↔ Gateway ↔ Game contract wiring
#   cost <GID>     Estimate cross-chain entry cost for a game
#   status <GID>   Check if a game has a cross-chain player joined
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../script/env.sh"

: "${BRIDGE_CONTRACT:?Set BRIDGE_CONTRACT in env.sh}"
: "${GATEWAY_CONTRACT:?Set GATEWAY_CONTRACT in env.sh}"
: "${GAME_CONTRACT:?Set GAME_CONTRACT in env.sh}"

CMD="${1:-all}"

# Strip cast's scientific notation suffix
strip() { echo "$1" | awk '{print $1}'; }

ETH_SEPOLIA_RPC="${ETH_SEPOLIA_RPC:-https://ethereum-sepolia-rpc.publicnode.com}"

# CCIP chain selectors
SELECTOR_ETH_SEPOLIA=16015286601757825753
SELECTOR_BASE_SEPOLIA=10344971235874465080

# ── Colors ──
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'
ok() { echo -e "  ${GREEN}OK${NC} $1"; }
no() { echo -e "  ${RED}NO${NC} $1"; }

run_wiring() {
  echo "=== CCIP Contract Wiring ==="
  echo ""
  echo "Bridge (Base Sepolia): $BRIDGE_CONTRACT"
  echo "Gateway (ETH Sepolia): $GATEWAY_CONTRACT"
  echo "Game (Base Sepolia):   $GAME_CONTRACT"
  echo ""

  # Bridge → Game
  BRIDGE_GAME=$(cast call "$BRIDGE_CONTRACT" "gameContract()(address)" --rpc-url "$RPC_URL" 2>&1) || BRIDGE_GAME=""
  if [[ "${BRIDGE_GAME,,}" == "${GAME_CONTRACT,,}" ]]; then
    ok "Bridge → Game: $BRIDGE_GAME"
  else
    no "Bridge → Game: expected $GAME_CONTRACT, got $BRIDGE_GAME"
  fi

  # Bridge → Gateway (via allowed sender for ETH Sepolia selector)
  BRIDGE_GW=$(cast call "$BRIDGE_CONTRACT" "gateways(uint64)(address)" "$SELECTOR_ETH_SEPOLIA" --rpc-url "$RPC_URL" 2>&1) || BRIDGE_GW=""
  if [[ "${BRIDGE_GW,,}" == "${GATEWAY_CONTRACT,,}" ]]; then
    ok "Bridge → Gateway (ETH Sepolia): $BRIDGE_GW"
  else
    no "Bridge → Gateway: expected $GATEWAY_CONTRACT, got $BRIDGE_GW"
  fi

  # Gateway → Bridge
  GW_BRIDGE=$(cast call "$GATEWAY_CONTRACT" "homeBridge()(address)" --rpc-url "$ETH_SEPOLIA_RPC" 2>&1) || GW_BRIDGE=""
  if [[ "${GW_BRIDGE,,}" == "${BRIDGE_CONTRACT,,}" ]]; then
    ok "Gateway → Bridge: $GW_BRIDGE"
  else
    no "Gateway → Bridge: expected $BRIDGE_CONTRACT, got $GW_BRIDGE"
  fi

  # Game → Bridge (ccipBridge authorization)
  GAME_BRIDGE=$(cast call "$GAME_CONTRACT" "ccipBridge()(address)" --rpc-url "$RPC_URL" 2>&1) || GAME_BRIDGE=""
  if [[ "${GAME_BRIDGE,,}" == "${BRIDGE_CONTRACT,,}" ]]; then
    ok "Game → Bridge (authorized): $GAME_BRIDGE"
  else
    no "Game → Bridge: expected $BRIDGE_CONTRACT, got $GAME_BRIDGE"
    echo "    Fix: cast send $GAME_CONTRACT 'setCCIPBridge(address)' $BRIDGE_CONTRACT --private-key \$DEPLOYER_KEY --rpc-url \$RPC_URL"
  fi

  # Gateway balance (needs ETH for CCIP fees)
  GW_BALANCE=$(cast balance "$GATEWAY_CONTRACT" --rpc-url "$ETH_SEPOLIA_RPC" 2>&1) || GW_BALANCE="0"
  echo ""
  echo "Gateway ETH balance (ETH Sepolia): $GW_BALANCE wei"
  if [[ "$GW_BALANCE" == "0" ]]; then
    echo "  WARNING: Gateway has no ETH. Cross-chain joins will fail."
    echo "  Fund it: cast send $GATEWAY_CONTRACT --value 0.01ether --private-key \$DEPLOYER_KEY --rpc-url $ETH_SEPOLIA_RPC"
  fi
}

run_cost() {
  local GID="${1:?Usage: test-ccip.sh cost <GAME_ID>}"
  echo "=== Cross-Chain Entry Cost for Game #$GID ==="
  echo ""
  COST=$(cast call "$GATEWAY_CONTRACT" "estimateCost(uint256)(uint256,uint256,uint256)" "$GID" --rpc-url "$ETH_SEPOLIA_RPC" 2>&1) || {
    echo "ERROR: estimateCost() failed: $COST"
    echo "  Make sure game $GID exists and is in a joinable phase."
    return 1
  }
  ENTRY_FEE=$(strip "$(echo "$COST" | sed -n '1p')")
  CCIP_FEE=$(strip "$(echo "$COST" | sed -n '2p')")
  TOTAL=$(strip "$(echo "$COST" | sed -n '3p')")
  echo "Entry fee:  $ENTRY_FEE wei ($(python3 -c "print(f'{int(\"$ENTRY_FEE\") / 1e18:.8f}')" 2>/dev/null) ETH)"
  echo "CCIP fee:   $CCIP_FEE wei ($(python3 -c "print(f'{int(\"$CCIP_FEE\") / 1e18:.8f}')" 2>/dev/null) ETH)"
  echo "Total:      $TOTAL wei ($(python3 -c "print(f'{int(\"$TOTAL\") / 1e18:.8f}')" 2>/dev/null) ETH)"
}

run_status() {
  local GID="${1:?Usage: test-ccip.sh status <GAME_ID>}"
  echo "=== CCIP Join Status for Game #$GID ==="
  echo ""
  STATE=$(cast call "$GAME_CONTRACT" \
    "getGameState(uint256)(address,address,uint8,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])" \
    "$GID" --rpc-url "$RPC_URL" 2>&1) || {
    echo "ERROR: Could not read game state: $STATE"
    return 1
  }
  HOST=$(echo "$STATE" | sed -n '1p' | tr -d ' ')
  PLAYER=$(echo "$STATE" | sed -n '2p' | tr -d ' ')
  PHASE=$(echo "$STATE" | sed -n '4p' | tr -d ' ')
  echo "Host:   $HOST"
  echo "Player: $PLAYER"
  echo "Phase:  $PHASE (${PHASE_NAMES[$PHASE]:-Unknown})"
  echo ""
  if [[ "$PLAYER" == "0x0000000000000000000000000000000000000000" ]]; then
    echo "Status: NO PLAYER — CCIP message may still be in transit"
    echo "  Check CCIP Explorer: https://ccip.chain.link"
  else
    echo "Status: PLAYER JOINED"
    if [[ "$HOST" != "$PLAYER" ]]; then
      echo "  Cross-chain player detected (host != player)"
    fi
  fi
}

case "$CMD" in
  wiring)  run_wiring ;;
  cost)    run_cost "${2:?Usage: test-ccip.sh cost <GAME_ID>}" ;;
  status)  run_status "${2:?Usage: test-ccip.sh status <GAME_ID>}" ;;
  all)
    run_wiring
    echo ""
    # Show cost estimate for latest game if any
    LATEST=$(cast call "$GAME_CONTRACT" "nextGameId()(uint256)" --rpc-url "$RPC_URL" 2>/dev/null | awk '{print $1}' || echo "0")
    if [[ "$LATEST" != "0" ]]; then
      LAST_GID=$((LATEST - 1))
      echo ""
      run_cost "$LAST_GID" 2>/dev/null || true
      echo ""
      run_status "$LAST_GID"
    fi
    ;;
  *)
    echo "Unknown command: $CMD"
    echo "Usage: test-ccip.sh [wiring|cost <GID>|status <GID>|all]"
    exit 1
    ;;
esac
