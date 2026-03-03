// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRouterClient} from "@chainlink/contracts/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts/src/v0.8/ccip/libraries/Client.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @title DealOrNotGateway — CCIP Spoke (ETH Sepolia)
/// @notice Players on ETH Sepolia pay $0.25 entry fee in ETH, gateway sends
///         a CCIP message to the DealOrNotBridge on Base Sepolia to join the game.
///
///         "Play from any chain" — the cross-chain entry point.
contract DealOrNotGateway {
    // ── Immutables ──
    IRouterClient public immutable router;
    AggregatorV3Interface public immutable priceFeed;
    uint64 public immutable homeChainSelector;  // Base Sepolia CCIP chain selector
    address public immutable owner;

    // ── State ──
    address public homeBridge;  // DealOrNotBridge on Base Sepolia

    // ── Constants ──
    uint256 public constant ENTRY_FEE_CENTS = 25;  // $0.25
    uint256 public constant SLIPPAGE_BPS = 500;     // 5% slippage tolerance
    uint256 public constant CCIP_GAS_LIMIT = 300_000;

    // ── Events ──
    event CrossChainJoinSent(
        uint256 indexed gameId,
        address indexed player,
        bytes32 ccipMessageId,
        uint256 feePaid
    );
    event HomeBridgeUpdated(address indexed newBridge);
    event Withdrawn(address indexed to, uint256 amount);

    // ── Errors ──
    error InsufficientEntryFee(uint256 sent, uint256 required);
    error InsufficientCCIPFee(uint256 available, uint256 required);
    error StalePriceFeed();
    error HomeBridgeNotSet();
    error NotOwner();
    error TransferFailed();

    constructor(
        address _router,
        address _priceFeed,
        uint64 _homeChainSelector
    ) {
        router = IRouterClient(_router);
        priceFeed = AggregatorV3Interface(_priceFeed);
        homeChainSelector = _homeChainSelector;
        owner = msg.sender;
    }

    /// @notice Join a game on Base Sepolia from ETH Sepolia.
    ///         Player pays $0.25 entry fee in ETH + CCIP gas fee.
    /// @param gameId The game ID on Base Sepolia to join
    function enterGame(uint256 gameId) external payable {
        if (homeBridge == address(0)) revert HomeBridgeNotSet();

        // 1. Calculate entry fee via Price Feed
        uint256 entryFeeWei = usdToWei(ENTRY_FEE_CENTS);
        uint256 withSlippage = (entryFeeWei * (10000 + SLIPPAGE_BPS)) / 10000;

        // 2. Build CCIP message
        bytes memory data = abi.encode(gameId, msg.sender);
        Client.EVM2AnyMessage memory ccipMessage = Client.EVM2AnyMessage({
            receiver: abi.encode(homeBridge),
            data: data,
            tokenAmounts: new Client.EVMTokenAmount[](0),
            feeToken: address(0),  // pay CCIP fee in native ETH
            extraArgs: Client._argsToBytes(
                Client.EVMExtraArgsV1({gasLimit: CCIP_GAS_LIMIT})
            )
        });

        // 3. Get CCIP fee
        uint256 ccipFee = router.getFee(homeChainSelector, ccipMessage);
        uint256 totalRequired = withSlippage + ccipFee;

        if (msg.value < withSlippage) {
            revert InsufficientEntryFee(msg.value, withSlippage);
        }
        if (msg.value < totalRequired) {
            revert InsufficientCCIPFee(msg.value - withSlippage, ccipFee);
        }

        // 4. Send CCIP message (fee paid from msg.value)
        bytes32 messageId = router.ccipSend{value: ccipFee}(
            homeChainSelector,
            ccipMessage
        );

        emit CrossChainJoinSent(gameId, msg.sender, messageId, msg.value);

        // 5. Refund excess ETH to sender
        uint256 excess = msg.value - withSlippage - ccipFee;
        if (excess > 0) {
            (bool ok, ) = msg.sender.call{value: excess}("");
            if (!ok) revert TransferFailed();
        }
    }

    /// @notice Estimate total cost: entry fee + CCIP fee
    function estimateCost(uint256 gameId) external view returns (
        uint256 entryFeeWei,
        uint256 ccipFeeWei,
        uint256 totalWei
    ) {
        entryFeeWei = usdToWei(ENTRY_FEE_CENTS);
        uint256 withSlippage = (entryFeeWei * (10000 + SLIPPAGE_BPS)) / 10000;

        bytes memory data = abi.encode(gameId, msg.sender);
        Client.EVM2AnyMessage memory ccipMessage = Client.EVM2AnyMessage({
            receiver: abi.encode(homeBridge),
            data: data,
            tokenAmounts: new Client.EVMTokenAmount[](0),
            feeToken: address(0),
            extraArgs: Client._argsToBytes(
                Client.EVMExtraArgsV1({gasLimit: CCIP_GAS_LIMIT})
            )
        });

        ccipFeeWei = router.getFee(homeChainSelector, ccipMessage);
        totalWei = withSlippage + ccipFeeWei;
    }

    /// @notice Convert USD cents to ETH wei using Chainlink Price Feed.
    ///         Pattern from CashCase.sol — (usdCents * 1e24) / ethUsdPrice.
    function usdToWei(uint256 usdCents) public view returns (uint256) {
        (, int256 ethUsdPrice, , , ) = priceFeed.latestRoundData();
        if (ethUsdPrice <= 0) revert StalePriceFeed();
        return (usdCents * 1e24) / uint256(ethUsdPrice);
    }

    // ── Admin ──

    function setHomeBridge(address _homeBridge) external {
        if (msg.sender != owner) revert NotOwner();
        homeBridge = _homeBridge;
        emit HomeBridgeUpdated(_homeBridge);
    }

    /// @notice Withdraw accumulated entry fees.
    function withdraw(address to) external {
        if (msg.sender != owner) revert NotOwner();
        uint256 bal = address(this).balance;
        if (bal == 0) revert TransferFailed();
        (bool ok, ) = to.call{value: bal}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(to, bal);
    }

    receive() external payable {}
}
