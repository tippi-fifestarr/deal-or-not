// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

<<<<<<< docs/whitepaper-confidential
/// @dev Minimal interface to read DealOrNotConfidential game state.
=======
/// @dev Minimal interface to read DealOrNot game state.
>>>>>>> main
interface IDealOrNot {
    function getGameState(uint256 gameId) external view returns (
        address host,
        address player,
        uint8 mode,
        uint8 phase,
        uint8 playerCase,
        uint8 currentRound,
        uint8 totalCollapsed,
        uint256 bankerOffer,
        uint256 finalPayout,
        uint256 ethPerDollar,
<<<<<<< docs/whitepaper-confidential
=======
        uint256 commitBlock,
>>>>>>> main
        uint256[5] memory caseValues,
        bool[5] memory opened
    );
}

<<<<<<< docs/whitepaper-confidential
/// @notice IReceiver — Keystone Forwarder delivers CRE reports via this interface.
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title SponsorJackpot — CRE-powered sponsorship protocol for Deal or NOT
/// @notice Sponsors register with branding (name, logo), deposit ETH, and
///         assign themselves to games. A CRE log-trigger workflow adds to the
///         jackpot on each case opening. The jackpot only pays out if the player
///         goes "no deal" all the way. If the game expires (10 min timer), the
///         jackpot is returned to the sponsor.
///
///         "This episode of Deal or NOT is sponsored by..."
contract SponsorJackpot is Ownable, IReceiver {
=======
/// @title SponsorJackpot — CRE-powered sponsorship protocol for Deal or NOT
/// @notice Sponsors register with branding (name, logo), deposit ETH, and
///         assign themselves to games. A CRE cron workflow deposits a random
///         amount into the active game's jackpot every 30 seconds.
///         The jackpot only pays out if the player goes "no deal" all the way.
///
///         "This episode of Deal or NOT is sponsored by..."
contract SponsorJackpot is Ownable {
>>>>>>> main

    // ── Constants ──
    uint8 constant PHASE_GAME_OVER = 8;
    uint8 constant NUM_CASES = 5;

    // ── Structs ──
    struct Sponsor {
        string name;         // "Chainlink", "Aave", etc.
        string logoUrl;      // IPFS hash or URL to logo
        uint256 balance;     // ETH available for jackpots
        uint256 totalSpent;  // ETH distributed lifetime
        bool registered;
    }

    // ── State ──
    IDealOrNot public gameContract;
    address public keystoneForwarder;

    mapping(address => Sponsor) public sponsors;
    mapping(uint256 => address) public gameSponsor;   // gameId → sponsor address
    mapping(uint256 => uint256) public jackpots;      // gameId → accumulated cents
    mapping(uint256 => bool) public claimed;

    // ── Events ──
    event SponsorRegistered(address indexed sponsor, string name, string logoUrl, uint256 deposit);
    event SponsorToppedUp(address indexed sponsor, uint256 amount, uint256 newBalance);
    event GameSponsored(uint256 indexed gameId, address indexed sponsor, string name);
    event JackpotIncreased(uint256 indexed gameId, uint256 amountCents, uint256 newTotal);
    event JackpotClaimed(uint256 indexed gameId, address indexed player, uint256 cents, uint256 weiPaid);
<<<<<<< docs/whitepaper-confidential
    event JackpotCleared(uint256 indexed gameId, address indexed sponsor, uint256 amountCents);
=======
>>>>>>> main

    // ── Errors ──
    error NotAuthorized();
    error AlreadyRegistered();
    error NotRegistered();
    error GameAlreadySponsored();
    error NoSponsor();
    error GameNotOver();
    error DidNotGoAllTheWay();
    error NotPlayer();
    error AlreadyClaimed();
    error NoJackpot();
    error InsufficientSponsorBalance();
    error TransferFailed();

    // ── Constructor ──
    constructor(address _gameContract) Ownable(msg.sender) {
        gameContract = IDealOrNot(_gameContract);
    }

    // ════════════════════════════════════════════════════════
    //                  SPONSOR REGISTRATION
    // ════════════════════════════════════════════════════════

    /// @notice Register as a sponsor with branding. Deposit ETH for jackpots.
    function registerSponsor(string calldata name, string calldata logoUrl) external payable {
        if (sponsors[msg.sender].registered) revert AlreadyRegistered();
        sponsors[msg.sender] = Sponsor({
            name: name,
            logoUrl: logoUrl,
            balance: msg.value,
            totalSpent: 0,
            registered: true
        });
        emit SponsorRegistered(msg.sender, name, logoUrl, msg.value);
    }

    /// @notice Add more ETH to your sponsor balance.
    function topUp() external payable {
        if (!sponsors[msg.sender].registered) revert NotRegistered();
        sponsors[msg.sender].balance += msg.value;
        emit SponsorToppedUp(msg.sender, msg.value, sponsors[msg.sender].balance);
    }

    /// @notice Assign yourself as sponsor for a game.
    function sponsorGame(uint256 gameId) external {
        if (!sponsors[msg.sender].registered) revert NotRegistered();
        if (gameSponsor[gameId] != address(0)) revert GameAlreadySponsored();
        gameSponsor[gameId] = msg.sender;
        emit GameSponsored(gameId, msg.sender, sponsors[msg.sender].name);
    }

    // ════════════════════════════════════════════════════════
    //                     CRE WRITES
    // ════════════════════════════════════════════════════════

<<<<<<< docs/whitepaper-confidential
    /// @notice Add to a game's jackpot. Called by CRE log-trigger workflow on case opens.
    function addToJackpot(uint256 gameId, uint256 amountCents) external {
        if (msg.sender != keystoneForwarder && msg.sender != owner()) revert NotAuthorized();
        _addToJackpot(gameId, amountCents);
    }

    /// @notice Clear a game's jackpot and return to sponsor. Called by CRE when game expires.
    function clearExpiredJackpot(uint256 gameId) external {
        if (msg.sender != keystoneForwarder && msg.sender != owner()) revert NotAuthorized();
        _clearExpiredJackpot(gameId);
    }

    // ════════════════════════════════════════════════════════
    //              IReceiver (KEYSTONE FORWARDER)
    // ════════════════════════════════════════════════════════

    /// @notice Called by KeystoneForwarder to deliver CRE workflow reports.
    function onReport(bytes calldata /* metadata */, bytes calldata report) external override {
        if (msg.sender != keystoneForwarder) revert NotAuthorized();

        bytes4 selector = bytes4(report[:4]);

        if (selector == this.addToJackpot.selector) {
            (uint256 gameId, uint256 amountCents) =
                abi.decode(report[4:], (uint256, uint256));
            _addToJackpot(gameId, amountCents);
        } else if (selector == this.clearExpiredJackpot.selector) {
            (uint256 gameId) = abi.decode(report[4:], (uint256));
            _clearExpiredJackpot(gameId);
        } else {
            revert("Unknown report selector");
        }
    }

    /// @notice ERC165 — declares support for IReceiver.
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId
            || interfaceId == 0x01ffc9a7; // IERC165
=======
    /// @notice Add to a game's jackpot. Called by CRE cron workflow every 30s.
    /// @dev Requires game to have an assigned sponsor.
    function addToJackpot(uint256 gameId, uint256 amountCents) external {
        if (msg.sender != keystoneForwarder && msg.sender != owner()) revert NotAuthorized();
        if (gameSponsor[gameId] == address(0)) revert NoSponsor();
        jackpots[gameId] += amountCents;
        emit JackpotIncreased(gameId, amountCents, jackpots[gameId]);
>>>>>>> main
    }

    // ════════════════════════════════════════════════════════
    //                     PLAYER CLAIMS
    // ════════════════════════════════════════════════════════

    /// @notice Claim the jackpot after going "no deal" all the way.
    /// @dev Verifies the player completed the final reveal (totalCollapsed == 5).
    ///      Deducts ETH from the game's sponsor balance.
    function claimJackpot(uint256 gameId) external {
        if (claimed[gameId]) revert AlreadyClaimed();

        uint256 pot = jackpots[gameId];
        if (pot == 0) revert NoJackpot();

        address sponsorAddr = gameSponsor[gameId];
        if (sponsorAddr == address(0)) revert NoSponsor();

        (
            , // host
            address player,
            , // mode
            uint8 phase,
            , // playerCase
            , // currentRound
            uint8 totalCollapsed,
            , // bankerOffer
            , // finalPayout
            uint256 ethPerDollar,
<<<<<<< docs/whitepaper-confidential
=======
            , // commitBlock
>>>>>>> main
            , // caseValues
              // opened
        ) = gameContract.getGameState(gameId);

        if (phase != PHASE_GAME_OVER) revert GameNotOver();
        if (totalCollapsed != NUM_CASES) revert DidNotGoAllTheWay();
        if (msg.sender != player) revert NotPlayer();

        // Convert cents → ETH using the game's price snapshot
        uint256 weiAmount = (pot * ethPerDollar) / 100;

        // Check sponsor can cover it
        Sponsor storage s = sponsors[sponsorAddr];
        if (s.balance < weiAmount) revert InsufficientSponsorBalance();

        // State updates before transfer
        claimed[gameId] = true;
        jackpots[gameId] = 0;
        s.balance -= weiAmount;
        s.totalSpent += weiAmount;

        (bool ok,) = payable(player).call{value: weiAmount}("");
        if (!ok) revert TransferFailed();

        emit JackpotClaimed(gameId, player, pot, weiAmount);
    }

    // ════════════════════════════════════════════════════════
    //                       VIEWS
    // ════════════════════════════════════════════════════════

    /// @notice Get the current jackpot for a game, in cents.
    function getJackpot(uint256 gameId) external view returns (uint256) {
        return jackpots[gameId];
    }

    /// @notice Get sponsor info for a game (name, logo, address).
    function getGameSponsorInfo(uint256 gameId) external view returns (
        string memory name,
        string memory logoUrl,
        address sponsorAddr
    ) {
        sponsorAddr = gameSponsor[gameId];
        if (sponsorAddr != address(0)) {
            Sponsor storage s = sponsors[sponsorAddr];
            name = s.name;
            logoUrl = s.logoUrl;
        }
    }

    /// @notice Get a sponsor's remaining ETH balance.
    function getSponsorBalance(address sponsor) external view returns (uint256) {
        return sponsors[sponsor].balance;
    }

    // ════════════════════════════════════════════════════════
    //                       ADMIN
    // ════════════════════════════════════════════════════════

    /// @notice Set the Keystone Forwarder address (CRE DON).
    function setKeystoneForwarder(address _forwarder) external onlyOwner {
        keystoneForwarder = _forwarder;
    }

    /// @notice Owner can rescue ETH (safety valve).
    function rescueETH(address to) external onlyOwner {
        uint256 bal = address(this).balance;
        (bool ok,) = payable(to).call{value: bal}("");
        if (!ok) revert TransferFailed();
    }
<<<<<<< docs/whitepaper-confidential

    // ════════════════════════════════════════════════════════
    //                  INTERNAL HELPERS
    // ════════════════════════════════════════════════════════

    function _addToJackpot(uint256 gameId, uint256 amountCents) internal {
        if (gameSponsor[gameId] == address(0)) revert NoSponsor();
        jackpots[gameId] += amountCents;
        emit JackpotIncreased(gameId, amountCents, jackpots[gameId]);
    }

    /// @dev Clear jackpot on game expiry. Zeros the cents ledger so the player
    ///      can't claim. No ETH movement needed — addToJackpot only increments
    ///      a cents counter; the sponsor's ETH balance is never debited until
    ///      a successful claimJackpot(). Clearing just cancels the promise.
    function _clearExpiredJackpot(uint256 gameId) internal {
        if (claimed[gameId]) revert AlreadyClaimed();

        uint256 pot = jackpots[gameId];
        if (pot == 0) revert NoJackpot();

        address sponsorAddr = gameSponsor[gameId];
        if (sponsorAddr == address(0)) revert NoSponsor();

        // Verify game is over (expired games are set to GameOver by DealOrNotConfidential)
        (, , , uint8 phase, , , , , , , ,) = gameContract.getGameState(gameId);
        if (phase != PHASE_GAME_OVER) revert GameNotOver();

        // Zero the cents ledger — sponsor's ETH balance is unaffected
        claimed[gameId] = true;
        jackpots[gameId] = 0;
        emit JackpotCleared(gameId, sponsorAddr, pot);
    }
=======
>>>>>>> main
}
