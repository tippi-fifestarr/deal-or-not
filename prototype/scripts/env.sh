#!/usr/bin/env bash
# Common environment for Deal or NOT scripts
# Source this: source scripts/env.sh
#
# Keys are read from prototype/.env.example (already in repo with testnet burners).
# DO NOT put real keys here.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."

export PATH="$HOME/.foundry/bin:$HOME/.cre/bin:$HOME/.bun/bin:$PATH"

# Read keys from .env.example (testnet burners only!)
if [[ -f "$PROJECT_DIR/.env.example" ]]; then
  # RPC URL: use Alchemy from frontend .env.local, or fall back to public
  if [[ -f "$PROJECT_DIR/frontend/.env.local" ]]; then
    RPC_URL=$(grep NEXT_PUBLIC_ALCHEMY_RPC_URL "$PROJECT_DIR/frontend/.env.local" | cut -d= -f2)
  fi
  export RPC_URL="${RPC_URL:-https://sepolia.base.org}"
  export DEPLOYER_KEY=$(grep DEPLOYER_PRIVATE_KEY "$PROJECT_DIR/.env.example" | cut -d= -f2)
  export DEPLOYER_ADDR=$(grep DEPLOYER_ADDRESS "$PROJECT_DIR/.env.example" | cut -d= -f2)
  export PLAYER_KEY=$(grep PLAYER_PRIVATE_KEY "$PROJECT_DIR/.env.example" | cut -d= -f2)
  export PLAYER_ADDR=$(grep PLAYER_ADDRESS "$PROJECT_DIR/.env.example" | cut -d= -f2)
else
  echo "ERROR: prototype/.env.example not found"
  exit 1
fi

# Contract addresses (update after each redeploy)
export CONTRACT="0xd9D4A974021055c46fD834049e36c21D7EE48137"
export BEST_OF_BANKER="0x05EdC924f92aBCbbB91737479948509dC7E23bF9"
export SPONSOR_JACKPOT="0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95"

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
