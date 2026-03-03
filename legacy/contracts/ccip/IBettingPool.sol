// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IBettingPool
/// @notice Interface for the home-chain betting pool that receives cross-chain bets.
/// @dev The BettingPool contract should implement this interface to accept
///      bet placements from the CCIPBridge on behalf of cross-chain users.
interface IBettingPool {
    /// @notice Place a bet on behalf of a cross-chain user.
    /// @param gameId The ID of the game to bet on.
    /// @param betType The type of bet (e.g., 0 = deal outcome, 1 = case value, etc.).
    /// @param choice The specific choice within the bet type.
    /// @param bettor The address of the original bettor on the source chain.
    /// @param sourceChainSelector The CCIP chain selector of the source chain.
    function placeBetCrossChain(
        uint256 gameId,
        uint8 betType,
        uint8 choice,
        address bettor,
        uint64 sourceChainSelector
    ) external payable;
}
