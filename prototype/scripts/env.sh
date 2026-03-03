#!/bin/zsh
# Common environment for Deal or NOT scripts
# Source this: source scripts/env.sh
#
# Keys are read from prototype/.env.example (already in repo with testnet burners).
# DO NOT put real keys here.

SCRIPT_DIR="${0:a:h}"
PROJECT_DIR="$SCRIPT_DIR/.."

export PATH="$HOME/.cre/bin:$HOME/.bun/bin:$PATH"

# Read keys from .env.example (testnet burners only!)
if [[ -f "$PROJECT_DIR/.env.example" ]]; then
  # RPC URL: use Alchemy from frontend .env.local, or fall back to public
  if [[ -f "$PROJECT_DIR/frontend/.env.local" ]]; then
    export RPC_URL=$(grep NEXT_PUBLIC_ALCHEMY_RPC_URL "$PROJECT_DIR/frontend/.env.local" | cut -d= -f2)
  else
    export RPC_URL="https://sepolia.base.org"
  fi
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
export BEST_OF_BANKER="0x2b0A2f022A6F526868692e03614215A209EE81A8"

# Gemini key for CRE AI Banker simulate (read from secrets.yaml)
if [[ -f "$PROJECT_DIR/workflows/banker-ai/secrets.yaml" ]]; then
  export GEMINI_API_KEY=$(grep GEMINI_API_KEY "$PROJECT_DIR/workflows/banker-ai/secrets.yaml" | sed 's/.*: *"\(.*\)"/\1/')
fi
