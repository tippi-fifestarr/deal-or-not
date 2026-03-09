// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRouterClient} from "@chainlink/contracts/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts/src/v0.8/ccip/libraries/Client.sol";

/// @title CCIPGasFunder -- Send gas ETH cross-chain via CCIP (ETH Sepolia -> Base Sepolia)
/// @notice Players who bridge to join a game often land on Base Sepolia with zero ETH.
///         This contract sends a CCIP message to a receiver on Base Sepolia that will
///         forward pre-funded ETH to the player so they can actually play.
/// @dev The receiver contract (CCIPGasReceiver) is deployed separately on Base Sepolia
///      and must be pre-funded with ETH. This contract only handles the source-chain side.
contract CCIPGasFunder {
    IRouterClient public immutable router;
    uint64 public immutable destinationChainSelector;
    address public immutable owner;

    address public gasReceiver; // CCIPGasReceiver address on Base Sepolia

    uint256 public constant GAS_AMOUNT = 0.001 ether; // Fixed amount of gas ETH to send
    uint256 public constant CCIP_GAS_LIMIT = 100_000; // Gas for the receiver callback

    event GasFundingSent(address indexed sender, address indexed recipient, bytes32 ccipMessageId);
    event GasReceiverUpdated(address indexed newReceiver);
    event Withdrawn(address indexed to, uint256 amount);

    error InsufficientFee(uint256 sent, uint256 required);
    error GasReceiverNotSet();
    error NotOwner();
    error TransferFailed();

    constructor(address _router, uint64 _destinationChainSelector) {
        router = IRouterClient(_router);
        destinationChainSelector = _destinationChainSelector;
        owner = msg.sender;
    }

    /// @notice Send a CCIP message requesting gas ETH for a recipient on Base Sepolia.
    /// @param recipient The address to receive gas ETH on the destination chain.
    /// @dev The user pays the CCIP messaging fee in native ETH. The actual gas ETH is
    ///      disbursed by the pre-funded CCIPGasReceiver on the destination chain.
    function sendGas(address recipient) external payable {
        if (gasReceiver == address(0)) revert GasReceiverNotSet();

        Client.EVM2AnyMessage memory ccipMessage = _buildMessage(recipient);
        uint256 ccipFee = router.getFee(destinationChainSelector, ccipMessage);

        if (msg.value < ccipFee) revert InsufficientFee(msg.value, ccipFee);

        bytes32 messageId = router.ccipSend{value: ccipFee}(destinationChainSelector, ccipMessage);
        emit GasFundingSent(msg.sender, recipient, messageId);

        // Refund any excess ETH
        uint256 excess = msg.value - ccipFee;
        if (excess > 0) {
            (bool ok, ) = msg.sender.call{value: excess}("");
            if (!ok) revert TransferFailed();
        }
    }

    /// @notice Estimate the CCIP fee for sending a gas funding request.
    /// @return ccipFee The fee charged by the CCIP router.
    function estimateFee() external view returns (uint256 ccipFee) {
        Client.EVM2AnyMessage memory ccipMessage = _buildMessage(msg.sender);
        ccipFee = router.getFee(destinationChainSelector, ccipMessage);
    }

    /// @notice Set the CCIPGasReceiver address on the destination chain.
    function setGasReceiver(address _gasReceiver) external {
        if (msg.sender != owner) revert NotOwner();
        gasReceiver = _gasReceiver;
        emit GasReceiverUpdated(_gasReceiver);
    }

    /// @notice Withdraw any stuck ETH from the contract.
    function withdraw(address to) external {
        if (msg.sender != owner) revert NotOwner();
        uint256 bal = address(this).balance;
        if (bal == 0) revert TransferFailed();
        (bool ok, ) = to.call{value: bal}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(to, bal);
    }

    function _buildMessage(address recipient) internal view returns (Client.EVM2AnyMessage memory) {
        return Client.EVM2AnyMessage({
            receiver: abi.encode(gasReceiver),
            data: abi.encode(recipient, GAS_AMOUNT),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            feeToken: address(0),
            extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: CCIP_GAS_LIMIT}))
        });
    }

    receive() external payable {}
}
