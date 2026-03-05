#!/usr/bin/env bash
# Run CRE confidential-reveal simulate for a given tx hash
# Usage: ./scripts/cre-reveal.sh <TX_HASH>
#
# The CaseOpenRequested event is typically at log index 0 in the openCase tx.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

TX_HASH="${1:?Usage: cre-reveal.sh <TX_HASH of openCase tx>}"
EVENT_INDEX="${2:-0}"

echo "Running CRE confidential-reveal..."
echo "  TX:    $TX_HASH"
echo "  Event: log index $EVENT_INDEX"

cd "$SCRIPT_DIR/../workflows"
cre workflow simulate ./confidential-reveal \
  --evm-tx-hash "$TX_HASH" \
  --evm-event-index "$EVENT_INDEX" \
  -T staging-settings \
  --broadcast \
  --non-interactive \
  --trigger-index 0
