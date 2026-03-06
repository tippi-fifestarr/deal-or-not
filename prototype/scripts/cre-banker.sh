#!/usr/bin/env bash
# Run CRE AI Banker simulate for a given tx hash
# Usage: ./scripts/cre-banker.sh <TX_HASH> [EVENT_INDEX]
#
# Pass the TX hash from the CRE reveal (which contains RoundComplete).
# RoundComplete is typically at log index 1 in the reveal tx
# (log 0 = CaseRevealed, log 1 = RoundComplete, log 2 = forwarder).
#
# Gemini API key: In production, injected via Vault DON secrets (Confidential HTTP).
# In simulate mode, the {{.geminiApiKey}} template isn't resolved, so this script
# temporarily injects the key from GEMINI_API_KEY_ALL env var into config.staging.json.
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

# Inject Gemini API key into config for simulate mode, restore on exit
CONFIG="banker-ai/config.staging.json"
BACKUP=""
if [[ -n "$GEMINI_API_KEY_ALL" ]]; then
  BACKUP=$(cat "$CONFIG")
  python3 -c "
import json
with open('$CONFIG') as f:
    c = json.load(f)
c['geminiApiKey'] = '${GEMINI_API_KEY_ALL}'
with open('$CONFIG', 'w') as f:
    json.dump(c, f, indent=2)
"
  trap 'echo "$BACKUP" > "$CONFIG"' EXIT
  echo "  Config: Gemini API key injected (will restore on exit)"
else
  echo "  WARNING: No GEMINI_API_KEY_ALL — Gemini will use fallback message"
fi

cre workflow simulate ./banker-ai \
  --evm-tx-hash "$TX_HASH" \
  --evm-event-index "$EVENT_INDEX" \
  -T staging-settings \
  --broadcast \
  --non-interactive \
  --trigger-index 0
