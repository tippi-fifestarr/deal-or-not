#!/usr/bin/env bash
# Deploy or redeploy Deal or NOT prototype contracts
#
# Usage:
#   bash prototype/scripts/deploy.sh agents      # DealOrNotAgents + MockKeystoneForwarder
#   bash prototype/scripts/deploy.sh staking      # AgentStaking, SeasonalLeaderboard, PredictionMarket
#   bash prototype/scripts/deploy.sh pricefeed    # SharedPriceFeed
#   bash prototype/scripts/deploy.sh all          # All of the above
#   bash prototype/scripts/deploy.sh wire         # Post-deploy wiring (authorizations)
#
# Prerequisites:
#   - Foundry installed (forge, cast)
#   - prototype/.env.example has deployer key (testnet burner)
#   - ETH on Base Sepolia for gas
#
# The script reads keys from env.sh which reads prototype/.env.example.
# Forge deploy scripts expect PRIVATE_KEY, so we bridge the naming.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

# Bridge env var names: env.sh exports DEPLOYER_KEY, forge expects PRIVATE_KEY
export PRIVATE_KEY="$DEPLOYER_KEY"

CONTRACTS_DIR="$SCRIPT_DIR/../contracts"
MODE="${1:-all}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}DEPLOYED${NC} $1"; }
info() { echo -e "${YELLOW}>>>${NC} $1"; }

# ── Contract addresses (updated after each deploy) ──
# These are read by the wire command. Update after deploying.
AGENT_REGISTRY="0xf3B0d29416d3504c802bab4A799349746A37E788"

# Latest deployed addresses (update these after running deploy)
DEAL_OR_NOT_AGENTS="${DEAL_OR_NOT_AGENTS:-0x12e23ff7954c62ae18959c5fd4aed6b51ebcd627}"
MOCK_FORWARDER="${MOCK_FORWARDER:-0xf958dfa3167bea463a624dc03dcfa3b55e56043a}"
AGENT_STAKING="${AGENT_STAKING:-0xd46eba96e29e83952ec0ef74eed3c7eb1a4ba6b4}"
SEASONAL_LEADERBOARD="${SEASONAL_LEADERBOARD:-0x13c3c750ed19c935567dcb54ee4e88ff6789001a}"
PREDICTION_MARKET="${PREDICTION_MARKET:-0x05408be7468d01852002156a1b380e3953a502ee}"
SHARED_PRICE_FEED="${SHARED_PRICE_FEED:-0x91d8104e6e138607c00dd0bc132e1291a641c36d}"

deploy_agents() {
  info "Deploying DealOrNotAgents + MockKeystoneForwarder"
  cd "$CONTRACTS_DIR"
  forge script script/DeployDealOrNotAgents.s.sol:DeployDealOrNotAgents \
    --rpc-url "$RPC_URL" --broadcast 2>&1 | grep -E "deployed|CREATE|Summary|MockKeystone|DealOrNot"
  pass "DealOrNotAgents"
  echo ""
  echo "  IMPORTANT: Add the new DealOrNotAgents address as a VRF consumer at https://vrf.chain.link"
  echo "  Then run: bash prototype/scripts/deploy.sh wire"
}

deploy_staking() {
  info "Deploying AgentStaking, SeasonalLeaderboard, PredictionMarket"
  cd "$CONTRACTS_DIR"
  forge script script/DeployAgentInfrastructure.s.sol:DeployAgentInfrastructure \
    --rpc-url "$RPC_URL" --broadcast 2>&1 | grep -E "deployed|CREATE|Summary|Staking|Leaderboard|Market"
  pass "Agent Infrastructure"
}

deploy_pricefeed() {
  info "Deploying SharedPriceFeed (Base Sepolia)"
  cd "$CONTRACTS_DIR"
  forge script script/DeploySharedPriceFeed.s.sol \
    --rpc-url "$RPC_URL" --broadcast 2>&1 | grep -E "deployed|CREATE|SharedPriceFeed"
  pass "SharedPriceFeed"
}

