import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("AgentRegistry", function () {
  let registry: AgentRegistry;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let agentWallet1: SignerWithAddress;
  let agentWallet2: SignerWithAddress;
  let agentWallet3: SignerWithAddress;

  beforeEach(async function () {
    [owner, user1, user2, agentWallet1, agentWallet2, agentWallet3] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("AgentRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  // ──────────── Registration ────────────

  describe("Register Agent", function () {
    it("registers an agent with valid params", async function () {
      await expect(
        registry.connect(user1).registerAgent("ipfs://strategy1", 0, agentWallet1.address)
      )
        .to.emit(registry, "AgentRegistered")
        .withArgs(0n, user1.address, agentWallet1.address, 0);

      const agent = await registry.getAgent(0);
      expect(agent.owner).to.equal(user1.address);
      expect(agent.wallet).to.equal(agentWallet1.address);
      expect(agent.strategyURI).to.equal("ipfs://strategy1");
      expect(agent.agentType).to.equal(0);
      expect(agent.gamesPlayed).to.equal(0n);
      expect(agent.totalProfitCents).to.equal(0n);
      expect(agent.active).to.equal(true);
    });

    it("registers player type agent (type 1)", async function () {
      await registry.connect(user1).registerAgent("player-strat", 1, agentWallet1.address);
      const agent = await registry.getAgent(0);
      expect(agent.agentType).to.equal(1);
    });

    it("registers both type agent (type 2)", async function () {
      await registry.connect(user1).registerAgent("both-strat", 2, agentWallet1.address);
      const agent = await registry.getAgent(0);
      expect(agent.agentType).to.equal(2);
    });

    it("rejects invalid agent type (> 2)", async function () {
      await expect(
        registry.connect(user1).registerAgent("bad", 3, agentWallet1.address)
      ).to.be.revertedWithCustomError(registry, "InvalidAgentType");
    });

    it("rejects zero address wallet", async function () {
      await expect(
        registry.connect(user1).registerAgent("bad", 0, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registry, "InvalidWallet");
    });

    it("increments agent IDs", async function () {
      await registry.connect(user1).registerAgent("s1", 0, agentWallet1.address);
      await registry.connect(user1).registerAgent("s2", 1, agentWallet2.address);
      expect(await registry.nextAgentId()).to.equal(2n);
    });

    it("rejects duplicate wallet registration", async function () {
      await registry.connect(user1).registerAgent("s1", 0, agentWallet1.address);
      await expect(
        registry.connect(user2).registerAgent("s2", 1, agentWallet1.address)
      ).to.be.revertedWithCustomError(registry, "WalletAlreadyRegistered");
    });
  });

  // ──────────── Funding ────────────

  describe("Fund Agent", function () {
    beforeEach(async function () {
      await registry.connect(user1).registerAgent("strat", 0, agentWallet1.address);
    });

    it("transfers ETH to agent wallet", async function () {
      const balBefore = await ethers.provider.getBalance(agentWallet1.address);
      const fundAmount = ethers.parseEther("1.0");

      await expect(registry.connect(user1).fundAgent(0, { value: fundAmount }))
        .to.emit(registry, "AgentFunded")
        .withArgs(0n, fundAmount);

      const balAfter = await ethers.provider.getBalance(agentWallet1.address);
      expect(balAfter - balBefore).to.equal(fundAmount);
    });

    it("reverts for non-existent agent", async function () {
      await expect(
        registry.connect(user1).fundAgent(999, { value: ethers.parseEther("1.0") })
      ).to.be.revertedWithCustomError(registry, "AgentNotFound");
    });

    it("reverts for inactive agent", async function () {
      await registry.connect(user1).deactivateAgent(0);
      await expect(
        registry.connect(user1).fundAgent(0, { value: ethers.parseEther("1.0") })
      ).to.be.revertedWithCustomError(registry, "AgentNotActive");
    });
  });

  // ──────────── Record Results ────────────

  describe("Record Result", function () {
    beforeEach(async function () {
      await registry.connect(user1).registerAgent("strat", 0, agentWallet1.address);
    });

    it("records positive profit", async function () {
      await expect(registry.recordResult(0, 42, 500))
        .to.emit(registry, "GameResultRecorded")
        .withArgs(0n, 42n, 500n);

      const agent = await registry.getAgent(0);
      expect(agent.gamesPlayed).to.equal(1n);
      expect(agent.totalProfitCents).to.equal(500n);
    });

    it("records negative profit (loss)", async function () {
      await registry.recordResult(0, 1, -100);
      const agent = await registry.getAgent(0);
      expect(agent.totalProfitCents).to.equal(-100n);
    });

    it("accumulates results across multiple games", async function () {
      await registry.recordResult(0, 1, 500);
      await registry.recordResult(0, 2, -200);
      await registry.recordResult(0, 3, 300);

      const agent = await registry.getAgent(0);
      expect(agent.gamesPlayed).to.equal(3n);
      expect(agent.totalProfitCents).to.equal(600n);
    });

    it("reverts for non-existent agent", async function () {
      await expect(
        registry.recordResult(999, 1, 100)
      ).to.be.revertedWithCustomError(registry, "AgentNotFound");
    });

    it("reverts for inactive agent", async function () {
      await registry.connect(user1).deactivateAgent(0);
      await expect(
        registry.recordResult(0, 1, 100)
      ).to.be.revertedWithCustomError(registry, "AgentNotActive");
    });
  });

  // ──────────── Deactivation ────────────

  describe("Deactivate Agent", function () {
    beforeEach(async function () {
      await registry.connect(user1).registerAgent("strat", 0, agentWallet1.address);
    });

    it("owner can deactivate their agent", async function () {
      await expect(registry.connect(user1).deactivateAgent(0))
        .to.emit(registry, "AgentDeactivated")
        .withArgs(0n);

      const agent = await registry.getAgent(0);
      expect(agent.active).to.equal(false);
    });

    it("non-owner cannot deactivate agent", async function () {
      await expect(
        registry.connect(user2).deactivateAgent(0)
      ).to.be.revertedWithCustomError(registry, "NotAgentOwner");
    });

    it("cannot deactivate already inactive agent", async function () {
      await registry.connect(user1).deactivateAgent(0);
      await expect(
        registry.connect(user1).deactivateAgent(0)
      ).to.be.revertedWithCustomError(registry, "AgentNotActive");
    });

    it("reverts for non-existent agent", async function () {
      await expect(
        registry.connect(user1).deactivateAgent(999)
      ).to.be.revertedWithCustomError(registry, "AgentNotFound");
    });
  });

  // ──────────── View Functions ────────────

  describe("Get Owner Agents", function () {
    it("returns all agents for an owner", async function () {
      await registry.connect(user1).registerAgent("s1", 0, agentWallet1.address);
      await registry.connect(user1).registerAgent("s2", 1, agentWallet2.address);
      await registry.connect(user2).registerAgent("s3", 2, agentWallet3.address);

      const user1Agents = await registry.getOwnerAgents(user1.address);
      expect(user1Agents.length).to.equal(2);
      expect(user1Agents[0]).to.equal(0n);
      expect(user1Agents[1]).to.equal(1n);

      const user2Agents = await registry.getOwnerAgents(user2.address);
      expect(user2Agents.length).to.equal(1);
      expect(user2Agents[0]).to.equal(2n);
    });

    it("returns empty array for owner with no agents", async function () {
      const agents = await registry.getOwnerAgents(user1.address);
      expect(agents.length).to.equal(0);
    });
  });

  describe("Leaderboard", function () {
    beforeEach(async function () {
      // Register 3 agents
      await registry.connect(user1).registerAgent("s1", 0, agentWallet1.address);
      await registry.connect(user1).registerAgent("s2", 1, agentWallet2.address);
      await registry.connect(user2).registerAgent("s3", 2, agentWallet3.address);

      // Record results: agent 0 = +300, agent 1 = +800, agent 2 = -100
      await registry.recordResult(0, 1, 300);
      await registry.recordResult(1, 2, 800);
      await registry.recordResult(2, 3, -100);
    });

    it("returns agents sorted by profit descending", async function () {
      const [topAgents, topIds] = await registry.getLeaderboard(10);
      expect(topAgents.length).to.equal(3);
      expect(topIds[0]).to.equal(1n); // +800
      expect(topIds[1]).to.equal(0n); // +300
      expect(topIds[2]).to.equal(2n); // -100
    });

    it("limits results to requested count", async function () {
      const [topAgents, topIds] = await registry.getLeaderboard(2);
      expect(topAgents.length).to.equal(2);
      expect(topIds[0]).to.equal(1n); // +800
      expect(topIds[1]).to.equal(0n); // +300
    });

    it("returns empty when no agents have played", async function () {
      // Deploy fresh registry
      const Factory = await ethers.getContractFactory("AgentRegistry");
      const freshRegistry = await Factory.deploy();
      await freshRegistry.waitForDeployment();

      await freshRegistry.connect(user1).registerAgent("s1", 0, agentWallet1.address);

      const [topAgents, topIds] = await freshRegistry.getLeaderboard(10);
      expect(topAgents.length).to.equal(0);
    });

    it("handles limit larger than total agents", async function () {
      const [topAgents] = await registry.getLeaderboard(100);
      expect(topAgents.length).to.equal(3);
    });
  });

  // ──────────── Wallet Mapping ────────────

  describe("Wallet To Agent", function () {
    it("maps wallet to agent ID", async function () {
      await registry.connect(user1).registerAgent("s1", 0, agentWallet1.address);
      const agentId = await registry.walletToAgent(agentWallet1.address);
      expect(agentId).to.equal(0n);
    });

    it("tracks wallet registration status", async function () {
      expect(await registry.walletRegistered(agentWallet1.address)).to.equal(false);
      await registry.connect(user1).registerAgent("s1", 0, agentWallet1.address);
      expect(await registry.walletRegistered(agentWallet1.address)).to.equal(true);
    });
  });
});
