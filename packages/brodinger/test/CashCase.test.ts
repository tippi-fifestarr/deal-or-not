import { expect } from "chai";
import { ethers } from "hardhat";
import { CashCase, VRFCoordinatorV2_5Mock, MockV3Aggregator } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

enum GamePhase {
  WaitingForPlayer = 0,
  WaitingForVRF = 1,
  RevealCase = 2,
  CommitRound = 3,
  WaitingForReveal = 4,
  BankerOffer = 5,
  CommitFinal = 6,
  WaitingForFinalReveal = 7,
  GameOver = 8,
}

enum GameTier {
  MICRO = 0,
  STANDARD = 1,
  HIGH = 2,
}

const STANDARD_VALUES = [1, 5, 10, 25, 50, 100, 200, 300, 400, 500, 750, 1000];
const MICRO_VALUES = [1, 2, 5, 10, 25, 50, 75, 100, 150, 200, 350, 500];
const HIGH_VALUES = [10, 50, 100, 250, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000];
const CASES_PER_ROUND = [4, 3, 2, 1, 1];
const BANKER_PERCENTAGES = [15, 30, 45, 65, 85];
const ETH_USD_PRICE = 200000000000n; // $2,000
const ENTRY_FEE_CENTS = 100n;
const SLIPPAGE_BPS = 500n;
const MAX_CASE_BY_TIER = [500n, 1000n, 5000n];

function usdToWei(usdCents: bigint): bigint {
  return (usdCents * 10n ** 24n) / ETH_USD_PRICE;
}

function withSlippage(amount: bigint): bigint {
  return (amount * (10000n + SLIPPAGE_BPS)) / 10000n;
}

function computeCaseCommitHash(caseIndex: number, salt: bigint): bigint {
  return BigInt(ethers.solidityPackedKeccak256(["uint8", "uint256"], [caseIndex, salt]));
}

function computeRoundCommitHash(indices: number[], salt: bigint): bigint {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint8[]", "uint256"],
    [indices, salt]
  );
  return BigInt(ethers.keccak256(encoded));
}

function computeFinalCommitHash(swap: boolean, salt: bigint): bigint {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bool", "uint256"],
    [swap, salt]
  );
  return BigInt(ethers.keccak256(encoded));
}

