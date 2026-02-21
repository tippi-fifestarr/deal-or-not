// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VRFCoordinatorV2Interface} from "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import {VRFConsumerBaseV2} from "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import {GameState, InvalidGameState} from "./GameTypes.sol";

/// @title ChainlinkVRFLottery
/// @notice Mixin contract that adds Chainlink VRF lottery functionality
/// @dev This is meant to be used as an alternative to commit-reveal lottery
abstract contract ChainlinkVRFLottery is VRFConsumerBaseV2 {
    // ============ VRF Config ============

    struct VRFConfig {
        uint64 subscriptionId;
        bytes32 keyHash;
        uint32 callbackGasLimit;
        uint16 requestConfirmations;
    }

    VRFCoordinatorV2Interface public immutable vrfCoordinator;
    VRFConfig public vrfConfig;

    // ============ VRF State ============

    uint256 public vrfRequestId;
    bool public vrfFulfilled;
    uint256 public vrfRandomWord;

    // ============ Events ============

    event RandomnessRequested(uint256 indexed gameId, uint256 requestId);
    event RandomnessFulfilled(uint256 indexed gameId, uint256 requestId, uint256 randomWord);

    // ============ Errors ============

    error VRFNotConfigured();
    error VRFAlreadyRequested();
    error VRFNotFulfilled();
    error InvalidVRFRequest();

    // ============ Constructor ============

    constructor(address _vrfCoordinator) VRFConsumerBaseV2(_vrfCoordinator) {
        vrfCoordinator = VRFCoordinatorV2Interface(_vrfCoordinator);
    }

    // ============ Internal Functions ============

    /// @notice Initialize VRF configuration
    /// @param config VRF configuration parameters
    function _initializeVRF(VRFConfig memory config) internal {
        vrfConfig = config;
    }

    /// @notice Request randomness from Chainlink VRF
    /// @dev Should be called when lottery closes
    /// @return requestId The VRF request ID
    function _requestRandomness() internal returns (uint256 requestId) {
        if (vrfConfig.subscriptionId == 0) revert VRFNotConfigured();
        if (vrfRequestId != 0) revert VRFAlreadyRequested();

        requestId = vrfCoordinator.requestRandomWords(
            vrfConfig.keyHash,
            vrfConfig.subscriptionId,
            vrfConfig.requestConfirmations,
            vrfConfig.callbackGasLimit,
            1 // numWords - we only need 1 random number
        );

        vrfRequestId = requestId;

        emit RandomnessRequested(_getGameId(), requestId);
    }

    /// @notice Callback function used by VRF Coordinator
    /// @param requestId The VRF request ID
    /// @param randomWords Array of random values (we only use first one)
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] memory randomWords
    ) internal override {
        if (requestId != vrfRequestId) revert InvalidVRFRequest();

        vrfRandomWord = randomWords[0];
        vrfFulfilled = true;

        emit RandomnessFulfilled(_getGameId(), requestId, vrfRandomWord);

        // Trigger winner selection with the random number
        _onRandomnessFulfilled(vrfRandomWord);
    }

    // ============ Abstract Functions ============

    /// @notice Get the current game ID
    /// @dev Must be implemented by inheriting contract
    function _getGameId() internal view virtual returns (uint256);

    /// @notice Called when VRF randomness is fulfilled
    /// @dev Must be implemented by inheriting contract to handle winner selection
    /// @param randomWord The random number from VRF
    function _onRandomnessFulfilled(uint256 randomWord) internal virtual;
}
