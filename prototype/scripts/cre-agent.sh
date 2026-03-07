#!/usr/bin/env bash
# Run CRE agent-gameplay-orchestrator simulate for a given tx hash
# Usage: ./scripts/cre-agent.sh <TX_HASH> [EVENT_INDEX]
#
# Events from DealOrNotAgents that trigger agent actions:
#   VRFSeedReceived  → agent picks a case
#   CasePicked       → agent opens a case (after reveal+round completes)
#   BankerOfferMade  → agent decides deal/no-deal
#   GameResolved     → log result (no action)
#
# The event index is 0-based within the tx logs. Usually 0 for our events.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

TX_HASH="${1:?Usage: cre-agent.sh <TX_HASH> [EVENT_INDEX]}"
EVENT_INDEX="${2:-0}"

echo "Running CRE agent-gameplay-orchestrator..."
echo "  TX:    $TX_HASH"
echo "  Event: log index $EVENT_INDEX"

cd "$SCRIPT_DIR/../workflows"
cre workflow simulate ./agent-gameplay-orchestrator \
  --evm-tx-hash "$TX_HASH" \
  --evm-event-index "$EVENT_INDEX" \
  -T staging-settings \
  --non-interactive \
  --trigger-index 0
