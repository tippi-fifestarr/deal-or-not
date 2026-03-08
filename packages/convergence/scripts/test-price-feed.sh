#!/usr/bin/env bash
# Price feed diagnostics — test PriceFeedHelper & SharedPriceFeed on Base Sepolia
# Usage: ./scripts/test-price-feed.sh [command]
#
# Commands:
#   (none)     Run all diagnostics
#   price      ETH/USD price from raw feed + SharedPriceFeed
#   convert    USD→Wei and Wei→USD conversions
#   snapshot   Snapshot price (ethPerDollar) + centsToWeiSnapshot
#   freshness  Check feed staleness
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../script/env.sh"

: "${SHARED_PRICE_FEED:?Set SHARED_PRICE_FEED in env.sh}"
: "${ETH_USD_FEED:?Set ETH_USD_FEED in env.sh}"

CMD="${1:-all}"

# Strip cast's scientific notation suffix: "193206950000 [1.932e11]" -> "193206950000"
strip() { echo "$1" | awk '{print $1}'; }

run_price() {
  echo "=== ETH/USD Price ==="
  echo ""
  echo "--- Raw Chainlink Feed ($ETH_USD_FEED) ---"
  RAW=$(cast call "$ETH_USD_FEED" "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url "$RPC_URL")
  echo "$RAW"
  PRICE_RAW=$(echo "$RAW" | sed -n '2p' | awk '{gsub(/\[.*\]/,"",$1); print $1}')
  echo ""
  echo "Price (8 decimals): $PRICE_RAW"
  echo "Price (USD): \$$(python3 -c "print(f'{int(\"$PRICE_RAW\") / 1e8:.2f}')")"
  echo ""
  echo "--- SharedPriceFeed ($SHARED_PRICE_FEED) ---"
  SPF_PRICE_RAW=$(cast call "$SHARED_PRICE_FEED" "getEthUsdPrice()(uint256)" --rpc-url "$RPC_URL" 2>&1) || {
    echo "ERROR: getEthUsdPrice() reverted: $SPF_PRICE_RAW"
    echo "  This usually means the feed is stale (>1 hour old)."
    echo "  Check freshness: ./scripts/test-price-feed.sh freshness"
    return 1
  }
  SPF_PRICE=$(strip "$SPF_PRICE_RAW")
  echo "getEthUsdPrice(): $SPF_PRICE"
  echo "Price (USD): \$$(python3 -c "print(f'{int(\"$SPF_PRICE\") / 1e8:.2f}')")"
}

run_convert() {
  echo "=== USD ↔ Wei Conversions ==="
  echo ""
  echo "--- usdToWei (via SharedPriceFeed) ---"
  for CENTS in 1 5 10 25 50 100; do
    WEI_RAW=$(cast call "$SHARED_PRICE_FEED" "usdToWei(uint256)(uint256)" "$CENTS" --rpc-url "$RPC_URL" 2>&1) || {
      echo "  \$$(python3 -c "print(f'{$CENTS/100:.2f}')") -> ERROR: $WEI_RAW"
      continue
    }
    WEI=$(strip "$WEI_RAW")
    echo "  \$$(python3 -c "print(f'{$CENTS/100:.2f}')") -> $WEI wei ($(python3 -c "print(f'{int(\"$WEI\") / 1e18:.8f}')") ETH)"
  done
  echo ""
  echo "--- weiToUsd (via SharedPriceFeed) ---"
  for WEI_AMT in 100000000000000 500000000000000 1000000000000000; do
    USD_RAW=$(cast call "$SHARED_PRICE_FEED" "weiToUsd(uint256)(uint256)" "$WEI_AMT" --rpc-url "$RPC_URL" 2>&1) || {
      echo "  $WEI_AMT wei -> ERROR: $USD_RAW"
      continue
    }
    USD=$(strip "$USD_RAW")
    echo "  $WEI_AMT wei ($(python3 -c "print(f'{int(\"$WEI_AMT\") / 1e18:.6f}')") ETH) -> $USD cents (\$$(python3 -c "print(f'{int(\"$USD\") / 100:.2f}')"))"
  done
}

run_snapshot() {
  echo "=== Snapshot Price ==="
  echo ""
  SNAPSHOT_RAW=$(cast call "$SHARED_PRICE_FEED" "snapshotPrice()(uint256)" --rpc-url "$RPC_URL" 2>&1) || {
    echo "ERROR: snapshotPrice() reverted: $SNAPSHOT_RAW"
    return 1
  }
  SNAPSHOT=$(strip "$SNAPSHOT_RAW")
  echo "snapshotPrice() (ethPerDollar): $SNAPSHOT"
  echo ""
  echo "--- centsToWeiSnapshot (pure function, uses locked rate) ---"
  for CENTS in 1 5 10 50 100; do
    WEI=$(strip "$(cast call "$SHARED_PRICE_FEED" "centsToWeiSnapshot(uint256,uint256)(uint256)" "$CENTS" "$SNAPSHOT" --rpc-url "$RPC_URL")")
    echo "  \$$(python3 -c "print(f'{$CENTS/100:.2f}')") @ snapshot -> $WEI wei ($(python3 -c "print(f'{int(\"$WEI\") / 1e18:.8f}')") ETH)"
  done
  echo ""
  echo "Game case values (\$0.01, \$0.05, \$0.10, \$0.50, \$1.00) at this snapshot:"
  for CENTS in 1 5 10 50 100; do
    WEI=$(strip "$(cast call "$SHARED_PRICE_FEED" "centsToWeiSnapshot(uint256,uint256)(uint256)" "$CENTS" "$SNAPSHOT" --rpc-url "$RPC_URL")")
    echo "  Case \$$(python3 -c "print(f'{$CENTS/100:.2f}')") = $WEI wei"
  done
}

run_freshness() {
  echo "=== Feed Freshness ==="
  echo ""
  FRESH=$(cast call "$SHARED_PRICE_FEED" "isFresh(uint256)(bool)" 3600 --rpc-url "$RPC_URL" 2>&1) || {
    echo "ERROR: isFresh() failed: $FRESH"
    return 1
  }
  echo "isFresh(3600s): $FRESH"
  UPDATED_RAW=$(cast call "$SHARED_PRICE_FEED" "lastUpdatedAt()(uint256)" --rpc-url "$RPC_URL" 2>&1) || {
    echo "ERROR: lastUpdatedAt() failed: $UPDATED_RAW"
    return 1
  }
  UPDATED=$(strip "$UPDATED_RAW")
  echo "lastUpdatedAt(): $UPDATED ($(python3 -c "
import datetime
ts = int('$UPDATED')
dt = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
print(dt.strftime('%Y-%m-%d %H:%M:%S UTC'))
"))"
  NOW=$(date +%s)
  AGE=$((NOW - UPDATED))
  echo "Age: ${AGE}s ($(python3 -c "print(f'{$AGE / 60:.1f}')") minutes)"
  if [[ "$FRESH" == "true" ]]; then
    echo "Status: FRESH (within 1-hour threshold)"
  else
    echo "Status: STALE (older than 1 hour — conversions will revert)"
  fi
}

case "$CMD" in
  price)     run_price ;;
  convert)   run_convert ;;
  snapshot)  run_snapshot ;;
  freshness) run_freshness ;;
  all)
    run_price
    echo ""
    run_convert
    echo ""
    run_snapshot
    echo ""
    run_freshness
    ;;
  *)
    echo "Unknown command: $CMD"
    echo "Usage: test-price-feed.sh [price|convert|snapshot|freshness|all]"
    exit 1
    ;;
esac
