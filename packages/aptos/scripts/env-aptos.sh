#!/usr/bin/env bash
# Common environment for Aptos Deal-or-Not scripts
# Source this: source packages/aptos/scripts/env-aptos.sh (from repo root)
#   or: source scripts/env-aptos.sh (from packages/aptos/)

# Resolve script directory (bash and zsh compatible)
if [[ -n "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
elif [[ -n "${(%):-%x}" ]] 2>/dev/null; then
  SCRIPT_DIR="$(cd "$(dirname "${(%):-%x}")" && pwd)"
else
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
fi
APTOS_PROJECT_DIR="$SCRIPT_DIR/.."

# ── Aptos Network ──
export APTOS_NODE_URL="${APTOS_NODE_URL:-https://fullnode.testnet.aptoslabs.com/v1}"
export APTOS_NETWORK="testnet"

# ── Aptos Profiles ──
# These correspond to `aptos init --profile <name>` profiles in ~/.aptos/config.yaml
export APTOS_PROFILE_DEPLOYER="${APTOS_PROFILE_DEPLOYER:-deployer}"
export APTOS_PROFILE_RESOLVER="${APTOS_PROFILE_RESOLVER:-resolver}"
export APTOS_PROFILE_PLAYER="${APTOS_PROFILE_PLAYER:-player}"

# ── Module Address ──
# Set after deployment: the address where Move modules are published.
# This is the deployer's account address.
# Override via: export APTOS_MODULE_ADDR=0x... before sourcing this file.
export APTOS_MODULE_ADDR="${APTOS_MODULE_ADDR:-}"

# ── Derived Function IDs ──
# Only set if module address is known
if [[ -n "$APTOS_MODULE_ADDR" ]]; then
  export QUICKPLAY="${APTOS_MODULE_ADDR}::deal_or_not_quickplay"
  export BANK="${APTOS_MODULE_ADDR}::bank"
  export PRICE_FEED="${APTOS_MODULE_ADDR}::price_feed_helper"
  export AGENTS="${APTOS_MODULE_ADDR}::deal_or_not_agents"
  export AGENT_REGISTRY="${APTOS_MODULE_ADDR}::agent_registry"
  export PREDICTION_MARKET="${APTOS_MODULE_ADDR}::prediction_market"
fi

# ── Helpers ──

# Run a view function and return the result
aptos_view() {
  local func_id="$1"
  shift
  local args=""
  for arg in "$@"; do
    args="${args} --args ${arg}"
  done
  aptos move view \
    --function-id "$func_id" \
    $args \
    --url "$APTOS_NODE_URL" \
    2>/dev/null
}

# Run a move function as a specific profile
aptos_run() {
  local profile="$1"
  local func_id="$2"
  shift 2
  local args=""
  for arg in "$@"; do
    args="${args} --args ${arg}"
  done
  aptos move run \
    --function-id "$func_id" \
    $args \
    --profile "$profile" \
    --assume-yes \
    2>&1
}

# Print status message
aptos_log() {
  echo -e "\033[1;33m[aptos]\033[0m $*"
}

aptos_ok() {
  echo -e "\033[1;32m[  OK ]\033[0m $*"
}

aptos_err() {
  echo -e "\033[1;31m[ERROR]\033[0m $*" >&2
}

# Validate that module address is set
require_module_addr() {
  if [[ -z "$APTOS_MODULE_ADDR" ]]; then
    aptos_err "APTOS_MODULE_ADDR not set. Deploy first or export it."
    aptos_err "  export APTOS_MODULE_ADDR=0x..."
    return 1
  fi
}
