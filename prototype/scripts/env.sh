#!/usr/bin/env bash
# Common environment for Deal or NOT scripts
# Source this: source prototype/scripts/env.sh (from repo root)
#   or: source scripts/env.sh (from prototype/)
#
# Keys are read from prototype/.env (gitignored) or prototype/.env.example (fallback).
# For hackathon submission: move keys from .env.example to .env and remove from .env.example.
#
# Works in both bash and zsh.

# Resolve script directory (bash and zsh compatible)
if [[ -n "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
elif [[ -n "${(%):-%x}" ]] 2>/dev/null; then
  SCRIPT_DIR="$(cd "$(dirname "${(%):-%x}")" && pwd)"
else
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
fi
PROJECT_DIR="$SCRIPT_DIR/.."

export PATH="$HOME/.foundry/bin:$HOME/.cre/bin:$HOME/.bun/bin:$PATH"

# Read keys from .env (gitignored, preferred) or .env.example (fallback)
ENV_FILE=""
if [[ -f "$PROJECT_DIR/.env" ]]; then
  ENV_FILE="$PROJECT_DIR/.env"
elif [[ -f "$PROJECT_DIR/.env.example" ]]; then
  ENV_FILE="$PROJECT_DIR/.env.example"
else
  echo "ERROR: No .env or .env.example found in prototype/"
  echo "  Create prototype/.env with DEPLOYER_PRIVATE_KEY=0x..."
  exit 1
fi

# RPC URL: use Alchemy from frontend .env.local, or fall back to public
if [[ -f "$PROJECT_DIR/frontend/.env.local" ]]; then
  RPC_URL=$(grep NEXT_PUBLIC_ALCHEMY_RPC_URL "$PROJECT_DIR/frontend/.env.local" | cut -d= -f2)
fi
export RPC_URL="${RPC_URL:-https://sepolia.base.org}"
export DEPLOYER_KEY=$(grep DEPLOYER_PRIVATE_KEY "$ENV_FILE" | cut -d= -f2)
export DEPLOYER_ADDR=$(grep DEPLOYER_ADDRESS "$ENV_FILE" | cut -d= -f2)
export PLAYER_KEY=$(grep PLAYER_PRIVATE_KEY "$ENV_FILE" | cut -d= -f2)
export PLAYER_ADDR=$(grep PLAYER_ADDRESS "$ENV_FILE" | cut -d= -f2)

# Forge deploy scripts expect PRIVATE_KEY
export PRIVATE_KEY="$DEPLOYER_KEY"

# Contract addresses (update after each redeploy)
export CONTRACT="0xd9D4A974021055c46fD834049e36c21D7EE48137"
export BEST_OF_BANKER="0x05EdC924f92aBCbbB91737479948509dC7E23bF9"
export SPONSOR_JACKPOT="0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95"

# Agent Infrastructure (redeployed Mar 8, 2026)
export AGENT_REGISTRY="0xf3B0d29416d3504c802bab4A799349746A37E788"
export DEAL_OR_NOT_AGENTS="0x12e23ff7954c62ae18959c5fd4aed6b51ebcd627"
export MOCK_FORWARDER="0xf958dfa3167bea463a624dc03dcfa3b55e56043a"
export AGENT_STAKING="0xd46eba96e29e83952ec0ef74eed3c7eb1a4ba6b4"
export SEASONAL_LEADERBOARD="0x13c3c750ed19c935567dcb54ee4e88ff6789001a"
export PREDICTION_MARKET="0x05408be7468d01852002156a1b380e3953a502ee"
export SHARED_PRICE_FEED="0x91d8104e6e138607c00dd0bc132e1291a641c36d"

# CCIP Cross-Chain
export GATEWAY="0xaB2995091CCE608d1F3f18f36F8e6615aB2fc124"       # ETH Sepolia
export BRIDGE="0xcF3B0d1575b30B53d8Db4EDe30Ebb47D51a2650a"        # Base Sepolia
export ETH_SEPOLIA_RPC="https://sepolia.gateway.tenderly.co"

# CRE CLI private key — uses deployer burner for simulate --broadcast
# The CRE CLI reads CRE_ETH_PRIVATE_KEY from the environment (no 0x prefix)
export CRE_ETH_PRIVATE_KEY="${CRE_ETH_PRIVATE_KEY:-${DEPLOYER_KEY#0x}}"

# Load CRE workflow secrets from workflows/.env (for simulate mode)
if [[ -f "$PROJECT_DIR/workflows/.env" ]]; then
  while IFS='=' read -r key val; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    export "$key=$val"
  done < "$PROJECT_DIR/workflows/.env"
fi

# ── Pre-flight checks ──
# Called by scripts to warn about missing dependencies before running.
# Usage: preflight_check "cre-reveal" or preflight_check "cre-banker"

preflight_check() {
  local script="${1:-generic}"
  local warnings=0

  # Check: cast binary
  if ! command -v cast &>/dev/null; then
    echo "WARNING: 'cast' not found. Install foundry: curl -L https://foundry.paradigm.xyz | bash"
    warnings=$((warnings + 1))
  fi

  # Check: cre binary
  if ! command -v cre &>/dev/null; then
    echo "WARNING: 'cre' CLI not found. Install: https://docs.chain.link/cre/getting-started"
    echo "  -> CRE workflows will FAIL. Scripts will fall back to manual mode where possible."
    warnings=$((warnings + 1))
  fi

  # Check: CRE_ETH_PRIVATE_KEY
  if [[ -z "$CRE_ETH_PRIVATE_KEY" ]]; then
    echo "WARNING: CRE_ETH_PRIVATE_KEY not set."
    echo "  -> CRE simulate --broadcast will fail (can't sign transactions)."
    echo "  -> Set it: export CRE_ETH_PRIVATE_KEY=<hex-key-without-0x>"
    warnings=$((warnings + 1))
  fi

  # Check: workflow node_modules
  case "$script" in
    cre-reveal)
      if [[ ! -d "$PROJECT_DIR/workflows/confidential-reveal/node_modules" ]]; then
        echo "WARNING: confidential-reveal deps not installed."
        echo "  -> Run: cd prototype/workflows/confidential-reveal && bun install"
        echo "  -> CRE compile will fail without node_modules."
        warnings=$((warnings + 1))
      fi
      ;;
    cre-banker)
      if [[ ! -d "$PROJECT_DIR/workflows/banker-ai/node_modules" ]]; then
        echo "WARNING: banker-ai deps not installed."
        echo "  -> Run: cd prototype/workflows/banker-ai && bun install"
        echo "  -> CRE compile will fail without node_modules."
        warnings=$((warnings + 1))
      fi
      if [[ -z "$GEMINI_API_KEY_ALL" ]]; then
        echo "WARNING: GEMINI_API_KEY_ALL not set (no workflows/.env or missing key)."
        echo "  -> AI Banker will use fallback message (no Gemini personality)."
        echo "  -> Offer math still works, just no snarky message."
        warnings=$((warnings + 1))
      fi
      ;;
    cre-jackpot)
      if [[ ! -d "$PROJECT_DIR/workflows/sponsor-jackpot/node_modules" ]]; then
        echo "WARNING: sponsor-jackpot deps not installed."
        echo "  -> Run: cd prototype/workflows/sponsor-jackpot && bun install"
        warnings=$((warnings + 1))
      fi
      ;;
    cre-support)
      # Check all workflows
      for wf in confidential-reveal banker-ai sponsor-jackpot; do
        if [[ ! -d "$PROJECT_DIR/workflows/$wf/node_modules" ]]; then
          echo "WARNING: $wf deps not installed. Run: cd prototype/workflows/$wf && bun install"
          warnings=$((warnings + 1))
        fi
      done
      if [[ -z "$GEMINI_API_KEY_ALL" ]]; then
        echo "WARNING: GEMINI_API_KEY_ALL not set — AI Banker will use fallback messages."
        warnings=$((warnings + 1))
      fi
      ;;
  esac

  if [[ $warnings -gt 0 ]]; then
    echo ""
    echo "($warnings warning(s) above — script will continue but some features may degrade)"
    echo ""
  fi

  return 0
}
