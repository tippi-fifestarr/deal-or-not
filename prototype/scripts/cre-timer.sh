#!/bin/zsh
# Run CRE game-timer simulate (cron trigger — no TX hash needed)
# Usage: ./scripts/cre-timer.sh
#
# Scans the last 5 games and expires any that are older than 10 minutes.
# Also clears jackpots for expired sponsored games.
#
# Optional — only needed to test game expiry. Games work fine without this.
set -e
SCRIPT_DIR="${0:a:h}"
source "$SCRIPT_DIR/env.sh"

echo "Running CRE game-timer (cron trigger)..."

cd "$SCRIPT_DIR/../workflows"
cre workflow simulate ./game-timer \
  -T staging-settings \
  --broadcast \
  --non-interactive \
  --trigger-index 0
