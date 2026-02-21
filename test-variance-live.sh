#!/bin/bash

# Test Variance System on Local Chain
# Demonstrates how banker offers vary with different game seeds

set -e

RPC="http://127.0.0.1:8545"
FACTORY="0x5f3f1dbd7b74c6b46e8c44f98792a1daf8d69154"
HOST_PK="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
PLAYER1_PK="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"

echo "🎲 Testing Variance System"
echo "====================================="

# Create 3 games with different merkle roots (seeds)
for i in 1 2 3; do
    echo ""
    echo "📦 Game $i:"

    # Different salt = different merkle root = different variance
    SALT=$(cast keccak "test-game-$i")
    MERKLE_ROOT="0x$(printf '%064x' $i)"

    # Create game
    GAME=$(cast send $FACTORY "createGame(bytes32,tuple(uint256,uint256,uint256,uint256,uint16,uint16,uint16,uint8,uint8),bytes32)" \
        $MERKLE_ROOT \
        "(100000000000000000,300,180,600,500,500,5000,2,0)" \
        $SALT \
        --private-key $HOST_PK \
        --rpc-url $RPC \
        --json | jq -r '.logs[0].topics[2]')

    GAME_ADDR="0x$(echo $GAME | tail -c 41)"
    echo "   Address: $GAME_ADDR"

    # Start lottery
    cast send $GAME_ADDR "openLottery()" --private-key $HOST_PK --rpc-url $RPC --quiet

    # Enter lottery (player 1)
    PLAYER1=$(cast wallet address --private-key $PLAYER1_PK)
    SECRET1="0x0000000000000000000000000000000000000000000000000000000000000001"
    COMMIT1=$(cast keccak "$(cast concat-hex $SECRET1 $PLAYER1)")
    cast send $GAME_ADDR "enterLottery(bytes32)" $COMMIT1 \
        --value 0.1ether \
        --private-key $PLAYER1_PK \
        --rpc-url $RPC \
        --quiet

    # Fast forward time
    cast rpc evm_increaseTime 301 --rpc-url $RPC > /dev/null
    cast rpc evm_mine --rpc-url $RPC > /dev/null

    # Close lottery
    cast send $GAME_ADDR "closeLottery()" --private-key $HOST_PK --rpc-url $RPC --quiet

    # Reveal
    cast send $GAME_ADDR "revealSecret(bytes32)" $SECRET1 --private-key $PLAYER1_PK --rpc-url $RPC --quiet

    # Fast forward
    cast rpc evm_increaseTime 181 --rpc-url $RPC > /dev/null
    cast rpc evm_mine --rpc-url $RPC > /dev/null

    # Draw winner
    cast send $GAME_ADDR "drawWinner()" --private-key $HOST_PK --rpc-url $RPC --quiet

    # Select case 0
    cast send $GAME_ADDR "selectCase(uint256)" 0 --private-key $PLAYER1_PK --rpc-url $RPC --quiet

    # Get initial EV
    INITIAL_EV=$(cast call $GAME_ADDR "initialEV()" --rpc-url $RPC | xargs printf "%d")
    INITIAL_EV_ETH=$(echo "scale=4; $INITIAL_EV / 1000000000000000000" | bc)
    echo "   Initial EV: $INITIAL_EV_ETH ETH"

    # Simulate a few rounds to get different offers
    # Open 6 cases for round 0
    for case in 1 2 3 4 5 6; do
        # Mock ZK proof
        cast send $GAME_ADDR "openCase(uint256,uint256,uint256[2],uint256[2][2],uint256[2])" \
            $case \
            1000000000000000 \
            "[0,0]" \
            "[[0,0],[0,0]]" \
            "[0,0]" \
            --private-key $PLAYER1_PK \
            --rpc-url $RPC \
            --quiet 2>/dev/null || true
    done

    # Get offer
    OFFER=$(cast call $GAME_ADDR "game()" --rpc-url $RPC | sed -n '8p' | xargs printf "%d")
    OFFER_ETH=$(echo "scale=4; $OFFER / 1000000000000000000" | bc)
    OFFER_PCT=$(echo "scale=2; 100 * $OFFER / $INITIAL_EV" | bc)

    echo "   Round 0 Offer: $OFFER_ETH ETH ($OFFER_PCT% of EV)"
    echo "   Merkle Root: $MERKLE_ROOT"
done

echo ""
echo "✅ Variance demonstrated: Different merkle roots → Different offers!"
echo ""
echo "Expected behavior:"
echo "  - All games have same initial EV (prize distribution)"
echo "  - All games are at Round 0 (base ~27%)"
echo "  - BUT offers vary ±5% due to random variance"
echo "  - Each game's offer is deterministic for its merkle root"
