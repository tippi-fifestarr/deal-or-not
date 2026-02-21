// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";

/// @title CaseCashGateway
/// @notice Spoke-chain gateway for Cash Case cross-chain betting.
/// @dev Deployed on spoke chains (e.g., Base, Arbitrum). Users place bets here,
///      which are forwarded to the home chain CCIPBridge via CCIP.
///      Payouts from the home chain are received here and forwarded to users.
contract CaseCashGateway is CCIPReceiver {
    // ────────────────────── State ──────────────────────

    /// @notice Owner of this contract
    address public owner;

    /// @notice The CCIP chain selector for the home chain
    uint64 public homeChainSelector;

    /// @notice The CCIPBridge contract address on the home chain
    address public homeBridge;

    /// @notice Tracks total bets sent cross-chain
    uint256 public totalBetsSent;

    /// @notice Tracks total payouts received
    uint256 public totalPayoutsReceived;

    // ────────────────────── Events ──────────────────────

    event BetPlaced(
        address indexed bettor,
        uint256 gameId,
        uint8 betType,
        uint8 choice,
        uint256 amount,
        bytes32 messageId
    );
    event PayoutReceived(
        address indexed recipient,
        uint256 amount
    );
    event HomeBridgeSet(uint64 indexed chainSelector, address bridge);

    // ────────────────────── Errors ──────────────────────

    error OnlyOwner();
    error HomeBridgeNotSet();
    error UnauthorizedSender(uint64 chainSelector, address sender);
    error InsufficientBetAmount();
    error PayoutTransferFailed();
    error InsufficientFeeBalance(uint256 required, uint256 available);

    // ────────────────────── Modifiers ──────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    // ────────────────────── Constructor ──────────────────────

    /// @param router The CCIP router address on this spoke chain
    constructor(address router) CCIPReceiver(router) {
        owner = msg.sender;
    }

    // ────────────────────── Admin Functions ──────────────────────

    /// @notice Set the home chain bridge address and chain selector
    /// @param _homeChainSelector The CCIP chain selector for the home chain
    /// @param _homeBridge The CCIPBridge contract address on the home chain
    function setHomeBridge(uint64 _homeChainSelector, address _homeBridge) external onlyOwner {
        homeChainSelector = _homeChainSelector;
        homeBridge = _homeBridge;
        emit HomeBridgeSet(_homeChainSelector, _homeBridge);
    }

    // ────────────────────── Place Bets (User-Facing) ──────────────────────

    /// @notice Place a cross-chain bet on a Cash Case game
    /// @dev Users call this with native token (ETH). The bet data is encoded and
    ///      sent to the home chain CCIPBridge via CCIP. CCIP fees are deducted
    ///      from the sent value.
    /// @param gameId The ID of the game to bet on
    /// @param betType The type of bet
    /// @param choice The specific choice within the bet type
    function placeBet(
        uint256 gameId,
        uint8 betType,
        uint8 choice
    ) external payable {
        if (homeBridge == address(0)) revert HomeBridgeNotSet();
        if (msg.value == 0) revert InsufficientBetAmount();

        // Encode the bet data: (gameId, betType, choice, bettor)
        bytes memory data = abi.encode(gameId, betType, choice, msg.sender);

        // Build the CCIP message
        Client.EVM2AnyMessage memory ccipMessage = Client.EVM2AnyMessage({
            receiver: abi.encode(homeBridge),
            data: data,
            tokenAmounts: new Client.EVMTokenAmount[](0),
            feeToken: address(0), // Pay CCIP fees in native token
            extraArgs: Client._argsToBytes(
                Client.EVMExtraArgsV1({gasLimit: 300_000})
            )
        });

        // Get the CCIP fee
        IRouterClient router = IRouterClient(getRouter());
        uint256 ccipFee = router.getFee(homeChainSelector, ccipMessage);

        if (msg.value <= ccipFee) {
            revert InsufficientFeeBalance(ccipFee + 1, msg.value);
        }

        // The bet amount is msg.value minus the CCIP fee
        // Note: In a production system, you would use CCIP token transfers
        // to send the bet amount. For the hackathon, the home chain bridge
        // will use its own liquidity pool.

        // Send the message via CCIP, paying fees in native token
        bytes32 messageId = router.ccipSend{value: ccipFee}(
            homeChainSelector,
            ccipMessage
        );

        totalBetsSent++;

        emit BetPlaced(
            msg.sender,
            gameId,
            betType,
            choice,
            msg.value - ccipFee,
            messageId
        );
    }

    // ────────────────────── CCIP Receive (Incoming Payouts) ──────────────────────

    /// @notice Handle incoming CCIP messages (payout from home chain)
    /// @dev Called by the CCIP router when a payout message arrives from the home chain.
    ///      Decodes the payout data and sends native token to the recipient.
    /// @param message The CCIP message containing encoded payout data
    function _ccipReceive(
        Client.Any2EVMMessage memory message
    ) internal override {
        // Verify the sender is the authorized home bridge
        uint64 sourceChainSelector = message.sourceChainSelector;
        address sender = abi.decode(message.sender, (address));

        if (sourceChainSelector != homeChainSelector || sender != homeBridge) {
            revert UnauthorizedSender(sourceChainSelector, sender);
        }

        // Decode the payout data: (recipient, amount)
        (address recipient, uint256 amount) = abi.decode(message.data, (address, uint256));

        // Send native token to recipient
        if (amount > 0 && address(this).balance >= amount) {
            (bool success, ) = recipient.call{value: amount}("");
            if (!success) revert PayoutTransferFailed();
        }

        totalPayoutsReceived++;

        emit PayoutReceived(recipient, amount);
    }

    // ────────────────────── Receive ETH ──────────────────────

    /// @notice Allow contract to receive ETH for payouts
    receive() external payable {}
}
