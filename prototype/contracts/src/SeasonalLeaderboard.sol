// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentRegistry} from "./AgentRegistry.sol";

/// @title SeasonalLeaderboard
/// @notice Monthly agent tournaments with point-based ranking
/// @dev Contributes to Autonomous Agents track ($5K+ prizes)
///      Agents earn points for wins, high earnings, consistency
contract SeasonalLeaderboard {
    // ── Events ──
    event SeasonStarted(uint256 indexed seasonId, uint256 startTime, uint256 endTime);
    event SeasonEnded(uint256 indexed seasonId, uint256[] topAgents);
    event PointsAwarded(
        uint256 indexed seasonId,
        uint256 indexed agentId,
        uint256 points,
        string reason
    );
    event PrizeDistributed(
        uint256 indexed seasonId,
        uint256 indexed agentId,
        uint256 rank,
        uint256 amount
    );

    // ── Structs ──
    struct Season {
        uint256 startTime;
        uint256 endTime;
        uint256 totalPrizePool;
        uint256 participatingAgents;
        bool isActive;
        bool prizesDistributed;
        mapping(uint256 => uint256) agentPoints;      // agentId => points
        mapping(uint256 => AgentSeasonStats) stats;   // agentId => stats
        uint256[] rankedAgents;                        // Sorted by points (computed at season end)
    }

    struct AgentSeasonStats {
        uint256 gamesPlayed;
        uint256 gamesWon;
        uint256 totalEarnings;
        uint256 highestSingleGame;
        uint256 points;
    }

    struct LeaderboardEntry {
        uint256 agentId;
        uint256 points;
        uint256 gamesPlayed;
        uint256 gamesWon;
        uint256 totalEarnings;
        uint256 rank;
    }

    // ── Constants ──
    uint256 public constant SEASON_DURATION = 30 days;
    uint256 public constant POINTS_PER_WIN = 100;
    uint256 public constant POINTS_PER_DOLLAR_EARNED = 10;  // 10 points per $1
    uint256 public constant BONUS_PERFECT_GAME = 500;       // Bonus for $1.00 win
    uint256 public constant TOP_AGENTS_COUNT = 10;

    // ── State ──
    AgentRegistry public immutable agentRegistry;

    mapping(uint256 => Season) public seasons;
    uint256 public currentSeasonId;
    uint256 public totalSeasons;

    address public admin;
    mapping(address => bool) public authorizedRecorders;  // Contracts that can record game results

    // ── Errors ──
    error SeasonNotActive();
    error SeasonAlreadyActive();
    error Unauthorized();
    error InvalidSeason();
    error PrizesAlreadyDistributed();
    error InsufficientPrizePool();

    // ── Modifiers ──
    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyAuthorized() {
        if (!authorizedRecorders[msg.sender] && msg.sender != admin) revert Unauthorized();
        _;
    }

    // ── Constructor ──
    constructor(address _agentRegistry) {
        agentRegistry = AgentRegistry(_agentRegistry);
        admin = msg.sender;
    }

    // ── Season Management ──

    /// @notice Start a new season
    function startSeason() external onlyAdmin returns (uint256 seasonId) {
        if (currentSeasonId > 0 && seasons[currentSeasonId].isActive) {
            revert SeasonAlreadyActive();
        }

        seasonId = ++totalSeasons;
        currentSeasonId = seasonId;

        Season storage season = seasons[seasonId];
        season.startTime = block.timestamp;
        season.endTime = block.timestamp + SEASON_DURATION;
        season.isActive = true;

        emit SeasonStarted(seasonId, season.startTime, season.endTime);
    }

    /// @notice End the current season and compute rankings
    function endSeason() external onlyAdmin {
        if (currentSeasonId == 0) revert InvalidSeason();

        Season storage season = seasons[currentSeasonId];
        if (!season.isActive) revert SeasonNotActive();
        if (block.timestamp < season.endTime) revert SeasonNotActive();

        season.isActive = false;

        // Compute rankings (simple approach for hackathon)
        // In production, use off-chain computation + Merkle proof verification
        uint256[] memory topAgents = _computeRankings(currentSeasonId);
        season.rankedAgents = topAgents;

        emit SeasonEnded(currentSeasonId, topAgents);
    }

    /// @notice Record game result and award points
    /// @param agentId Agent that played
    /// @param won Whether agent won
    /// @param earnings Agent's earnings in cents
    function recordGameResult(
        uint256 agentId,
        bool won,
        uint256 earnings
    ) external onlyAuthorized {
        if (currentSeasonId == 0 || !seasons[currentSeasonId].isActive) {
            return; // No active season, skip recording
        }

        Season storage season = seasons[currentSeasonId];
        AgentSeasonStats storage stats = season.stats[agentId];

        // Update stats
        stats.gamesPlayed++;
        if (won) stats.gamesWon++;
        stats.totalEarnings += earnings;
        if (earnings > stats.highestSingleGame) {
            stats.highestSingleGame = earnings;
        }

        // Calculate points
        uint256 points = 0;

        // Base points for winning
        if (won) {
            points += POINTS_PER_WIN;
            emit PointsAwarded(currentSeasonId, agentId, POINTS_PER_WIN, "Win");
        }

        // Points for earnings (scaled to dollars)
        uint256 earningsPoints = (earnings * POINTS_PER_DOLLAR_EARNED) / 100;
        points += earningsPoints;
        if (earningsPoints > 0) {
            emit PointsAwarded(currentSeasonId, agentId, earningsPoints, "Earnings");
        }

        // Bonus for perfect game ($1.00 = 100 cents)
        if (earnings >= 100) {
            points += BONUS_PERFECT_GAME;
            emit PointsAwarded(currentSeasonId, agentId, BONUS_PERFECT_GAME, "Perfect Game");
        }

        // Award points
        season.agentPoints[agentId] += points;
        stats.points += points;

        // Track participating agents
        if (stats.gamesPlayed == 1) {
            season.participatingAgents++;
        }
    }

    // ── Prize Distribution ──

    /// @notice Add prize pool for current season
    function addPrizePool() external payable onlyAdmin {
        if (currentSeasonId == 0) revert InvalidSeason();
        seasons[currentSeasonId].totalPrizePool += msg.value;
    }

    /// @notice Distribute prizes to top agents
    /// @dev Prize distribution: 1st: 50%, 2nd: 25%, 3rd: 15%, 4-10: 10% split
    function distributePrizes() external onlyAdmin {
        if (currentSeasonId == 0) revert InvalidSeason();

        Season storage season = seasons[currentSeasonId];
        if (season.isActive) revert SeasonNotActive();
        if (season.prizesDistributed) revert PrizesAlreadyDistributed();
        if (season.totalPrizePool == 0) revert InsufficientPrizePool();

        uint256[] memory topAgents = season.rankedAgents;
        uint256 prizePool = season.totalPrizePool;

        // Distribute to top 3 + remaining 7
        uint256 numWinners = topAgents.length < TOP_AGENTS_COUNT
            ? topAgents.length
            : TOP_AGENTS_COUNT;

        for (uint256 i = 0; i < numWinners; i++) {
            uint256 agentId = topAgents[i];
            address agentOwner = agentRegistry.getAgent(agentId).owner;
            uint256 prize;

            if (i == 0) {
                prize = (prizePool * 50) / 100;  // 50%
            } else if (i == 1) {
                prize = (prizePool * 25) / 100;  // 25%
            } else if (i == 2) {
                prize = (prizePool * 15) / 100;  // 15%
            } else {
                // Remaining 7 split 10%
                prize = (prizePool * 10) / 100 / 7;
            }

            (bool success, ) = payable(agentOwner).call{value: prize}("");
            require(success, "Prize transfer failed");

            emit PrizeDistributed(currentSeasonId, agentId, i + 1, prize);
        }

        season.prizesDistributed = true;
    }

    // ── Internal Functions ──

    /// @notice Compute rankings for a season (simple bubble sort for hackathon)
    function _computeRankings(uint256 seasonId) internal view returns (uint256[] memory) {
        Season storage season = seasons[seasonId];

        // Collect all participating agents
        uint256 participantCount = 0;
        uint256[] memory participants = new uint256[](season.participatingAgents);

        // Linear scan to find participants (inefficient but simple for demo)
        for (uint256 i = 1; i < 1000 && participantCount < season.participatingAgents; i++) {
            if (season.stats[i].gamesPlayed > 0) {
                participants[participantCount] = i;
                participantCount++;
            }
        }

        // Bubble sort by points (descending)
        for (uint256 i = 0; i < participantCount; i++) {
            for (uint256 j = i + 1; j < participantCount; j++) {
                if (season.agentPoints[participants[i]] < season.agentPoints[participants[j]]) {
                    uint256 temp = participants[i];
                    participants[i] = participants[j];
                    participants[j] = temp;
                }
            }
        }

        // Return top N
        uint256 topN = participantCount < TOP_AGENTS_COUNT
            ? participantCount
            : TOP_AGENTS_COUNT;

        uint256[] memory topAgents = new uint256[](topN);
        for (uint256 i = 0; i < topN; i++) {
            topAgents[i] = participants[i];
        }

        return topAgents;
    }

    // ── View Functions ──

    /// @notice Get current season leaderboard
    function getCurrentLeaderboard(uint256 limit) external view returns (LeaderboardEntry[] memory) {
        if (currentSeasonId == 0) {
            return new LeaderboardEntry[](0);
        }

        return getSeasonLeaderboard(currentSeasonId, limit);
    }

    /// @notice Get leaderboard for a specific season
    function getSeasonLeaderboard(
        uint256 seasonId,
        uint256 limit
    ) public view returns (LeaderboardEntry[] memory) {
        Season storage season = seasons[seasonId];

        // If season ended, use pre-computed rankings
        if (!season.isActive && season.rankedAgents.length > 0) {
            uint256 count = season.rankedAgents.length < limit
                ? season.rankedAgents.length
                : limit;

            LeaderboardEntry[] memory leaderboard = new LeaderboardEntry[](count);

            for (uint256 i = 0; i < count; i++) {
                uint256 agentId = season.rankedAgents[i];
                AgentSeasonStats memory stats = season.stats[agentId];

                leaderboard[i] = LeaderboardEntry({
                    agentId: agentId,
                    points: stats.points,
                    gamesPlayed: stats.gamesPlayed,
                    gamesWon: stats.gamesWon,
                    totalEarnings: stats.totalEarnings,
                    rank: i + 1
                });
            }

            return leaderboard;
        }

        // Season still active - return empty for now
        // In production, compute live rankings
        return new LeaderboardEntry[](0);
    }

    /// @notice Get agent stats for current season
    function getCurrentAgentStats(uint256 agentId) external view returns (AgentSeasonStats memory) {
        if (currentSeasonId == 0) {
            return AgentSeasonStats(0, 0, 0, 0, 0);
        }
        return seasons[currentSeasonId].stats[agentId];
    }

    /// @notice Check if season is active
    function isSeasonActive() external view returns (bool) {
        return currentSeasonId > 0 && seasons[currentSeasonId].isActive;
    }

    // ── Admin Functions ──

    /// @notice Authorize a contract to record game results
    function authorizeRecorder(address recorder) external onlyAdmin {
        authorizedRecorders[recorder] = true;
    }

    /// @notice Revoke recorder authorization
    function revokeRecorder(address recorder) external onlyAdmin {
        authorizedRecorders[recorder] = false;
    }

    // ── Receive ETH ──
    receive() external payable {
        if (currentSeasonId > 0) {
            seasons[currentSeasonId].totalPrizePool += msg.value;
        }
    }
}
