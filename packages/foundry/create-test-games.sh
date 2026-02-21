#!/bin/bash
# Create 10 test games

set -e

FACTORY=0x0b9c8d4211720b73a445eca6d9de95263f60d2a9
HOST_PK=0x3d6a8ee43ea4a0044ff8100dde908a544b7842ad037a3273661623e26e629d28
RPC=https://sepolia.base.org

echo "Creating 10 test games on Base Sepolia..."
echo "=========================================="

for i in {1..10}; do
  echo ""
  echo "Creating game $i..."

  MERKLE_ROOT=0x$(openssl rand -hex 32)

  TX=$(cast send $FACTORY "createGame(bytes32,(uint256,uint256,uint256,uint256,uint16,uint16,uint16,uint8,uint8),bytes32)" \
    "$MERKLE_ROOT" \
    "(100000000000000,300,300,3600,500,500,5000,2,0)" \
    "0x$(openssl rand -hex 32)" \
    --private-key $HOST_PK \
    --rpc-url $RPC --json 2>&1)

  # Extract game address from event logs (topic 2)
  GAME=$(echo "$TX" | jq -r '.logs[1].topics[2]' | sed 's/^0x000000000000000000000000/0x/')

  echo "✅ Game $i created: $GAME"
  echo "   View at: https://nextjs-delta-two-eckasubn3a.vercel.app/game/$GAME"

  # Open lottery
  cast send $GAME "openLottery()" --private-key $HOST_PK --rpc-url $RPC > /dev/null 2>&1
  echo "   Lottery opened"

  # Small delay between games
  sleep 2
done

echo ""
echo "=========================================="
echo "✅ All 10 games created successfully!"