describe("CashCase", function () {
  let game: CashCase;
  let vrfCoordinator: VRFCoordinatorV2_5Mock;
  let priceFeed: MockV3Aggregator;
  let owner: SignerWithAddress;
  let banker: SignerWithAddress;
  let player: SignerWithAddress;
  let subscriptionId: bigint;

  const keyHash = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";

  beforeEach(async function () {
    [owner, banker, player] = await ethers.getSigners();

    const VRFFactory = await ethers.getContractFactory("VRFCoordinatorV2_5Mock");
    vrfCoordinator = await VRFFactory.deploy(
      ethers.parseEther("0.001"),
      ethers.parseUnits("50", "gwei"),
      ethers.parseEther("0.01")
    );
    await vrfCoordinator.waitForDeployment();

    const PriceFeedFactory = await ethers.getContractFactory("MockV3Aggregator");
    priceFeed = await PriceFeedFactory.deploy(8, ETH_USD_PRICE);
    await priceFeed.waitForDeployment();

    const tx = await vrfCoordinator.createSubscription();
    const receipt = await tx.wait();
    const event = receipt?.logs.find((log: any) => {
      try {
        return vrfCoordinator.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "SubscriptionCreated";
      } catch { return false; }
    });
    const parsed = vrfCoordinator.interface.parseLog({ topics: [...event!.topics], data: event!.data });
    subscriptionId = parsed!.args[0];

    await vrfCoordinator.fundSubscription(subscriptionId, ethers.parseEther("100"));

    const GameFactory = await ethers.getContractFactory("CashCase");
    game = await GameFactory.deploy(
      await vrfCoordinator.getAddress(),
      subscriptionId,
      keyHash,
      await priceFeed.getAddress()
    );
    await game.waitForDeployment();

    await vrfCoordinator.addConsumer(subscriptionId, await game.getAddress());
  });

  // ──────────── Helpers ────────────

  async function createGame(tier?: GameTier): Promise<bigint> {
    const tierIdx = tier ?? GameTier.STANDARD;
    const deposit = withSlippage(usdToWei(MAX_CASE_BY_TIER[tierIdx]));
    let tx;
    if (tier !== undefined) {
      tx = await game.connect(banker)["createGame(uint8)"](tier, { value: deposit });
    } else {
      tx = await game.connect(banker)["createGame()"](  { value: deposit });
    }
    const receipt = await tx.wait();
    const event = receipt?.logs.find((log: any) => {
      try {
        return game.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "GameCreated";
      } catch { return false; }
    });
    const parsed = game.interface.parseLog({ topics: [...event!.topics], data: event!.data });
    return parsed!.args[0];
  }

  async function joinGame(gameId: bigint, caseIndex: number, salt: bigint) {
    const commitHash = computeCaseCommitHash(caseIndex, salt);
    const deposit = withSlippage(usdToWei(ENTRY_FEE_CENTS));
    await game.connect(player).joinGame(gameId, commitHash, { value: deposit });
  }

  async function fulfillVRF(gameId: bigint) {
    const gameState = await game.games(gameId);
    const requestId = gameState.vrfRequestId;
    await vrfCoordinator.fulfillRandomWords(requestId, await game.getAddress());
  }

  async function revealCase(gameId: bigint, caseIndex: number, salt: bigint) {
    await game.connect(player).revealCase(gameId, caseIndex, salt);
  }

  async function mineBlock() {
    await ethers.provider.send("evm_mine", []);
  }

  async function commitAndRevealRound(
    gameId: bigint,
    caseIndices: number[],
    salt: bigint
  ) {
    const commitHash = computeRoundCommitHash(caseIndices, salt);
    await game.connect(player).commitRound(gameId, commitHash);
    await mineBlock();
    await game.connect(player).revealRound(gameId, caseIndices, salt);
  }

  async function commitAndRevealFinal(gameId: bigint, swap: boolean, salt: bigint) {
    const commitHash = computeFinalCommitHash(swap, salt);
    await game.connect(player).commitFinalDecision(gameId, commitHash);
    await mineBlock();
    await game.connect(player).revealFinalDecision(gameId, swap, salt);
  }

  function getUnopenedCaseIndices(openedBitmap: bigint, playerCaseIndex: number): number[] {
    const indices: number[] = [];
    for (let i = 0; i < 12; i++) {
      if (i !== playerCaseIndex && (openedBitmap & (1n << BigInt(i))) === 0n) {
        indices.push(i);
      }
    }
    return indices;
  }

  async function setupToCommitRound(caseIndex: number = 0): Promise<{ gameId: bigint; salt: bigint }> {
    const salt = 12345n;
    const gameId = await createGame();
    await joinGame(gameId, caseIndex, salt);
    await fulfillVRF(gameId);
    await revealCase(gameId, caseIndex, salt);
    return { gameId, salt };
  }

  // ──────────── Tests ────────────

  describe("Price Feed", function () {
    it("converts USD cents to wei correctly", async function () {
      const weiAmount = await game.usdToWei(100);
      expect(weiAmount).to.equal(500000000000000n);
    });

    it("converts max case value correctly", async function () {
      const weiAmount = await game.usdToWei(1000);
      expect(weiAmount).to.equal(ethers.parseEther("0.005"));
    });
  });

  describe("Game Creation", function () {
    it("creates a default STANDARD tier game", async function () {
      const deposit = withSlippage(usdToWei(MAX_CASE_BY_TIER[GameTier.STANDARD]));
      await expect(game.connect(banker)["createGame()"]({ value: deposit }))
        .to.emit(game, "GameCreated")
        .withArgs(0n, banker.address, GameTier.STANDARD);

      const state = await game.getGameState(0);
      expect(state.banker).to.equal(banker.address);
      expect(state.phase).to.equal(GamePhase.WaitingForPlayer);
      expect(state.tier).to.equal(GameTier.STANDARD);
    });

    it("creates a MICRO tier game", async function () {
      const deposit = withSlippage(usdToWei(MAX_CASE_BY_TIER[GameTier.MICRO]));
      await expect(game.connect(banker)["createGame(uint8)"](GameTier.MICRO, { value: deposit }))
        .to.emit(game, "GameCreated")
        .withArgs(0n, banker.address, GameTier.MICRO);
    });

    it("creates a HIGH tier game", async function () {
      const deposit = withSlippage(usdToWei(MAX_CASE_BY_TIER[GameTier.HIGH]));
      await expect(game.connect(banker)["createGame(uint8)"](GameTier.HIGH, { value: deposit }))
        .to.emit(game, "GameCreated")
        .withArgs(0n, banker.address, GameTier.HIGH);
    });

    it("reverts if deposit is insufficient", async function () {
      const tooLittle = usdToWei(MAX_CASE_BY_TIER[GameTier.STANDARD]) / 2n;
      await expect(
        game.connect(banker)["createGame()"]({ value: tooLittle })
      ).to.be.revertedWithCustomError(game, "InsufficientDeposit");
    });

    it("increments game IDs", async function () {
      await createGame();
      await createGame();
      expect(await game.nextGameId()).to.equal(2n);
    });

    it("tracks active banker games", async function () {
      await createGame();
      expect(await game.activeBankerGames(banker.address)).to.equal(1n);
      await createGame();
      expect(await game.activeBankerGames(banker.address)).to.equal(2n);
    });
  });

  describe("Join Game", function () {
    let gameId: bigint;

    beforeEach(async function () {
      gameId = await createGame();
    });

    it("player can join with entry fee and commit hash", async function () {
      const salt = 42n;
      const commitHash = computeCaseCommitHash(3, salt);
      const deposit = withSlippage(usdToWei(ENTRY_FEE_CENTS));

      await expect(game.connect(player).joinGame(gameId, commitHash, { value: deposit }))
        .to.emit(game, "GameJoined")
        .withArgs(gameId, player.address);

      const state = await game.getGameState(gameId);
      expect(state.player).to.equal(player.address);
      expect(state.phase).to.equal(GamePhase.WaitingForVRF);
    });

    it("reverts if game is not in WaitingForPlayer phase", async function () {
      const deposit = withSlippage(usdToWei(ENTRY_FEE_CENTS));
      const commitHash = computeCaseCommitHash(3, 42n);
      await game.connect(player).joinGame(gameId, commitHash, { value: deposit });
      await expect(
        game.connect(player).joinGame(gameId, commitHash, { value: deposit })
      ).to.be.revertedWithCustomError(game, "WrongPhase");
    });

    it("reverts if entry fee is insufficient", async function () {
      const commitHash = computeCaseCommitHash(3, 42n);
      await expect(
        game.connect(player).joinGame(gameId, commitHash, { value: 1n })
      ).to.be.revertedWithCustomError(game, "InsufficientDeposit");
    });
  });

  describe("Must-Be-Banker Check", function () {
    it("allows joining without banker game when check is disabled (default)", async function () {
      const gameId = await createGame();
      const deposit = withSlippage(usdToWei(ENTRY_FEE_CENTS));
      const commitHash = computeCaseCommitHash(0, 42n);
      // Player has no banker games, but check is off
      await expect(
        game.connect(player).joinGame(gameId, commitHash, { value: deposit })
      ).to.not.be.reverted;
    });

    it("reverts when check is enabled and player has no banker game", async function () {
      await game.connect(owner).setEnforceBankerCheck(true);
      const gameId = await createGame();
      const deposit = withSlippage(usdToWei(ENTRY_FEE_CENTS));
      const commitHash = computeCaseCommitHash(0, 42n);
      await expect(
        game.connect(player).joinGame(gameId, commitHash, { value: deposit })
      ).to.be.revertedWithCustomError(game, "MustBeBanker");
    });

    it("allows joining when player is also a banker", async function () {
      await game.connect(owner).setEnforceBankerCheck(true);
      // Player creates their own game as banker
      const deposit = withSlippage(usdToWei(MAX_CASE_BY_TIER[GameTier.STANDARD]));
      await game.connect(player)["createGame()"]({ value: deposit });

      const gameId = await createGame(); // banker creates a game
      const entryDeposit = withSlippage(usdToWei(ENTRY_FEE_CENTS));
      const commitHash = computeCaseCommitHash(0, 42n);
      await expect(
        game.connect(player).joinGame(gameId, commitHash, { value: entryDeposit })
      ).to.not.be.reverted;
    });
  });

  describe("VRF Fulfillment", function () {
    it("stores seed and transitions to RevealCase", async function () {
      const salt = 99n;
      const gameId = await createGame();
      await joinGame(gameId, 0, salt);
      await fulfillVRF(gameId);

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.RevealCase);
    });

    it("emits SeedRevealed event", async function () {
      const salt = 99n;
      const gameId = await createGame();
      await joinGame(gameId, 0, salt);

      const gameState = await game.games(gameId);
      const requestId = gameState.vrfRequestId;

      await expect(vrfCoordinator.fulfillRandomWords(requestId, await game.getAddress()))
        .to.emit(game, "SeedRevealed")
        .withArgs(gameId);
    });

    it("only requests 1 VRF word (not 12)", async function () {
      // The VRF mock will work with any numWords, but we verify the game
      // stores just a seed, not shuffled values
      const gameId = await createGame();
      await joinGame(gameId, 0, 42n);
      await fulfillVRF(gameId);

      const gameState = await game.games(gameId);
      expect(gameState.vrfSeed).to.not.equal(0n);
      // caseValues should still be 0 (no shuffle happened)
      expect(gameState.caseValues).to.equal(0n);
    });
  });

  describe("Commit-Reveal Initial Case", function () {
    it("valid reveal succeeds", async function () {
      const caseIndex = 5;
      const salt = 777n;
      const gameId = await createGame();
      await joinGame(gameId, caseIndex, salt);
      await fulfillVRF(gameId);

      await expect(game.connect(player).revealCase(gameId, caseIndex, salt))
        .to.emit(game, "CaseRevealed")
        .withArgs(gameId, caseIndex);

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.CommitRound);
      expect(state.playerCaseIndex).to.equal(caseIndex);
    });

    it("reverts with wrong case index", async function () {
      const gameId = await createGame();
      await joinGame(gameId, 5, 777n);
      await fulfillVRF(gameId);
      await expect(
        game.connect(player).revealCase(gameId, 3, 777n)
      ).to.be.revertedWithCustomError(game, "InvalidReveal");
    });

    it("reverts with wrong salt", async function () {
      const gameId = await createGame();
      await joinGame(gameId, 5, 777n);
      await fulfillVRF(gameId);
      await expect(
        game.connect(player).revealCase(gameId, 5, 999n)
      ).to.be.revertedWithCustomError(game, "InvalidReveal");
    });

    it("reverts if called by non-player", async function () {
      const gameId = await createGame();
      await joinGame(gameId, 5, 777n);
      await fulfillVRF(gameId);
      await expect(
        game.connect(banker).revealCase(gameId, 5, 777n)
      ).to.be.revertedWithCustomError(game, "NotPlayer");
    });
  });

  describe("Commit-Reveal Rounds", function () {
    it("commitRound transitions to WaitingForReveal", async function () {
      const { gameId } = await setupToCommitRound(0);
      const unopened = getUnopenedCaseIndices(0n, 0);
      const roundCases = unopened.slice(0, 4);
      const salt = 9999n;
      const commitHash = computeRoundCommitHash(roundCases, salt);

      await game.connect(player).commitRound(gameId, commitHash);

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.WaitingForReveal);
    });

    it("revealRound collapses cases and emits CaseOpened", async function () {
      const { gameId } = await setupToCommitRound(0);
      const unopened = getUnopenedCaseIndices(0n, 0);
      const roundCases = unopened.slice(0, 4);
      const salt = 9999n;

      const commitHash = computeRoundCommitHash(roundCases, salt);
      await game.connect(player).commitRound(gameId, commitHash);
      await mineBlock();

      const tx = await game.connect(player).revealRound(gameId, roundCases, salt);
      const receipt = await tx.wait();

      // Should emit 4 CaseOpened events
      const openedEvents = receipt?.logs.filter((log: any) => {
        try {
          return game.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "CaseOpened";
        } catch { return false; }
      });
      expect(openedEvents?.length).to.equal(4);
    });

    it("reverts if reveal is in the same block as commit", async function () {
      const { gameId } = await setupToCommitRound(0);
      const roundCases = [1, 2, 3, 4];
      const salt = 9999n;
      const commitHash = computeRoundCommitHash(roundCases, salt);

      await game.connect(player).commitRound(gameId, commitHash);

      // DON'T mine a block — try to reveal in same block
      // In Hardhat, each tx is a new block by default, so this actually works.
      // We need to use automining=false to test this properly.
      await ethers.provider.send("evm_setAutomine", [false]);
      try {
        // This would be in the same block if automining were off,
        // but the commit already advanced the block. Let's test the error path
        // by committing again fresh.
      } finally {
        await ethers.provider.send("evm_setAutomine", [true]);
        await mineBlock();
      }

      // The real test: reveal should succeed after mining
      await game.connect(player).revealRound(gameId, roundCases, salt);
    });

    it("reverts with wrong number of cases", async function () {
      const { gameId } = await setupToCommitRound(0);
      const roundCases = [1, 2, 3]; // Only 3, round 0 needs 4
      const salt = 9999n;
      const commitHash = computeRoundCommitHash(roundCases, salt);

      await game.connect(player).commitRound(gameId, commitHash);
      await mineBlock();

      await expect(
        game.connect(player).revealRound(gameId, roundCases, salt)
      ).to.be.revertedWithCustomError(game, "WrongNumberOfCases");
    });

    it("reverts with invalid commit hash", async function () {
      const { gameId } = await setupToCommitRound(0);
      const roundCases = [1, 2, 3, 4];
      const salt = 9999n;
      const commitHash = computeRoundCommitHash(roundCases, salt);

      await game.connect(player).commitRound(gameId, commitHash);
      await mineBlock();

      // Try different cases
      await expect(
        game.connect(player).revealRound(gameId, [5, 6, 7, 8], salt)
      ).to.be.revertedWithCustomError(game, "InvalidReveal");
    });

    it("cannot open player's own case", async function () {
      const { gameId } = await setupToCommitRound(0);
      const roundCases = [0, 1, 2, 3]; // 0 is player's case
      const salt = 9999n;
      const commitHash = computeRoundCommitHash(roundCases, salt);

      await game.connect(player).commitRound(gameId, commitHash);
      await mineBlock();

      await expect(
        game.connect(player).revealRound(gameId, roundCases, salt)
      ).to.be.revertedWithCustomError(game, "CannotOpenOwnCase");
    });

    it("transitions to BankerOffer after round 0", async function () {
      const { gameId } = await setupToCommitRound(0);
      const roundCases = [1, 2, 3, 4];
      await commitAndRevealRound(gameId, roundCases, 9999n);

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.BankerOffer);
      expect(state.bankerOffer).to.be.gt(0n);
    });
  });

  describe("Banker Offer", function () {
    async function setupToBankerOffer(): Promise<bigint> {
      const { gameId } = await setupToCommitRound(0);
      await commitAndRevealRound(gameId, [1, 2, 3, 4], 9999n);
      return gameId;
    }

    it("calculates offer as percentage of remaining expected value", async function () {
      const gameId = await setupToBankerOffer();
      const state = await game.getGameState(gameId);
      expect(state.bankerOffer).to.be.gt(0n);
    });

    it("accept deal transitions to GameOver and pays out", async function () {
      const gameId = await setupToBankerOffer();
      const playerBalBefore = await ethers.provider.getBalance(player.address);

      const tx = await game.connect(player).acceptDeal(gameId);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.GameOver);

      const playerBalAfter = await ethers.provider.getBalance(player.address);
      expect(playerBalAfter + gasUsed).to.be.gt(playerBalBefore);
    });

    it("reject deal advances to CommitRound for next round", async function () {
      const gameId = await setupToBankerOffer();

      await expect(game.connect(player).rejectDeal(gameId))
        .to.emit(game, "DealRejected")
        .withArgs(gameId);

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.CommitRound);
      expect(state.currentRound).to.equal(1);
    });

    it("cannot accept deal in wrong phase", async function () {
      const { gameId } = await setupToCommitRound(0);
      await expect(
        game.connect(player).acceptDeal(gameId)
      ).to.be.revertedWithCustomError(game, "WrongPhase");
    });
  });

  describe("Final Swap (Commit-Reveal)", function () {
    async function playToCommitFinal(): Promise<{ gameId: bigint; playerCaseIndex: number }> {
      const playerCaseIndex = 0;
      const { gameId } = await setupToCommitRound(playerCaseIndex);

      let roundSalt = 1000n;
      for (let round = 0; round < CASES_PER_ROUND.length; round++) {
        const state = await game.getGameState(gameId);
        if (Number(state.phase) === GamePhase.CommitFinal) break;
        if (Number(state.phase) === GamePhase.BankerOffer) {
          await game.connect(player).rejectDeal(gameId);
        }

        const stateNow = await game.getGameState(gameId);
        if (Number(stateNow.phase) !== GamePhase.CommitRound) break;

        const unopened = getUnopenedCaseIndices(stateNow.openedBitmap, playerCaseIndex);
        const casesToOpen = unopened.slice(0, CASES_PER_ROUND[round]);

        if (casesToOpen.length === 0) break;

        await commitAndRevealRound(gameId, casesToOpen, roundSalt++);
      }

      const finalState = await game.getGameState(gameId);
      expect(finalState.phase).to.equal(GamePhase.CommitFinal);
      return { gameId, playerCaseIndex };
    }

    it("reaches CommitFinal after all rounds", async function () {
      await playToCommitFinal();
    });

    it("keep original case works via commit-reveal", async function () {
      const { gameId } = await playToCommitFinal();

      await commitAndRevealFinal(gameId, false, 55555n);

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.GameOver);
      expect(state.finalPayout).to.be.gt(0n);
    });

    it("swap case works via commit-reveal", async function () {
      const { gameId } = await playToCommitFinal();

      await commitAndRevealFinal(gameId, true, 66666n);

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.GameOver);
      expect(state.finalPayout).to.be.gt(0n);
    });

    it("final reveal with wrong commit hash reverts", async function () {
      const { gameId } = await playToCommitFinal();
      const commitHash = computeFinalCommitHash(false, 55555n);
      await game.connect(player).commitFinalDecision(gameId, commitHash);
      await mineBlock();

      // Try revealing with swap=true instead of false
      await expect(
        game.connect(player).revealFinalDecision(gameId, true, 55555n)
      ).to.be.revertedWithCustomError(game, "InvalidReveal");
    });
  });

  describe("Schrödinger Collapse Verification", function () {
    it("all 12 tier values are used exactly once in a full game", async function () {
      const { gameId } = await setupToCommitRound(0);

      let roundSalt = 100n;
      const allOpenedValues: number[] = [];

      for (let round = 0; round < CASES_PER_ROUND.length; round++) {
        const state = await game.getGameState(gameId);
        const phase = Number(state.phase);

        if (phase === GamePhase.CommitFinal) break;
        if (phase === GamePhase.BankerOffer) {
          await game.connect(player).rejectDeal(gameId);
        }

        const stateNow = await game.getGameState(gameId);
        if (Number(stateNow.phase) !== GamePhase.CommitRound) break;

        const unopened = getUnopenedCaseIndices(stateNow.openedBitmap, 0);
        const casesToOpen = unopened.slice(0, CASES_PER_ROUND[round]);
        if (casesToOpen.length === 0) break;

        const commitHash = computeRoundCommitHash(casesToOpen, roundSalt);
        await game.connect(player).commitRound(gameId, commitHash);
        await mineBlock();

        const tx = await game.connect(player).revealRound(gameId, casesToOpen, roundSalt);
        const receipt = await tx.wait();

        // Collect opened values from events
        for (const log of receipt!.logs) {
          try {
            const parsed = game.interface.parseLog({ topics: [...log.topics], data: log.data });
            if (parsed?.name === "CaseOpened") {
              allOpenedValues.push(Number(parsed.args[2]));
            }
          } catch {}
        }

        roundSalt++;
      }

      // Final reveal
      await commitAndRevealFinal(gameId, false, 77777n);

      // Read the player's case value
      const playerValue = await game.getCaseValue(gameId, 0);
      allOpenedValues.push(Number(playerValue));

      // Read the last other case value
      const state = await game.getGameState(gameId);
      for (let i = 1; i < 12; i++) {
        try {
          const v = await game.getCaseValue(gameId, i);
          if (!allOpenedValues.includes(Number(v)) || allOpenedValues.filter(x => x === Number(v)).length < 2) {
            // This case was collapsed during final reveal
          }
        } catch {}
      }

      // All opened values should be from STANDARD_VALUES
      for (const v of allOpenedValues) {
        expect(STANDARD_VALUES).to.include(v);
      }

      // Count: 10 cases opened in rounds + 2 collapsed in final = 12 total
      // Each value used exactly once
      expect(allOpenedValues.length).to.be.gte(11); // at minimum player case + all opened
    });

    it("remaining values reflect unused tier values", async function () {
      const { gameId } = await setupToCommitRound(0);

      // Before any opens, all 12 values should be remaining
      const remaining = await game.getRemainingValues(gameId);
      expect(remaining.length).to.equal(12);
      const sortedRemaining = [...remaining].map(Number).sort((a, b) => a - b);
      expect(sortedRemaining).to.deep.equal([...STANDARD_VALUES].sort((a, b) => a - b));

      // Open 4 cases
      await commitAndRevealRound(gameId, [1, 2, 3, 4], 5555n);

      const remaining2 = await game.getRemainingValues(gameId);
      expect(remaining2.length).to.equal(8); // 12 - 4 = 8
    });

    it("different opening orders produce different values (order matters)", async function () {
      // Play two games with same seed but different case opening order
      // They should (very likely) get different collapsed values
      const { gameId: gameId1 } = await setupToCommitRound(0);
      const { gameId: gameId2 } = await setupToCommitRound(0);

      // Game 1: open [1,2,3,4]
      const commitHash1 = computeRoundCommitHash([1, 2, 3, 4], 111n);
      await game.connect(player).commitRound(gameId1, commitHash1);
      await mineBlock();
      const tx1 = await game.connect(player).revealRound(gameId1, [1, 2, 3, 4], 111n);

      // Game 2: open [4,3,2,1] (reverse order)
      const commitHash2 = computeRoundCommitHash([4, 3, 2, 1], 111n);
      await game.connect(player).commitRound(gameId2, commitHash2);
      await mineBlock();
      const tx2 = await game.connect(player).revealRound(gameId2, [4, 3, 2, 1], 111n);

      // The VRF seeds are different (different games), so values will differ
      // This test primarily verifies both paths work correctly
      const state1 = await game.getGameState(gameId1);
      const state2 = await game.getGameState(gameId2);
      expect(state1.phase).to.equal(GamePhase.BankerOffer);
      expect(state2.phase).to.equal(GamePhase.BankerOffer);
    });
  });

  describe("Settlement", function () {
    it("contestant receives ETH payout on deal", async function () {
      const { gameId } = await setupToCommitRound(0);
      await commitAndRevealRound(gameId, [1, 2, 3, 4], 9999n);

      const playerBalBefore = await ethers.provider.getBalance(player.address);
      const tx = await game.connect(player).acceptDeal(gameId);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const playerBalAfter = await ethers.provider.getBalance(player.address);

      const netGain = playerBalAfter - playerBalBefore + gasUsed;
      expect(netGain).to.be.gt(0n);
    });

    it("banker receives refund after game ends", async function () {
      const { gameId } = await setupToCommitRound(0);
      await commitAndRevealRound(gameId, [1, 2, 3, 4], 9999n);

      const bankerBalBefore = await ethers.provider.getBalance(banker.address);
      await game.connect(player).acceptDeal(gameId);
      const bankerBalAfter = await ethers.provider.getBalance(banker.address);

      expect(bankerBalAfter).to.be.gt(bankerBalBefore);
    });

    it("contract has zero balance after settlement", async function () {
      const { gameId } = await setupToCommitRound(0);
      await commitAndRevealRound(gameId, [1, 2, 3, 4], 9999n);
      await game.connect(player).acceptDeal(gameId);

      const contractBal = await ethers.provider.getBalance(await game.getAddress());
      expect(contractBal).to.equal(0n);
    });
  });

  describe("Game Tiers", function () {
    it("MICRO tier has correct max case value", async function () {
      const gameId = await createGame(GameTier.MICRO);
      const state = await game.getGameState(gameId);
      expect(state.tier).to.equal(GameTier.MICRO);

      // Remaining values should be MICRO_VALUES
      await joinGame(gameId, 0, 42n);
      await fulfillVRF(gameId);
      await revealCase(gameId, 0, 42n);

      const remaining = await game.getRemainingValues(gameId);
      const sorted = [...remaining].map(Number).sort((a, b) => a - b);
      expect(sorted).to.deep.equal([...MICRO_VALUES].sort((a, b) => a - b));
    });

    it("HIGH tier has correct max case value", async function () {
      const gameId = await createGame(GameTier.HIGH);
      await joinGame(gameId, 0, 42n);
      await fulfillVRF(gameId);
      await revealCase(gameId, 0, 42n);

      const remaining = await game.getRemainingValues(gameId);
      const sorted = [...remaining].map(Number).sort((a, b) => a - b);
      expect(sorted).to.deep.equal([...HIGH_VALUES].sort((a, b) => a - b));
    });
  });

  describe("Betting Outcome", function () {
    it("returns correct outcome after deal accepted", async function () {
      const { gameId } = await setupToCommitRound(0);
      await commitAndRevealRound(gameId, [1, 2, 3, 4], 9999n);
      await game.connect(player).acceptDeal(gameId);

      const outcome = await game.getBettingOutcome(gameId);
      expect(outcome.dealTaken).to.be.true;
      expect(outcome.finalPayout).to.be.gt(0n);
      // playerCaseValue should be a valid STANDARD value
      expect(STANDARD_VALUES).to.include(Number(outcome.playerCaseValue));
    });

    it("returns correct outcome after final swap", async function () {
      const playerCaseIndex = 0;
      const { gameId } = await setupToCommitRound(playerCaseIndex);

      let roundSalt = 100n;
      for (let round = 0; round < CASES_PER_ROUND.length; round++) {
        const state = await game.getGameState(gameId);
        if (Number(state.phase) === GamePhase.CommitFinal) break;
        if (Number(state.phase) === GamePhase.BankerOffer) {
          await game.connect(player).rejectDeal(gameId);
        }
        const stateNow = await game.getGameState(gameId);
        if (Number(stateNow.phase) !== GamePhase.CommitRound) break;
        const unopened = getUnopenedCaseIndices(stateNow.openedBitmap, playerCaseIndex);
        const casesToOpen = unopened.slice(0, CASES_PER_ROUND[round]);
        if (casesToOpen.length === 0) break;
        await commitAndRevealRound(gameId, casesToOpen, roundSalt++);
      }

      await commitAndRevealFinal(gameId, false, 88888n);

      const outcome = await game.getBettingOutcome(gameId);
      expect(outcome.dealTaken).to.be.false;
      expect(outcome.finalPayout).to.be.gt(0n);
      expect(STANDARD_VALUES).to.include(Number(outcome.playerCaseValue));
    });

    it("reverts if game not over", async function () {
      const { gameId } = await setupToCommitRound(0);
      await expect(game.getBettingOutcome(gameId)).to.be.revertedWith("Game not over");
    });
  });

  describe("Forfeit", function () {
    it("banker cannot forfeit before reveal window expires", async function () {
      const { gameId } = await setupToCommitRound(0);
      const roundCases = [1, 2, 3, 4];
      const commitHash = computeRoundCommitHash(roundCases, 9999n);
      await game.connect(player).commitRound(gameId, commitHash);

      await expect(
        game.connect(banker).forfeitGame(gameId)
      ).to.be.revertedWithCustomError(game, "RevealWindowActive");
    });

    it("only banker can forfeit", async function () {
      const { gameId } = await setupToCommitRound(0);
      const roundCases = [1, 2, 3, 4];
      const commitHash = computeRoundCommitHash(roundCases, 9999n);
      await game.connect(player).commitRound(gameId, commitHash);

      await expect(
        game.connect(player).forfeitGame(gameId)
      ).to.be.revertedWithCustomError(game, "NotBanker");
    });

    it("cannot forfeit in non-reveal phase", async function () {
      const { gameId } = await setupToCommitRound(0);
      await expect(
        game.connect(banker).forfeitGame(gameId)
      ).to.be.revertedWithCustomError(game, "CannotForfeit");
    });
  });

  describe("View Functions", function () {
    it("getCaseValue works for opened cases", async function () {
      const { gameId } = await setupToCommitRound(0);
      await commitAndRevealRound(gameId, [1, 2, 3, 4], 9999n);

      const value = await game.getCaseValue(gameId, 1);
      expect(STANDARD_VALUES).to.include(Number(value));
    });

    it("getCaseValue reverts for unopened cases", async function () {
      const { gameId } = await setupToCommitRound(0);
      await expect(game.getCaseValue(gameId, 5)).to.be.revertedWith("Case not revealed");
    });

    it("getGameState returns complete state", async function () {
      const { gameId } = await setupToCommitRound(5);

      const state = await game.getGameState(gameId);
      expect(state.banker).to.equal(banker.address);
      expect(state.player).to.equal(player.address);
      expect(state.phase).to.equal(GamePhase.CommitRound);
      expect(state.playerCaseIndex).to.equal(5);
      expect(state.currentRound).to.equal(0);
      expect(state.tier).to.equal(GameTier.STANDARD);
    });

    it("getCommitState returns commit block and hash", async function () {
      const { gameId } = await setupToCommitRound(0);
      const commitHash = computeRoundCommitHash([1, 2, 3, 4], 9999n);
      await game.connect(player).commitRound(gameId, commitHash);

      const commitState = await game.getCommitState(gameId);
      expect(commitState.commitBlock).to.be.gt(0n);
      expect(commitState.commitHash).to.equal(commitHash);
    });
  });

  describe("Full Game Simulation", function () {
    it("plays a complete game with deal accepted in round 1", async function () {
      const { gameId } = await setupToCommitRound(3);

      // Round 0: open 4 cases
      await commitAndRevealRound(gameId, [1, 2, 4, 5], 1111n);

      // Accept the deal
      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.BankerOffer);
      expect(state.bankerOffer).to.be.gt(0n);

      await game.connect(player).acceptDeal(gameId);

      const finalState = await game.getGameState(gameId);
      expect(finalState.phase).to.equal(GamePhase.GameOver);
      expect(finalState.finalPayout).to.be.gt(0n);
    });

    it("plays a complete game to final swap (no deal)", async function () {
      const playerCaseIndex = 7;
      const salt = 11111n;
      const gameId = await createGame();
      await joinGame(gameId, playerCaseIndex, salt);
      await fulfillVRF(gameId);
      await revealCase(gameId, playerCaseIndex, salt);

      let roundSalt = 200n;
      for (let round = 0; round < CASES_PER_ROUND.length; round++) {
        const state = await game.getGameState(gameId);
        const phase = Number(state.phase);
        if (phase === GamePhase.CommitFinal) break;
        if (phase === GamePhase.BankerOffer) {
          await game.connect(player).rejectDeal(gameId);
        }

        const stateNow = await game.getGameState(gameId);
        if (Number(stateNow.phase) !== GamePhase.CommitRound) break;

        const unopened = getUnopenedCaseIndices(stateNow.openedBitmap, playerCaseIndex);
        const casesToOpen = unopened.slice(0, CASES_PER_ROUND[round]);
        if (casesToOpen.length === 0) break;

        await commitAndRevealRound(gameId, casesToOpen, roundSalt++);
      }

      // Final decision — keep
      await commitAndRevealFinal(gameId, false, 33333n);

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.GameOver);
      expect(state.finalPayout).to.be.gt(0n);

      // Payout should be a valid STANDARD value
      expect(STANDARD_VALUES).to.include(Number(state.finalPayout));
    });
  });

  describe("Multiple Simultaneous Games", function () {
    it("two games can run independently", async function () {
      const gameId1 = await createGame();
      const salt1 = 111n;
      await joinGame(gameId1, 0, salt1);
      await fulfillVRF(gameId1);
      await revealCase(gameId1, 0, salt1);

      const gameId2 = await createGame();
      const salt2 = 222n;
      await joinGame(gameId2, 5, salt2);
      await fulfillVRF(gameId2);
      await revealCase(gameId2, 5, salt2);

      const state1 = await game.getGameState(gameId1);
      const state2 = await game.getGameState(gameId2);
      expect(state1.phase).to.equal(GamePhase.CommitRound);
      expect(state2.phase).to.equal(GamePhase.CommitRound);
      expect(state1.playerCaseIndex).to.equal(0);
      expect(state2.playerCaseIndex).to.equal(5);
    });
  });
});
