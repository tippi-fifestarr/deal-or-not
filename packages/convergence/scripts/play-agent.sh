#!/usr/bin/env bash
# Agent game helper — register agents, create agent games, check state
# Usage: ./scripts/play-agent.sh <command> [args...]
#
# Commands:
#   register <NAME> <ENDPOINT> [METADATA]  Register agent in AgentRegistry
#   create   [AGENT_ADDR]                  Create agent game ($0.25 entry)
#   state    <GID>                         Show agent game state
#   info     [ADDR]                        Show agent info for address
#   stake    <AGENT_ID> <AMOUNT>           Stake ETH on agent
#   leaderboard                            Show top agents
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../script/env.sh"

: "${AGENTS_CONTRACT:?Set AGENTS_CONTRACT in env.sh}"
: "${AGENT_REGISTRY:?Set AGENT_REGISTRY in env.sh}"
: "${DEPLOYER_KEY:=${PRIVATE_KEY:?Set PRIVATE_KEY or DEPLOYER_KEY}}"

CMD="${1:?Usage: play-agent.sh <register|create|state|info|stake|leaderboard> [args...]}"
shift

case "$CMD" in
  register)
    NAME="${1:?Usage: play-agent.sh register <NAME> <ENDPOINT> [METADATA]}"
    ENDPOINT="${2:?Usage: play-agent.sh register <NAME> <ENDPOINT> [METADATA]}"
    METADATA="${3:-{}}"
    echo "Registering agent '$NAME' with endpoint $ENDPOINT..."
    RESULT=$(cast send "$AGENT_REGISTRY" "registerAgent(string,string,string)" \
      "$NAME" "$ENDPOINT" "$METADATA" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" --json 2>&1) || { echo "Error: $RESULT"; exit 1; }
    AGENT_ID=$(echo "$RESULT" | python3 -c "
import json,sys
r = json.load(sys.stdin)
for log in r['logs']:
    if log['address'].lower() == '${AGENT_REGISTRY,,}':
        if len(log['topics']) >= 2:
            print(int(log['topics'][1], 16)); break
")
    echo "Agent registered! Agent ID: $AGENT_ID"
    echo "Check: ./scripts/play-agent.sh info"
    ;;

  create)
    AGENT_ADDR="${1:-$DEPLOYER_ADDR}"
    echo "Estimating entry fee..."
    FEE=$(cast call "$AGENTS_CONTRACT" "estimateEntryFee()(uint256,uint256)" --rpc-url "$RPC_URL" | tail -1 | awk '{print $1}')
    echo "Entry fee (with slippage): $FEE wei"
    echo ""
    echo "Creating agent game for $AGENT_ADDR..."
    RESULT=$(cast send "$AGENTS_CONTRACT" "createAgentGame(address)" "$AGENT_ADDR" \
      --value "$FEE" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" --json 2>&1) || { echo "Error: $RESULT"; exit 1; }
    echo "$RESULT" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin), indent=2))" | head -5
    GID=$(echo "$RESULT" | python3 -c "
import json,sys
r = json.load(sys.stdin)
for log in r['logs']:
    if log['address'].lower() == '${AGENTS_CONTRACT,,}':
        if len(log['topics']) >= 2:
            print(int(log['topics'][1], 16)); break
")
    echo ""
    echo "Agent game created! Game ID: $GID"
    echo "Wait ~10s for VRF, then: ./scripts/play-agent.sh state $GID"
    ;;

  state)
    GAME_ID="${1:-0}"
    echo "Agent game $GAME_ID state:"
    echo "(agent, agentId, phase, playerCase, currentRound, totalCollapsed, bankerOffer, finalPayout, ethPerDollar, caseValues[5], opened[5])"
    cast call "$AGENTS_CONTRACT" \
      "getGameState(uint256)(address,uint256,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])" \
      "$GAME_ID" --rpc-url "$RPC_URL"
    ;;

  info)
    ADDR="${1:-$DEPLOYER_ADDR}"
    echo "Agent info for $ADDR:"
    echo ""
    AGENT_ID=$(cast call "$AGENT_REGISTRY" "playerToAgentId(address)(uint256)" "$ADDR" --rpc-url "$RPC_URL")
    echo "Agent ID: $AGENT_ID"
    if [[ "$AGENT_ID" == "0" ]]; then
      echo "No agent registered for this address."
      exit 0
    fi
    echo ""
    echo "Agent record:"
    cast call "$AGENT_REGISTRY" \
      "agents(uint256)(address,string,string,string,uint256,uint256,uint256,uint256,bool,bool)" \
      "$AGENT_ID" --rpc-url "$RPC_URL"
    echo ""
    echo "Eligible: $(cast call "$AGENT_REGISTRY" "isAgentEligible(address)(bool)" "$ADDR" --rpc-url "$RPC_URL")"
    ;;

  stake)
    AGENT_ID="${1:?Usage: play-agent.sh stake <AGENT_ID> <AMOUNT>}"
    AMOUNT="${2:?Usage: play-agent.sh stake <AGENT_ID> <AMOUNT> (e.g. 0.001ether)}"
    echo "Staking $AMOUNT on agent #$AGENT_ID..."
    cast send "$AGENT_STAKING" "stake(uint256)" "$AGENT_ID" \
      --value "$AMOUNT" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL"
    echo "Staked! Check: cast call $AGENT_STAKING 'getStake(address,uint256)(uint256)' $DEPLOYER_ADDR $AGENT_ID --rpc-url $RPC_URL"
    ;;

  leaderboard)
    echo "Top 5 agents:"
    echo ""
    cast call "$AGENT_REGISTRY" "getTopAgents(uint256)(uint256[])" 5 --rpc-url "$RPC_URL"
    echo ""
    echo "Total agents: $(cast call "$AGENT_REGISTRY" "totalAgents()(uint256)" --rpc-url "$RPC_URL")"
    ;;

  *)
    echo "Unknown command: $CMD"
    echo "Usage: play-agent.sh <register|create|state|info|stake|leaderboard> [args...]"
    exit 1
    ;;
esac
