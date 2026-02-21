// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    GameConfig,
    ZeroAddress,
    InvalidConfig,
    NotRegisteredGame,
    JackpotEmpty,
    InvalidJackpotBps,
    JackpotContribution,
    JackpotWon,
    JackpotSeeded,
    TransferFailed
} from "./GameTypes.sol";
import {DealOrNoDeal} from "./DealOrNoDeal.sol";
import {BriefcaseNFT} from "./BriefcaseNFT.sol";
import {ZKGameVerifier} from "./ZKGameVerifier.sol";

/// @title DealOrNoDealFactory
/// @notice Deploys new Deal or No Deal game instances as EIP-1167 minimal proxy clones.
///         Each game gets its own clone of DealOrNoDeal + BriefcaseNFT.
contract DealOrNoDealFactory is Ownable {
    using Clones for address;

    struct GameDeployment {
        address game;
        address nft;
        address host;
        uint256 createdAt;
        uint256 gameId;
    }

    address public immutable gameImplementation;
    address public immutable nftImplementation;
    ZKGameVerifier public immutable zkVerifier;
    address public protocolFeeRecipient;

    uint256 public nextGameId;
    GameDeployment[] private _deployments;
    mapping(address => uint256[]) public hostGames;

    uint256 public jackpotPool;
    uint16 public jackpotBps; // e.g., 200 = 2%
    mapping(address => bool) public isRegisteredGame;

    event GameDeployed(
        uint256 indexed gameId,
        address indexed game,
        address indexed nft,
        address host,
        bytes32 merkleRoot
    );

    constructor(
        address _gameImpl,
        address _nftImpl,
        address _zkVerifier,
        address _protocolFeeRecipient,
        uint16 _jackpotBps
    ) Ownable(msg.sender) {
        if (_gameImpl == address(0) || _nftImpl == address(0)) revert ZeroAddress();
        if (_zkVerifier == address(0) || _protocolFeeRecipient == address(0)) revert ZeroAddress();
        if (_jackpotBps > 1000) revert InvalidJackpotBps();

        gameImplementation = _gameImpl;
        nftImplementation = _nftImpl;
        zkVerifier = ZKGameVerifier(_zkVerifier);
        protocolFeeRecipient = _protocolFeeRecipient;
        jackpotBps = _jackpotBps;
    }

    /// @notice Deploy a new game
    /// @param merkleRoot The committed Merkle root of salted case→value assignments
    /// @param config Game configuration (entry fee, durations, fees, etc.)
    /// @param salt Deterministic deployment salt (scoped to msg.sender)
    /// @return game The deployed game contract address
    /// @return nftAddr The deployed NFT contract address
    function createGame(bytes32 merkleRoot, GameConfig calldata config, bytes32 salt)
        external
        returns (address game, address nftAddr)
    {
        uint256 gid = nextGameId++;
        bytes32 scopedSalt = keccak256(abi.encodePacked(msg.sender, salt));

        // Deploy clones deterministically
        game = gameImplementation.cloneDeterministic(keccak256(abi.encodePacked(scopedSalt, "GAME", gid)));
        nftAddr = nftImplementation.cloneDeterministic(keccak256(abi.encodePacked(scopedSalt, "NFT", gid)));

        // Initialize NFT first (needs to know the game address)
        BriefcaseNFT(nftAddr).initialize(game);

        // Initialize game
        DealOrNoDeal(payable(game)).initialize(
            gid, msg.sender, merkleRoot, config, address(zkVerifier), nftAddr, protocolFeeRecipient
        );

        // Register game for jackpot access control
        isRegisteredGame[game] = true;

        // Track deployment
        _deployments.push(
            GameDeployment({game: game, nft: nftAddr, host: msg.sender, createdAt: block.timestamp, gameId: gid})
        );
        hostGames[msg.sender].push(gid);

        emit GameDeployed(gid, game, nftAddr, msg.sender, merkleRoot);
    }

    /// @notice Predict game address before deployment
    function predictGameAddress(address host, bytes32 salt, uint256 gid) external view returns (address) {
        bytes32 scopedSalt = keccak256(abi.encodePacked(host, salt));
        return gameImplementation.predictDeterministicAddress(
            keccak256(abi.encodePacked(scopedSalt, "GAME", gid)), address(this)
        );
    }

    /// @notice Get total number of games deployed
    function totalGames() external view returns (uint256) {
        return _deployments.length;
    }

    /// @notice Get deployment info by game ID
    function getDeployment(uint256 gid) external view returns (GameDeployment memory) {
        return _deployments[gid];
    }

    /// @notice Get all game IDs for a host
    function getHostGames(address host) external view returns (uint256[] memory) {
        return hostGames[host];
    }

    /// @notice Get paginated deployments
    function getDeployments(uint256 offset, uint256 limit) external view returns (GameDeployment[] memory result) {
        uint256 total = _deployments.length;
        if (offset >= total) return new GameDeployment[](0);
        uint256 end = offset + limit > total ? total : offset + limit;
        result = new GameDeployment[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            result[i - offset] = _deployments[i];
        }
    }

    /// @notice Update protocol fee recipient
    function setProtocolFeeRecipient(address _recipient) external onlyOwner {
        if (_recipient == address(0)) revert ZeroAddress();
        protocolFeeRecipient = _recipient;
    }

    // ============ Jackpot ============

    /// @notice Called by registered game contracts to contribute to the jackpot
    function contributeToJackpot(uint256 gameId_) external payable {
        if (!isRegisteredGame[msg.sender]) revert NotRegisteredGame();
        jackpotPool += msg.value;
        emit JackpotContribution(gameId_, msg.value, jackpotPool);
    }

    /// @notice Called by registered game contracts to award jackpot to winner
    function awardJackpot(uint256 gameId_, address winner) external {
        if (!isRegisteredGame[msg.sender]) revert NotRegisteredGame();
        uint256 amount = jackpotPool;
        if (amount == 0) return; // no revert — graceful skip
        jackpotPool = 0;
        (bool success,) = winner.call{value: amount}("");
        if (!success) revert TransferFailed();
        emit JackpotWon(gameId_, winner, amount);
    }

    /// @notice Anyone can donate ETH to grow the jackpot
    function seedJackpot() external payable {
        jackpotPool += msg.value;
        emit JackpotSeeded(msg.sender, msg.value, jackpotPool);
    }

    /// @notice Owner can tune the jackpot contribution rate
    function setJackpotBps(uint16 _bps) external onlyOwner {
        if (_bps > 1000) revert InvalidJackpotBps();
        jackpotBps = _bps;
    }

    receive() external payable {}
}
