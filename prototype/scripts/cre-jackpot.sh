#!/bin/zsh
# Run CRE sponsor-jackpot simulate for a given tx hash
# Usage: ./scripts/cre-jackpot.sh <TX_HASH> [EVENT_INDEX]
#
# Triggers on the same CaseOpenRequested event as cre-reveal.sh (log index 0).
# This workflow adds a random jackpot amount to the game's SponsorJackpot pool.
#
# Optional — the game works without this. It just means no jackpot accumulates.
set -e
SCRIPT_DIR="${0:a:h}"
source "$SCRIPT_DIR/env.sh"

TX_HASH="${1:?Usage: cre-jackpot.sh <TX_HASH of openCase tx> [EVENT_INDEX]}"
EVENT_INDEX="${2:-0}"

echo "Running CRE sponsor-jackpot..."
echo "  TX:    $TX_HASH"
echo "  Event: log index $EVENT_INDEX (CaseOpenRequested)"

cd "$SCRIPT_DIR/../workflows"
cre workflow simulate ./sponsor-jackpot \
  --evm-tx-hash "$TX_HASH" \
  --evm-event-index "$EVENT_INDEX" \
  -T staging-settings \
  --broadcast \
  --non-interactive \
  --trigger-index 0
