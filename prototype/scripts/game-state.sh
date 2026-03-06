#!/usr/bin/env bash
# Show game state in human-readable format
# Usage: ./scripts/game-state.sh [GAME_ID]
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

GAME_ID="${1:-0}"

RAW=$(cast call "$CONTRACT" "getGameState(uint256)(address,address,uint8,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])" "$GAME_ID" --rpc-url "$RPC_URL")

# Parse by splitting on newlines
PHASES=("WaitingForVRF" "Created" "Round" "WaitingForCRE" "AwaitingOffer" "BankerOffer" "FinalRound" "WaitingFinalCRE" "GameOver")
readarray -t FIELDS <<< "$RAW"

PHASE_NUM="${FIELDS[3]}"
PHASE_NAME="${PHASES[$PHASE_NUM]}"

echo "═══════════════════════════════════════"
echo "  Game #$GAME_ID"
echo "═══════════════════════════════════════"
echo "  Phase:        $PHASE_NAME ($PHASE_NUM)"
echo "  Host:         ${FIELDS[0]}"
echo "  Player:       ${FIELDS[1]}"
echo "  Player Case:  #${FIELDS[4]}"
echo "  Round:        ${FIELDS[5]}"
echo "  Collapsed:    ${FIELDS[6]}"
echo "  Banker Offer: ${FIELDS[7]} cents"
echo "  Final Payout: ${FIELDS[8]} cents"
echo "═══════════════════════════════════════"
