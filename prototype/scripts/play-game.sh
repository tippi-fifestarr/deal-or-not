#!/usr/bin/env bash
# Full game flow helper — creates game, picks case, opens cases
# Usage: ./scripts/play-game.sh <command> [args...]
#
# Commands:
#   create              Create a new game
#   pick  <GID> <CASE>  Pick your case (0-4)
#   open  <GID> <CASE>  Open a case -> prints TX for cre-reveal.sh
#   ring  <GID>         Ring the banker (manual setBankerOffer)
#   accept <GID>        Accept the deal
#   reject <GID>        Reject the deal
#   keep  <GID>         Keep your case (final round)
#   swap  <GID>         Swap your case (final round)
#   state <GID>         Show game state
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

CMD="${1:?Usage: play-game.sh <create|pick|open|ring|accept|reject|keep|swap|state> [args...]}"
shift

case "$CMD" in
  create)
    echo "Creating new game..."
    cast send "$CONTRACT" "createGame()" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL"
    NEXT=$(cast call "$CONTRACT" "nextGameId()(uint256)" --rpc-url "$RPC_URL")
    echo ""
    echo "Game created. Next ID: $NEXT (yours is $((NEXT - 1)))"
    echo "Wait ~10s for VRF, then: ./scripts/play-game.sh state $((NEXT - 1))"
    ;;

  pick)
    GAME_ID="${1:?Usage: play-game.sh pick <GAME_ID> <CASE_INDEX>}"
    CASE="${2:?Usage: play-game.sh pick <GAME_ID> <CASE_INDEX>}"
    echo "Picking case #$CASE for game $GAME_ID..."
    cast send "$CONTRACT" "pickCase(uint256,uint8)" "$GAME_ID" "$CASE" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL"
    ;;

  open)
    GAME_ID="${1:?Usage: play-game.sh open <GAME_ID> <CASE_INDEX>}"
    CASE="${2:?Usage: play-game.sh open <GAME_ID> <CASE_INDEX>}"
    echo "Opening case #$CASE for game $GAME_ID..."
    TX=$(cast send "$CONTRACT" "openCase(uint256,uint8)" "$GAME_ID" "$CASE" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" --json | python3 -c "import json,sys;print(json.load(sys.stdin)['transactionHash'])")
    echo ""
    echo "TX: $TX"
    echo ""
    echo "Next steps:"
    echo "  1. CRE reveal:  ./scripts/cre-reveal.sh $TX"
    echo "  2. Check state:  ./scripts/play-game.sh state $GAME_ID"
    echo "  3. If AwaitingOffer, the reveal TX hash has RoundComplete."
    echo "     Get it from the reveal output, then:"
    echo "     ./scripts/cre-banker.sh <REVEAL_TX>"
    ;;

  ring)
    GAME_ID="${1:?Usage: play-game.sh ring <GAME_ID>}"
    echo "Computing banker offer for game $GAME_ID..."
    OFFER=$(cast call "$CONTRACT" "calculateBankerOffer(uint256)(uint256)" "$GAME_ID" --rpc-url "$RPC_URL")
    echo "Computed offer: $OFFER cents"
    echo "Setting offer on-chain..."
    cast send "$CONTRACT" "setBankerOffer(uint256,uint256)" "$GAME_ID" "$OFFER" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL"
    ;;

  accept)
    GAME_ID="${1:?Usage: play-game.sh accept <GAME_ID>}"
    echo "Accepting deal for game $GAME_ID..."
    cast send "$CONTRACT" "acceptDeal(uint256)" "$GAME_ID" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL"
    ;;

  reject)
    GAME_ID="${1:?Usage: play-game.sh reject <GAME_ID>}"
    echo "Rejecting deal for game $GAME_ID..."
    cast send "$CONTRACT" "rejectDeal(uint256)" "$GAME_ID" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL"
    ;;

  keep)
    GAME_ID="${1:?Usage: play-game.sh keep <GAME_ID>}"
    echo "Keeping case for game $GAME_ID..."
    cast send "$CONTRACT" "keepCase(uint256)" "$GAME_ID" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL"
    ;;

  swap)
    GAME_ID="${1:?Usage: play-game.sh swap <GAME_ID>}"
    echo "Swapping case for game $GAME_ID..."
    cast send "$CONTRACT" "swapCase(uint256)" "$GAME_ID" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL"
    ;;

  state)
    GAME_ID="${1:-0}"
    "$SCRIPT_DIR/game-state.sh" "$GAME_ID"
    ;;

  *)
    echo "Unknown command: $CMD"
    echo "Usage: play-game.sh <create|pick|open|ring|accept|reject|keep|swap|state> [args...]"
    exit 1
    ;;
esac
