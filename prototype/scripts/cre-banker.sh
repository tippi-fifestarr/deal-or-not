#!/bin/zsh
# Run CRE AI Banker simulate for a given tx hash
# Usage: ./scripts/cre-banker.sh <TX_HASH> [EVENT_INDEX]
#
# Pass the TX hash from the CRE reveal (which contains RoundComplete).
# RoundComplete is typically at log index 1 in the reveal tx
# (log 0 = CaseRevealed, log 1 = RoundComplete, log 2 = forwarder).
set -e
SCRIPT_DIR="${0:a:h}"
source "$SCRIPT_DIR/env.sh"

TX_HASH="${1:?Usage: cre-banker.sh <TX_HASH of CRE reveal tx> [EVENT_INDEX]}"
EVENT_INDEX="${2:-1}"

echo "Running CRE AI Banker..."
echo "  TX:    $TX_HASH"
echo "  Event: log index $EVENT_INDEX (RoundComplete)"

cd "$SCRIPT_DIR/../workflows"
cre workflow simulate ./banker-ai \
  --evm-tx-hash "$TX_HASH" \
  --evm-event-index "$EVENT_INDEX" \
  -T staging-settings \
  --broadcast \
  --non-interactive \
  --trigger-index 0
