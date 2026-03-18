#!/usr/bin/env bash
# Deploy Deal-or-Not to Aptos testnet
#
# Prerequisites:
#   1. aptos CLI installed (brew install aptos or cargo install aptos)
#   2. Three profiles created:
#      aptos init --profile deployer --network testnet
#      aptos init --profile resolver --network testnet
#      aptos init --profile player   --network testnet
#   3. Fund all three:
#      aptos account fund-with-faucet --profile deployer --amount 500000000
#      aptos account fund-with-faucet --profile resolver --amount 200000000
#      aptos account fund-with-faucet --profile player   --amount 200000000
#
# Usage: ./scripts/deploy-aptos.sh [--skip-publish]
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env-aptos.sh"

SKIP_PUBLISH=false
[[ "$1" == "--skip-publish" ]] && SKIP_PUBLISH=true

# ── Get deployer address ──
DEPLOYER_ADDR=$(aptos account lookup-address --profile "$APTOS_PROFILE_DEPLOYER" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['Result'])" 2>/dev/null)
RESOLVER_ADDR=$(aptos account lookup-address --profile "$APTOS_PROFILE_RESOLVER" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['Result'])" 2>/dev/null)

if [[ -z "$DEPLOYER_ADDR" ]]; then
  aptos_err "Could not find deployer profile. Run: aptos init --profile deployer --network testnet"
  exit 1
fi

if [[ -z "$RESOLVER_ADDR" ]]; then
  aptos_err "Could not find resolver profile. Run: aptos init --profile resolver --network testnet"
  exit 1
fi

export APTOS_MODULE_ADDR="$DEPLOYER_ADDR"

aptos_log "Deploy configuration:"
echo "  Deployer:  $DEPLOYER_ADDR"
echo "  Resolver:  $RESOLVER_ADDR"
echo "  Network:   $APTOS_NETWORK"
echo "  Node URL:  $APTOS_NODE_URL"
echo ""

# ── Step 1: Publish modules ──
if [[ "$SKIP_PUBLISH" == "false" ]]; then
  aptos_log "Step 1: Publishing Move modules..."
  cd "$APTOS_PROJECT_DIR"
  aptos move publish \
    --named-addresses "deal_or_not=${DEPLOYER_ADDR}" \
    --profile "$APTOS_PROFILE_DEPLOYER" \
    --assume-yes
  aptos_ok "Modules published!"
  echo ""
else
  aptos_log "Step 1: Skipping publish (--skip-publish)"
  echo ""
fi

# ── Step 2: Initialize price feed ──
aptos_log "Step 2: Initializing price feed ($8.50/APT)..."
aptos_run "$APTOS_PROFILE_DEPLOYER" \
  "${APTOS_MODULE_ADDR}::price_feed_helper::initialize" \
  "u64:850000000"
aptos_ok "Price feed initialized!"

# ── Step 3: Initialize bank ──
aptos_log "Step 3: Initializing bank..."
aptos_run "$APTOS_PROFILE_DEPLOYER" \
  "${APTOS_MODULE_ADDR}::bank::initialize" \
  "address:${DEPLOYER_ADDR}"
aptos_ok "Bank initialized!"

# ── Step 4: Sweeten bank ──
aptos_log "Step 4: Sweetening bank with 2 APT..."
aptos_run "$APTOS_PROFILE_DEPLOYER" \
  "${APTOS_MODULE_ADDR}::bank::sweeten" \
  "address:${DEPLOYER_ADDR}" "u64:200000000"
aptos_ok "Bank sweetened!"

# ── Step 5: Initialize quickplay ──
aptos_log "Step 5: Initializing quickplay..."
aptos_run "$APTOS_PROFILE_DEPLOYER" \
  "${APTOS_MODULE_ADDR}::deal_or_not_quickplay::initialize" \
  "address:${RESOLVER_ADDR}" "address:${DEPLOYER_ADDR}" "address:${DEPLOYER_ADDR}"
aptos_ok "QuickPlay initialized!"

# ── Step 6: Initialize agent registry (optional) ──
aptos_log "Step 6: Initializing agent registry..."
aptos_run "$APTOS_PROFILE_DEPLOYER" \
  "${APTOS_MODULE_ADDR}::agent_registry::initialize" || true
aptos_ok "Agent registry initialized (or already exists)!"

# ── Step 7: Initialize best-of-banker (optional) ──
aptos_log "Step 7: Initializing best-of-banker..."
aptos_run "$APTOS_PROFILE_DEPLOYER" \
  "${APTOS_MODULE_ADDR}::best_of_banker::initialize" || true
aptos_ok "Best-of-banker initialized (or already exists)!"

echo ""
aptos_log "═══════════════════════════════════════════"
aptos_ok "Deployment complete!"
aptos_log "═══════════════════════════════════════════"
echo ""
echo "  Module address: $DEPLOYER_ADDR"
echo ""
echo "  To use scripts, export:"
echo "    export APTOS_MODULE_ADDR=$DEPLOYER_ADDR"
echo ""
echo "  Quick test:"
echo "    ./scripts/play-aptos.sh fee"
echo "    ./scripts/play-aptos.sh create"
echo ""
echo "  For the frontend, set in dealornot/.env.local:"
echo "    NEXT_PUBLIC_APTOS_MODULE_ADDRESS=$DEPLOYER_ADDR"
