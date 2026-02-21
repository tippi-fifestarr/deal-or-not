// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract AgentRegistry {
    struct Agent {
        address owner;
        address wallet;
        string strategyURI;
        uint8 agentType;       // 0=banker, 1=player, 2=both
        uint256 gamesPlayed;
        int256 totalProfitCents;
        bool active;
        uint256 createdAt;
    }

    mapping(uint256 => Agent) public agents;
    uint256 public nextAgentId;
    mapping(address => uint256) public walletToAgent;
    mapping(address => uint256[]) public ownerAgents;

    mapping(address => bool) public walletRegistered;

    event AgentRegistered(uint256 indexed agentId, address indexed owner, address wallet, uint8 agentType);
    event AgentFunded(uint256 indexed agentId, uint256 amount);
    event AgentDeactivated(uint256 indexed agentId);
    event GameResultRecorded(uint256 indexed agentId, uint256 indexed gameId, int256 profitCents);

    error InvalidAgentType(uint8 agentType);
    error AgentNotActive(uint256 agentId);
    error NotAgentOwner(uint256 agentId, address caller);
    error WalletAlreadyRegistered(address wallet);
    error InvalidWallet();
    error AgentNotFound(uint256 agentId);

    function registerAgent(
        string calldata strategyURI,
        uint8 agentType,
        address wallet
    ) external returns (uint256 agentId) {
        if (agentType > 2) revert InvalidAgentType(agentType);
        if (wallet == address(0)) revert InvalidWallet();
        if (walletRegistered[wallet]) revert WalletAlreadyRegistered(wallet);

        agentId = nextAgentId++;

        agents[agentId] = Agent({
            owner: msg.sender,
            wallet: wallet,
            strategyURI: strategyURI,
            agentType: agentType,
            gamesPlayed: 0,
            totalProfitCents: 0,
            active: true,
            createdAt: block.timestamp
        });

        walletToAgent[wallet] = agentId;
        walletRegistered[wallet] = true;
        ownerAgents[msg.sender].push(agentId);

        emit AgentRegistered(agentId, msg.sender, wallet, agentType);
    }

    function fundAgent(uint256 agentId) external payable {
        Agent storage agent = agents[agentId];
        if (agent.wallet == address(0)) revert AgentNotFound(agentId);
        if (!agent.active) revert AgentNotActive(agentId);

        (bool success, ) = agent.wallet.call{value: msg.value}("");
        require(success, "ETH transfer failed");

        emit AgentFunded(agentId, msg.value);
    }

    function recordResult(
        uint256 agentId,
        uint256 gameId,
        int256 profitCents
    ) external {
        Agent storage agent = agents[agentId];
        if (agent.wallet == address(0)) revert AgentNotFound(agentId);
        if (!agent.active) revert AgentNotActive(agentId);

        agent.gamesPlayed++;
        agent.totalProfitCents += profitCents;

        emit GameResultRecorded(agentId, gameId, profitCents);
    }

    function deactivateAgent(uint256 agentId) external {
        Agent storage agent = agents[agentId];
        if (agent.wallet == address(0)) revert AgentNotFound(agentId);
        if (msg.sender != agent.owner) revert NotAgentOwner(agentId, msg.sender);
        if (!agent.active) revert AgentNotActive(agentId);

        agent.active = false;

        emit AgentDeactivated(agentId);
    }

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }

    function getOwnerAgents(address _owner) external view returns (uint256[] memory) {
        return ownerAgents[_owner];
    }

    function getLeaderboard(uint256 limit)
        external
        view
        returns (Agent[] memory topAgents, uint256[] memory topIds)
    {
        uint256 total = nextAgentId;
        if (limit > total) {
            limit = total;
        }

        uint256[] memory candidateIds = new uint256[](total);
        int256[] memory candidateProfits = new int256[](total);
        uint256 candidateCount = 0;

        for (uint256 i = 0; i < total; i++) {
            if (agents[i].gamesPlayed > 0) {
                candidateIds[candidateCount] = i;
                candidateProfits[candidateCount] = agents[i].totalProfitCents;
                candidateCount++;
            }
        }

        if (limit > candidateCount) {
            limit = candidateCount;
        }

        for (uint256 i = 0; i < limit; i++) {
            uint256 bestIdx = i;
            for (uint256 j = i + 1; j < candidateCount; j++) {
                if (candidateProfits[j] > candidateProfits[bestIdx]) {
                    bestIdx = j;
                }
            }
            if (bestIdx != i) {
                (candidateIds[i], candidateIds[bestIdx]) = (candidateIds[bestIdx], candidateIds[i]);
                (candidateProfits[i], candidateProfits[bestIdx]) = (candidateProfits[bestIdx], candidateProfits[i]);
            }
        }

        topAgents = new Agent[](limit);
        topIds = new uint256[](limit);
        for (uint256 i = 0; i < limit; i++) {
            topIds[i] = candidateIds[i];
            topAgents[i] = agents[candidateIds[i]];
        }
    }

    receive() external payable {}
}
