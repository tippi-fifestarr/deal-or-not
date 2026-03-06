#!/usr/bin/env bash
# Run CRE AI Banker simulate for a given tx hash
# Usage: ./scripts/cre-banker.sh <TX_HASH> [EVENT_INDEX]
#
# Pass the TX hash from the CRE reveal (which contains RoundComplete).
# RoundComplete is typically at log index 1 in the reveal tx
# (log 0 = CaseRevealed, log 1 = RoundComplete, log 2 = forwarder).
#
# Gemini API key: loaded via Vault DON secrets (Confidential HTTP).
# In simulate mode, CRE reads from secrets.yaml -> env var GEMINI_API_KEY_ALL.
# The key is injected inside the enclave — no DON node sees it.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

TX_HASH="${1:?Usage: cre-banker.sh <TX_HASH of CRE reveal tx> [EVENT_INDEX]}"
EVENT_INDEX="${2:-1}"

preflight_check "cre-banker"

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
