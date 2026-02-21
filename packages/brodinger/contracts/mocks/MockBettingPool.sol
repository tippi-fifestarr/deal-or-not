// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IBettingPool} from "../ccip/IBettingPool.sol";

/// @title MockBettingPool
/// @notice Mock implementation of IBettingPool for testing CCIP cross-chain bets.
contract MockBettingPool is IBettingPool {
    struct Bet {
        uint256 gameId;
        uint8 betType;
        uint8 choice;
        address bettor;
        uint64 sourceChainSelector;
        uint256 amount;
    }

    Bet[] public bets;

    event BetReceived(
        uint256 gameId,
        uint8 betType,
        uint8 choice,
        address bettor,
        uint64 sourceChainSelector,
        uint256 amount
    );

    function placeBetCrossChain(
        uint256 gameId,
        uint8 betType,
        uint8 choice,
        address bettor,
        uint64 sourceChainSelector
    ) external payable override {
        bets.push(Bet({
            gameId: gameId,
            betType: betType,
            choice: choice,
            bettor: bettor,
            sourceChainSelector: sourceChainSelector,
            amount: msg.value
        }));

        emit BetReceived(gameId, betType, choice, bettor, sourceChainSelector, msg.value);
    }

    function getBetCount() external view returns (uint256) {
        return bets.length;
    }

    receive() external payable {}
}
