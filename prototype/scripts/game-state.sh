#!/bin/zsh
# Show game state in human-readable format
# Usage: ./scripts/game-state.sh [GAME_ID]
set -e
SCRIPT_DIR="${0:a:h}"
source "$SCRIPT_DIR/env.sh"

GAME_ID="${1:-0}"

RAW=$(cast call "$CONTRACT" "getGameState(uint256)(address,address,uint8,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])" "$GAME_ID" --rpc-url "$RPC_URL")

# Parse by splitting on newlines
PHASES=("WaitingForVRF" "Created" "Round" "WaitingForCRE" "AwaitingOffer" "BankerOffer" "FinalRound" "WaitingForFinalCRE" "GameOver")
FIELDS=("${(@f)RAW}")

PHASE_NUM="${FIELDS[4]}"
PHASE_NAME="${PHASES[$((PHASE_NUM + 1))]}"

echo "═══════════════════════════════════════"
echo "  Game #$GAME_ID"
echo "═══════════════════════════════════════"
echo "  Phase:        $PHASE_NAME ($PHASE_NUM)"
echo "  Host:         ${FIELDS[1]}"
echo "  Player:       ${FIELDS[2]}"
echo "  Player Case:  #${FIELDS[5]}"
echo "  Round:        ${FIELDS[6]}"
echo "  Collapsed:    ${FIELDS[7]}"
echo "  Banker Offer: ${FIELDS[8]} cents"
echo "  Final Payout: ${FIELDS[9]} cents"
echo "═══════════════════════════════════════"