wire_contracts() {
  info "Wiring contract authorizations"
  echo ""

  # 1. Authorize DealOrNotAgents in AgentRegistry
  info "Authorizing DealOrNotAgents in AgentRegistry"
  cast send "$AGENT_REGISTRY" \
    "authorizeContract(address)" "$DEAL_OR_NOT_AGENTS" \
    --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" > /dev/null 2>&1
  pass "AgentRegistry -> DealOrNotAgents"

  # 2. Authorize DealOrNotAgents in AgentStaking
  info "Authorizing DealOrNotAgents in AgentStaking"
  cast send "$AGENT_STAKING" \
    "setAuthorizedCaller(address,bool)" "$DEAL_OR_NOT_AGENTS" true \
    --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" > /dev/null 2>&1
  pass "AgentStaking -> DealOrNotAgents"

  # 3. Authorize DealOrNotAgents in SeasonalLeaderboard
  info "Authorizing DealOrNotAgents in SeasonalLeaderboard"
  cast send "$SEASONAL_LEADERBOARD" \
    "authorizeRecorder(address)" "$DEAL_OR_NOT_AGENTS" \
    --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" > /dev/null 2>&1
  pass "SeasonalLeaderboard -> DealOrNotAgents"

  echo ""
  info "All authorizations complete."
  info "Don't forget to:"
  echo "  1. Add DealOrNotAgents as VRF consumer at https://vrf.chain.link"
  echo "  2. Update addresses in prototype/frontend/lib/chains.ts"
  echo "  3. Run: bash prototype/scripts/deploy.sh verify"
}

verify_contracts() {
  info "Verifying contracts on Sourcify"

  info "Verifying DealOrNotAgents"
  forge verify-contract "$DEAL_OR_NOT_AGENTS" DealOrNotAgents \
    --verifier sourcify --chain-id 84532 --watch 2>&1 | tail -2

  info "Verifying MockKeystoneForwarder"
  forge verify-contract "$MOCK_FORWARDER" MockKeystoneForwarder \
    --verifier sourcify --chain-id 84532 --watch 2>&1 | tail -2

  info "Verifying AgentStaking"
  forge verify-contract "$AGENT_STAKING" AgentStaking \
    --verifier sourcify --chain-id 84532 --watch 2>&1 | tail -2

  info "Verifying SeasonalLeaderboard"
  forge verify-contract "$SEASONAL_LEADERBOARD" SeasonalLeaderboard \
    --verifier sourcify --chain-id 84532 --watch 2>&1 | tail -2

  info "Verifying PredictionMarket"
  forge verify-contract "$PREDICTION_MARKET" PredictionMarket \
    --verifier sourcify --chain-id 84532 --watch 2>&1 | tail -2

  info "Verifying SharedPriceFeed"
  forge verify-contract "$SHARED_PRICE_FEED" SharedPriceFeed \
    --verifier sourcify --chain-id 84532 --watch 2>&1 | tail -2

  pass "Verification complete"
}

show_addresses() {
  echo ""
  echo "======================================="
  echo "  Current Deployed Addresses"
  echo "======================================="
  echo "  AgentRegistry:         $AGENT_REGISTRY"
  echo "  DealOrNotAgents:       $DEAL_OR_NOT_AGENTS"
  echo "  MockKeystoneForwarder: $MOCK_FORWARDER"
  echo "  AgentStaking:          $AGENT_STAKING"
  echo "  SeasonalLeaderboard:   $SEASONAL_LEADERBOARD"
  echo "  PredictionMarket:      $PREDICTION_MARKET"
  echo "  SharedPriceFeed:       $SHARED_PRICE_FEED"
  echo ""
  echo "  Core Game:"
  echo "  DealOrNotConfidential: $CONTRACT"
  echo "  BestOfBanker:          $BEST_OF_BANKER"
  echo "  SponsorJackpot:        $SPONSOR_JACKPOT"
  echo "  Bridge (CCIP):         $BRIDGE"
  echo "  Gateway (ETH Sepolia): $GATEWAY"
  echo "======================================="
}

case "$MODE" in
  agents)   deploy_agents ;;
  staking)  deploy_staking ;;
  pricefeed) deploy_pricefeed ;;
  wire)     wire_contracts ;;
  verify)   verify_contracts ;;
  addresses) show_addresses ;;
  all)
    deploy_agents
    echo ""
    deploy_staking
    echo ""
    deploy_pricefeed
    echo ""
    wire_contracts
    echo ""
    show_addresses
    ;;
  *)
    echo "Usage: deploy.sh [agents|staking|pricefeed|wire|verify|addresses|all]"
    exit 1
    ;;
esac
