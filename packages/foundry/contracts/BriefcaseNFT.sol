// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {CaseTier, caseTier, AlreadyInitialized, ZeroAddress, InvalidCaseIndex, NUM_CASES} from "./GameTypes.sol";

/// @title BriefcaseNFT
/// @notice ERC-721 briefcase NFTs with on-chain metadata. 26 minted per game.
///         Sealed until revealed by the game contract via ZK proof.
contract BriefcaseNFT is ERC721 {
    using Strings for uint256;
    using Strings for address;

    struct Briefcase {
        uint256 gameId;
        uint8 caseIndex; // 0-25
        uint256 value; // 0 until revealed
        bool revealed;
    }

    address public gameContract;
    uint256 public nextTokenId;
    bool private _initialized;

    // tokenId => briefcase data
    mapping(uint256 => Briefcase) public briefcases;

    // gameId => caseIndex => tokenId
    mapping(uint256 => mapping(uint8 => uint256)) public caseTokenId;

    modifier onlyGame() {
        require(msg.sender == gameContract, "BriefcaseNFT: caller is not game");
        _;
    }

    constructor() ERC721("Deal or No Deal Briefcase", "DOND") {}

    function initialize(address _gameContract) external {
        if (_initialized) revert AlreadyInitialized();
        if (_gameContract == address(0)) revert ZeroAddress();
        gameContract = _gameContract;
        _initialized = true;
    }

    /// @notice Mint 26 briefcases for a new game, all owned by the game contract
    /// @param gameId The game these briefcases belong to
    /// @return startTokenId The first token ID minted
    function mintGameSet(uint256 gameId) external onlyGame returns (uint256 startTokenId) {
        startTokenId = nextTokenId;
        for (uint8 i; i < NUM_CASES; ++i) {
            uint256 tokenId = nextTokenId++;
            _mint(gameContract, tokenId);
            briefcases[tokenId] = Briefcase({gameId: gameId, caseIndex: i, value: 0, revealed: false});
            caseTokenId[gameId][i] = tokenId;
        }
    }

    /// @notice Reveal a briefcase's value after ZK proof verification
    /// @param gameId The game ID
    /// @param caseIndex The case index (0-25)
    /// @param value The revealed value
    function revealCase(uint256 gameId, uint8 caseIndex, uint256 value) external onlyGame {
        uint256 tokenId = caseTokenId[gameId][caseIndex];
        Briefcase storage bc = briefcases[tokenId];
        bc.value = value;
        bc.revealed = true;
    }

    /// @notice Transfer a briefcase to a player (when they open it or win it)
    /// @param gameId The game ID
    /// @param caseIndex The case index
    /// @param to The recipient
    function transferCase(uint256 gameId, uint8 caseIndex, address to) external onlyGame {
        uint256 tokenId = caseTokenId[gameId][caseIndex];
        _transfer(gameContract, to, tokenId);
    }

    /// @notice On-chain metadata (Base64-encoded JSON)
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        Briefcase memory bc = briefcases[tokenId];
        CaseTier tier = caseTier(bc.caseIndex);
        string memory tierName = _tierName(tier);
        string memory status = bc.revealed ? "Revealed" : "Sealed";

        string memory valueStr = bc.revealed ? _formatEth(bc.value) : "???";

        string memory svg = _generateSVG(bc.caseIndex, bc.revealed, tier, valueStr);

        string memory json = string(
            abi.encodePacked(
                '{"name":"Briefcase #',
                uint256(bc.caseIndex + 1).toString(),
                '","description":"Deal or No Deal Briefcase (Game ',
                bc.gameId.toString(),
                ')","attributes":[{"trait_type":"Case Number","value":',
                uint256(bc.caseIndex + 1).toString(),
                '},{"trait_type":"Status","value":"',
                status,
                '"},{"trait_type":"Tier","value":"',
                tierName,
                '"}',
                bc.revealed
                    ? string(abi.encodePacked(',{"trait_type":"Value","value":"', valueStr, '"}'))
                    : "",
                '],"image":"data:image/svg+xml;base64,',
                Base64.encode(bytes(svg)),
                '"}'
            )
        );

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function _generateSVG(uint8 caseIndex, bool revealed, CaseTier tier, string memory valueStr)
        internal
        pure
        returns (string memory)
    {
        string memory bgColor = _tierColor(tier);
        string memory borderColor = revealed ? "#FFD700" : "#8B7355";

        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400">',
                '<rect width="300" height="400" rx="20" fill="#1a1a2e"/>',
                // Briefcase body
                '<rect x="30" y="80" width="240" height="260" rx="15" fill="',
                bgColor,
                '" stroke="',
                borderColor,
                '" stroke-width="4"/>',
                // Handle
                '<path d="M110 80 L110 50 Q110 30 130 30 L170 30 Q190 30 190 50 L190 80" fill="none" stroke="',
                borderColor,
                '" stroke-width="4"/>',
                // Case number
                '<text x="150" y="180" text-anchor="middle" font-size="72" font-weight="bold" fill="white">',
                uint256(caseIndex + 1).toString(),
                "</text>",
                // Value or sealed indicator
                '<text x="150" y="300" text-anchor="middle" font-size="24" fill="',
                revealed ? "#FFD700" : "#666",
                '">',
                revealed ? valueStr : "SEALED",
                "</text>",
                // Clasp
                revealed
                    ? ""
                    : '<circle cx="150" cy="240" r="8" fill="#FFD700"/><rect x="146" y="232" width="8" height="12" rx="2" fill="#B8860B"/>',
                "</svg>"
            )
        );
    }

    function _tierName(CaseTier tier) internal pure returns (string memory) {
        if (tier == CaseTier.Penny) return "Penny";
        if (tier == CaseTier.Low) return "Low";
        if (tier == CaseTier.Mid) return "Mid";
        if (tier == CaseTier.High) return "High";
        return "Jackpot";
    }

    function _tierColor(CaseTier tier) internal pure returns (string memory) {
        if (tier == CaseTier.Penny) return "#2d2d2d";
        if (tier == CaseTier.Low) return "#1e3a5f";
        if (tier == CaseTier.Mid) return "#3d1e6d";
        if (tier == CaseTier.High) return "#6d1e1e";
        return "#6d5a1e";
    }

    function _formatEth(uint256 weiAmount) internal pure returns (string memory) {
        uint256 eth = weiAmount / 1e18;
        uint256 decimal = (weiAmount % 1e18) / 1e14; // 4 decimal places
        if (decimal == 0) {
            return string(abi.encodePacked(eth.toString(), " ETH"));
        }
        // Pad decimal to 4 digits
        string memory decStr = decimal.toString();
        bytes memory padded = new bytes(4);
        bytes memory decBytes = bytes(decStr);
        uint256 offset = 4 - decBytes.length;
        for (uint256 i; i < 4; ++i) {
            padded[i] = i < offset ? bytes1("0") : decBytes[i - offset];
        }
        return string(abi.encodePacked(eth.toString(), ".", string(padded), " ETH"));
    }
}
