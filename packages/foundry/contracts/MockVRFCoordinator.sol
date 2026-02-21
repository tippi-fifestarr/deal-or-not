// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockVRFCoordinator
/// @notice Mock Chainlink VRF Coordinator for local testing
/// @dev Instantly fulfills randomness requests with pseudo-random values
contract MockVRFCoordinator {
    uint256 public requestCounter;

    event RandomWordsRequested(
        bytes32 indexed keyHash,
        uint256 requestId,
        uint256 preSeed,
        uint64 indexed subId,
        uint16 minimumRequestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords,
        address indexed sender
    );

    event RandomWordsFulfilled(
        uint256 indexed requestId,
        uint256 outputSeed,
        uint96 payment,
        bool success
    );

    /// @notice Request random words (instantly fulfilled in same tx for testing)
    /// @param keyHash Key hash (ignored in mock)
    /// @param subId Subscription ID (ignored in mock)
    /// @param minimumRequestConfirmations Min confirmations (ignored in mock)
    /// @param callbackGasLimit Gas limit for callback
    /// @param numWords Number of random words requested
    /// @return requestId The request ID
    function requestRandomWords(
        bytes32 keyHash,
        uint64 subId,
        uint16 minimumRequestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords
    ) external returns (uint256 requestId) {
        requestId = ++requestCounter;

        emit RandomWordsRequested(
            keyHash,
            requestId,
            0, // preSeed
            subId,
            minimumRequestConfirmations,
            callbackGasLimit,
            numWords,
            msg.sender
        );

        // Generate pseudo-random words
        uint256[] memory randomWords = new uint256[](numWords);
        for (uint32 i = 0; i < numWords; i++) {
            randomWords[i] = uint256(
                keccak256(
                    abi.encodePacked(
                        block.timestamp,
                        block.prevrandao,
                        requestId,
                        i,
                        msg.sender
                    )
                )
            );
        }

        // Immediately fulfill (in production this happens async)
        (bool success,) = msg.sender.call{gas: callbackGasLimit}(
            abi.encodeWithSignature(
                "rawFulfillRandomWords(uint256,uint256[])",
                requestId,
                randomWords
            )
        );

        emit RandomWordsFulfilled(requestId, randomWords[0], 0, success);

        return requestId;
    }

    /// @notice Get subscription (mock - always returns valid)
    function getSubscription(uint64)
        external
        pure
        returns (
            uint96 balance,
            uint64 reqCount,
            address owner,
            address[] memory consumers
        )
    {
        balance = 1000 ether; // Mock balance
        reqCount = 0;
        owner = address(0);
        consumers = new address[](0);
    }

    /// @notice Create subscription (mock)
    function createSubscription() external pure returns (uint64) {
        return 1; // Always return subscription ID 1
    }

    /// @notice Add consumer (mock - does nothing)
    function addConsumer(uint64, address) external pure {}

    /// @notice Remove consumer (mock - does nothing)
    function removeConsumer(uint64, address) external pure {}
}
