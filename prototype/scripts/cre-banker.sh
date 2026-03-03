#!/bin/zsh
# Run CRE AI Banker simulate for a given tx hash
# Usage: ./scripts/cre-banker.sh <TX_HASH> [EVENT_INDEX]
#
# Pass the TX hash from the CRE reveal (which contains RoundComplete).
# RoundComplete is typically at log index 1 in the reveal tx
# (log 0 = CaseRevealed, log 1 = RoundComplete, log 2 = forwarder).
#
# Gemini API key: read from workflows/.env (GEMINI_API_KEY=...) and injected
# into config.staging.json for the run, then removed after.
# The CRE WASM sandbox can't read env vars, so the key must be in the config.
set -e
SCRIPT_DIR="${0:a:h}"
source "$SCRIPT_DIR/env.sh"

TX_HASH="${1:?Usage: cre-banker.sh <TX_HASH of CRE reveal tx> [EVENT_INDEX]}"
EVENT_INDEX="${2:-1}"

WORKFLOWS_DIR="$SCRIPT_DIR/../workflows"
CONFIG="$WORKFLOWS_DIR/banker-ai/config.staging.json"

# Inject Gemini key from workflows/.env into config (removed after run)
INJECTED=0
if [[ -f "$WORKFLOWS_DIR/.env" ]]; then
  GEMINI_KEY=$(grep GEMINI_API_KEY "$WORKFLOWS_DIR/.env" | cut -d= -f2)
  if [[ -n "$GEMINI_KEY" ]]; then
    # Save original, inject key
    cp "$CONFIG" "$CONFIG.bak"
    python3 -c "
import json
with open('$CONFIG') as f: cfg = json.load(f)
cfg['geminiApiKey'] = '$GEMINI_KEY'
with open('$CONFIG', 'w') as f: json.dump(cfg, f, indent=2)
"
    INJECTED=1
    echo "Gemini API key: injected from workflows/.env"
  fi
fi

cleanup() {
  if [[ $INJECTED -eq 1 && -f "$CONFIG.bak" ]]; then
    mv "$CONFIG.bak" "$CONFIG"
  fi
}
trap cleanup EXIT

echo "Running CRE AI Banker..."
echo "  TX:    $TX_HASH"
echo "  Event: log index $EVENT_INDEX (RoundComplete)"

cd "$WORKFLOWS_DIR"
cre workflow simulate ./banker-ai \
  --evm-tx-hash "$TX_HASH" \
  --evm-event-index "$EVENT_INDEX" \
  -T staging-settings \
  --broadcast \
  --non-interactive \
  --trigger-index 0
