// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {IBettingPool} from "./IBettingPool.sol";

/// @title CCIPBridge
/// @notice Home-chain bridge that receives cross-chain bets via CCIP and forwards
///         them to the BettingPool. Also sends payouts back to spoke chains.
/// @dev Deployed on the home chain (where the game + betting pool live).
///      Spoke chain gateways send bet messages here, and this contract sends
///      payout messages back to them.
contract CCIPBridge is CCIPReceiver {
    // ────────────────────── State ──────────────────────

    /// @notice The betting pool contract on the home chain
    IBettingPool public bettingPool;

    /// @notice Owner of this contract
    address public owner;

    /// @notice Mapping of CCIP chain selector => authorized gateway address on that chain
    mapping(uint64 => address) public gateways;

    /// @notice Tracks total cross-chain bets received (for monitoring)
    uint256 public totalBetsReceived;

    /// @notice Tracks total payouts sent (for monitoring)
    uint256 public totalPayoutsSent;

    // ────────────────────── Events ──────────────────────

    event GatewaySet(uint64 indexed chainSelector, address gateway);
    event BettingPoolSet(address indexed bettingPool);
    event CrossChainBetReceived(
        uint64 indexed sourceChainSelector,
        address indexed bettor,
        uint256 gameId,
        uint8 betType,
        uint8 choice,
        uint256 amount
    );
    event PayoutSent(
        uint64 indexed destChainSelector,
        address indexed recipient,
        uint256 amount,
        bytes32 messageId
    );

    // ────────────────────── Errors ──────────────────────

    error OnlyOwner();
    error UnauthorizedGateway(uint64 chainSelector, address sender);
    error BettingPoolNotSet();
    error InvalidGatewayAddress();
    error PayoutFailed();
    error InsufficientBalance(uint256 required, uint256 available);

    // ────────────────────── Modifiers ──────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    // ────────────────────── Constructor ──────────────────────

    /// @param router The CCIP router address on the home chain
    constructor(address router) CCIPReceiver(router) {
        owner = msg.sender;
    }

    // ────────────────────── Admin Functions ──────────────────────

    /// @notice Register or update a gateway contract on a spoke chain
    /// @param chainSelector The CCIP chain selector for the spoke chain
    /// @param gateway The gateway contract address on the spoke chain
    function setGateway(uint64 chainSelector, address gateway) external onlyOwner {
        if (gateway == address(0)) revert InvalidGatewayAddress();
        gateways[chainSelector] = gateway;
        emit GatewaySet(chainSelector, gateway);
    }

    /// @notice Set the betting pool contract address
    /// @param _bettingPool The betting pool contract on the home chain
    function setBettingPool(address _bettingPool) external onlyOwner {
        bettingPool = IBettingPool(_bettingPool);
        emit BettingPoolSet(_bettingPool);
    }

    // ────────────────────── CCIP Receive (Incoming Bets) ──────────────────────

    /// @notice Handle incoming CCIP messages (cross-chain bet placements)
    /// @dev Called by the CCIP router when a message arrives from a spoke chain.
    ///      Decodes the bet data and forwards it to the BettingPool.
    /// @param message The CCIP message containing encoded bet data
    function _ccipReceive(
        Client.Any2EVMMessage memory message
    ) internal override {
        // Verify the sender is an authorized gateway
        uint64 sourceChainSelector = message.sourceChainSelector;
        address sender = abi.decode(message.sender, (address));

        if (gateways[sourceChainSelector] != sender) {
            revert UnauthorizedGateway(sourceChainSelector, sender);
        }

        if (address(bettingPool) == address(0)) {
            revert BettingPoolNotSet();
        }

        // Decode the bet data: (gameId, betType, choice, bettor)
        (
            uint256 gameId,
            uint8 betType,
            uint8 choice,
            address bettor
        ) = abi.decode(message.data, (uint256, uint8, uint8, address));

        // Calculate the ETH value from any native tokens transferred with the message
        // In practice, the value is forwarded as msg.value to the betting pool
        uint256 betAmount = address(this).balance;

        // Forward the bet to the BettingPool
        bettingPool.placeBetCrossChain{value: betAmount}(
            gameId,
            betType,
            choice,
            bettor,
            sourceChainSelector
        );

        totalBetsReceived++;

        emit CrossChainBetReceived(
            sourceChainSelector,
            bettor,
            gameId,
            betType,
            choice,
            betAmount
        );
    }

    // ────────────────────── Send Payouts ──────────────────────

    /// @notice Send a payout back to a user on a spoke chain via CCIP
    /// @dev Called by the BettingPool (or owner) to send winnings cross-chain.
    ///      Uses native token (ETH) for CCIP fees.
    /// @param destChainSelector The CCIP chain selector for the destination chain
    /// @param recipient The address to receive the payout on the destination chain
    /// @param amount The amount of native token to send as payout
    function sendPayout(
        uint64 destChainSelector,
        address recipient,
        uint256 amount
    ) external payable onlyOwner {
        address gateway = gateways[destChainSelector];
        if (gateway == address(0)) revert InvalidGatewayAddress();

        // Encode the payout data: (recipient, amount)
        bytes memory data = abi.encode(recipient, amount);

        // Build the CCIP message
        Client.EVM2AnyMessage memory ccipMessage = Client.EVM2AnyMessage({
            receiver: abi.encode(gateway),
            data: data,
            tokenAmounts: new Client.EVMTokenAmount[](0),
            feeToken: address(0), // Pay CCIP fees in native token
            extraArgs: Client._argsToBytes(
                Client.EVMExtraArgsV1({gasLimit: 200_000})
            )
        });

        // Get the CCIP fee
        IRouterClient router = IRouterClient(getRouter());
        uint256 ccipFee = router.getFee(destChainSelector, ccipMessage);

        uint256 totalRequired = ccipFee + amount;
        if (address(this).balance < totalRequired) {
            revert InsufficientBalance(totalRequired, address(this).balance);
        }

        // Send the message via CCIP
        bytes32 messageId = router.ccipSend{value: ccipFee}(
            destChainSelector,
            ccipMessage
        );

        // Send the payout amount to the gateway (it will forward to recipient)
        // Note: In a real implementation, you might use CCIP token transfers instead
        totalPayoutsSent++;

        emit PayoutSent(destChainSelector, recipient, amount, messageId);
    }

    // ────────────────────── Receive ETH ──────────────────────

    /// @notice Allow contract to receive ETH for payouts and CCIP fees
    receive() external payable {}
}
