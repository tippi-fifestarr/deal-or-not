// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CCIPReceiver} from "@chainlink/contracts/src/v0.8/ccip/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts/src/v0.8/ccip/libraries/Client.sol";

/// @notice Minimal interface for cross-chain game joining
interface IDealOrNot {
    function joinGameCrossChain(uint256 gameId, address player) external;
}

/// @title DealOrNotBridge — CCIP Receiver (Base Sepolia)
/// @notice Receives CCIP messages from spoke gateways on other chains and
///         joins the player into the game on the home chain (Base Sepolia).
///
///         Architecture:
///           ETH Sepolia Gateway → CCIP → DealOrNotBridge → DealOrNotConfidential
///
///         The bridge validates the message came from a registered gateway,
///         then calls joinGameCrossChain on the game contract.
contract DealOrNotBridge is CCIPReceiver {
    // ── State ──
    IDealOrNot public gameContract;
    address public owner;

    /// @notice Registered gateways per source chain: chainSelector → gateway address
    mapping(uint64 => address) public gateways;

    // ── Events ──
    event PlayerJoinedCrossChain(
        uint256 indexed gameId,
        address indexed player,
        uint64 sourceChainSelector,
        bytes32 ccipMessageId
    );
    event CrossChainJoinFailed(
        uint256 indexed gameId,
        address indexed player,
        uint64 sourceChainSelector,
        bytes32 ccipMessageId
    );
    event GatewayRegistered(uint64 indexed chainSelector, address gateway);
    event GatewayRemoved(uint64 indexed chainSelector);
    event GameContractUpdated(address indexed newGameContract);

    // ── Errors ──
    error UnauthorizedGateway(uint64 chainSelector, address sender);
    error NotOwner();

    constructor(
        address _router,
        address _gameContract
    ) CCIPReceiver(_router) {
        gameContract = IDealOrNot(_gameContract);
        owner = msg.sender;
    }

    /// @dev Called by CCIP Router when a message arrives from a spoke gateway.
    function _ccipReceive(
        Client.Any2EVMMessage memory message
    ) internal override {
        // 1. Auth: validate sender is a registered gateway for this source chain
        address sender = abi.decode(message.sender, (address));
        uint64 sourceChain = message.sourceChainSelector;

        if (gateways[sourceChain] != sender) {
            revert UnauthorizedGateway(sourceChain, sender);
        }

        // 2. Decode payload
        (uint256 gameId, address player) = abi.decode(message.data, (uint256, address));

        // 3. Join player into the game (try/catch to avoid bricking CCIP lane)
        try gameContract.joinGameCrossChain(gameId, player) {
            emit PlayerJoinedCrossChain(gameId, player, sourceChain, message.messageId);
        } catch {
            emit CrossChainJoinFailed(gameId, player, sourceChain, message.messageId);
        }
    }

    // ── Admin ──

    /// @notice Register a gateway for a specific source chain.
    function setGateway(uint64 chainSelector, address gateway) external {
        if (msg.sender != owner) revert NotOwner();
        gateways[chainSelector] = gateway;
        emit GatewayRegistered(chainSelector, gateway);
    }

    /// @notice Remove a gateway registration.
    function removeGateway(uint64 chainSelector) external {
        if (msg.sender != owner) revert NotOwner();
        delete gateways[chainSelector];
        emit GatewayRemoved(chainSelector);
    }

    /// @notice Update the game contract address.
    function setGameContract(address _gameContract) external {
        if (msg.sender != owner) revert NotOwner();
        gameContract = IDealOrNot(_gameContract);
        emit GameContractUpdated(_gameContract);
    }
}
