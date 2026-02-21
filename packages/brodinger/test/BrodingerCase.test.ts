import { expect } from "chai";
import { ethers } from "hardhat";
import { CashCase, VRFCoordinatorV2_5Mock, MockV3Aggregator } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║              Brodinger's Case — Full Test Suite                  ║
 * ║                                                                  ║
 * ║  CashCase.sol with quantum collapse: values don't exist until    ║
 * ║  observed. Commit-reveal per round prevents bot precomputation.  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// Game phases matching contract
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

enum GameTier { MICRO = 0, STANDARD = 1, HIGH = 2 }

const TIER_VALUES: Record<number, number[]> = {
  [GameTier.MICRO]:    [1, 2, 5, 10, 25, 50, 75, 100, 150, 200, 350, 500],
  [GameTier.STANDARD]: [1, 5, 10, 25, 50, 100, 200, 300, 400, 500, 750, 1000],
  [GameTier.HIGH]:     [10, 50, 100, 250, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000],
};
const MAX_CASE_BY_TIER = [500, 1000, 5000];
const CASES_PER_ROUND = [4, 3, 2, 1, 1];
const BANKER_PERCENTAGES = [15, 30, 45, 65, 85];
const ETH_USD_PRICE = 200000000000n;
const ENTRY_FEE_CENTS = 100n;
const SLIPPAGE_BPS = 500n;

function usdToWei(usdCents: bigint): bigint {
  return (usdCents * 10n ** 24n) / ETH_USD_PRICE;
}

function withSlippage(amount: bigint): bigint {
  return (amount * (10000n + SLIPPAGE_BPS)) / 10000n;
}

describe("Brodinger's Case (CashCase)", function () {
  let game: CashCase;
  let vrfCoordinator: VRFCoordinatorV2_5Mock;
  let priceFeed: MockV3Aggregator;
  let owner: SignerWithAddress;
  let banker: SignerWithAddress;
  let player: SignerWithAddress;
  let other: SignerWithAddress;
  let subscriptionId: bigint;

  const keyHash = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";

  beforeEach(async function () {
    [owner, banker, player, other] = await ethers.getSigners();

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

  function computeCommitHash(caseIndex: number, salt: bigint): bigint {
    return BigInt(ethers.solidityPackedKeccak256(["uint8", "uint256"], [caseIndex, salt]));
  }

  function computeRoundCommitHash(caseIndices: number[], salt: bigint): bigint {
    // Contract uses abi.encode(uint8[], uint256) — standard ABI encoding
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8[]", "uint256"],
      [caseIndices, salt]
    );
    return BigInt(ethers.keccak256(encoded));
  }

  function computeFinalCommitHash(swap: boolean, salt: bigint): bigint {
    // Contract uses abi.encode(bool, uint256) — standard ABI encoding
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bool", "uint256"],
      [swap, salt]
    );
    return BigInt(ethers.keccak256(encoded));
  }

  async function mineBlock() {
    await ethers.provider.send("evm_mine", []);
  }

  async function createGame(tier: GameTier = GameTier.STANDARD): Promise<bigint> {
    const maxCents = BigInt(MAX_CASE_BY_TIER[tier]);
    const deposit = withSlippage(usdToWei(maxCents));
    const tx = await game.connect(banker)["createGame(uint8)"](tier, { value: deposit });
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
    const commitHash = computeCommitHash(caseIndex, salt);
    const deposit = withSlippage(usdToWei(ENTRY_FEE_CENTS));
    await game.connect(player).joinGame(gameId, commitHash, { value: deposit });
  }

  async function fulfillVRF(gameId: bigint) {
    const gameState = await game.games(gameId);
    await vrfCoordinator.fulfillRandomWords(gameState.vrfRequestId, await game.getAddress());
  }

  async function revealCase(gameId: bigint, caseIndex: number, salt: bigint) {
    await game.connect(player).revealCase(gameId, caseIndex, salt);
  }

  async function playRound(gameId: bigint, caseIndices: number[], salt: bigint) {
    const commitHash = computeRoundCommitHash(caseIndices, salt);
    await game.connect(player).commitRound(gameId, commitHash);
    await mineBlock();
    await game.connect(player).revealRound(gameId, caseIndices, salt);
  }

  async function setupToCommitRound(
    tier: GameTier = GameTier.STANDARD,
    playerCaseIndex: number = 0,
    salt: bigint = 12345n
  ): Promise<bigint> {
    const gameId = await createGame(tier);
    await joinGame(gameId, playerCaseIndex, salt);
    await fulfillVRF(gameId);
    await revealCase(gameId, playerCaseIndex, salt);
    return gameId;
  }

  function getUnopenedNonPlayerCases(openedBitmap: bigint, playerCase: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < 12; i++) {
      if (i !== playerCase && (openedBitmap & (1n << BigInt(i))) === 0n) {
        result.push(i);
      }
    }
    return result;
  }

  // ──────────── Price Feed ────────────

  describe("Price Feed", function () {
    it("converts USD cents to wei correctly", async function () {
      const wei = await game.usdToWei(100n);
      expect(wei).to.equal(usdToWei(100n));
    });

    it("returns the ETH/USD price", async function () {
      const price = await game.getEthUsdPrice();
      expect(price).to.equal(ETH_USD_PRICE);
    });
  });

  // ──────────── Game Creation ────────────

  describe("Game Creation", function () {
    it("creates a STANDARD tier game", async function () {
      const gameId = await createGame(GameTier.STANDARD);
      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.WaitingForPlayer);
      expect(state.tier).to.equal(GameTier.STANDARD);
    });

    it("creates a MICRO tier game with lower deposit", async function () {
      const gameId = await createGame(GameTier.MICRO);
      const state = await game.getGameState(gameId);
      expect(state.tier).to.equal(GameTier.MICRO);
    });

    it("creates a HIGH tier game with higher deposit", async function () {
      const gameId = await createGame(GameTier.HIGH);
      const state = await game.getGameState(gameId);
      expect(state.tier).to.equal(GameTier.HIGH);
    });

    it("reverts with insufficient deposit", async function () {
      await expect(
        game.connect(banker)["createGame(uint8)"](GameTier.STANDARD, { value: 1n })
      ).to.be.revertedWithCustomError(game, "InsufficientDeposit");
    });

    it("creates with default tier via no-arg createGame", async function () {
      const maxCents = BigInt(MAX_CASE_BY_TIER[GameTier.STANDARD]);
      const deposit = withSlippage(usdToWei(maxCents));
      const tx = await game.connect(banker)["createGame()"](  { value: deposit });
      const receipt = await tx.wait();
      const event = receipt?.logs.find((log: any) => {
        try {
          return game.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "GameCreated";
        } catch { return false; }
      });
      const parsed = game.interface.parseLog({ topics: [...event!.topics], data: event!.data });
      const gameId = parsed!.args[0];
      const state = await game.getGameState(gameId);
      expect(state.tier).to.equal(GameTier.STANDARD);
    });

    it("increments game IDs", async function () {
      const id1 = await createGame();
      const id2 = await createGame();
      expect(id2).to.equal(id1 + 1n);
    });
  });

  // ──────────── Join Game ────────────

  describe("Join Game", function () {
    it("player joins with entry fee and commit hash", async function () {
      const gameId = await createGame();
      await joinGame(gameId, 0, 12345n);
      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.WaitingForVRF);
      expect(state.player).to.equal(player.address);
    });

    it("reverts if entry fee is insufficient", async function () {
      const gameId = await createGame();
      const commitHash = computeCommitHash(0, 12345n);
      await expect(
        game.connect(player).joinGame(gameId, commitHash, { value: 1n })
      ).to.be.revertedWithCustomError(game, "InsufficientDeposit");
    });

    it("reverts if game is not waiting for player", async function () {
      const gameId = await createGame();
      await joinGame(gameId, 0, 12345n);
      await expect(
        joinGame(gameId, 1, 99999n)
      ).to.be.revertedWithCustomError(game, "WrongPhase");
    });
  });

  // ──────────── VRF Fulfillment — Brodinger's: no values exist ────────────

  describe("VRF Fulfillment (Brodinger's)", function () {
    it("stores seed only — caseValues is zero", async function () {
      const gameId = await createGame();
      await joinGame(gameId, 0, 12345n);
      await fulfillVRF(gameId);

      const gameData = await game.games(gameId);
      expect(gameData.vrfSeed).to.not.equal(0n);
      expect(gameData.caseValues).to.equal(0n); // Brodinger's: nothing exists yet
    });

    it("emits SeedRevealed event", async function () {
      const gameId = await createGame();
      await joinGame(gameId, 0, 12345n);
      const gameData = await game.games(gameId);

      await expect(
        vrfCoordinator.fulfillRandomWords(gameData.vrfRequestId, await game.getAddress())
      ).to.emit(game, "SeedRevealed").withArgs(gameId);
    });

    it("transitions to RevealCase phase", async function () {
      const gameId = await createGame();
      await joinGame(gameId, 0, 12345n);
      await fulfillVRF(gameId);
      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.RevealCase);
    });
  });

  // ──────────── Initial Case Reveal ────────────

  describe("Initial Case Reveal", function () {
    it("reveals committed case and transitions to CommitRound", async function () {
      const gameId = await setupToCommitRound();
      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.CommitRound);
      expect(state.playerCaseIndex).to.equal(0);
    });

    it("reverts with wrong salt", async function () {
      const gameId = await createGame();
      await joinGame(gameId, 0, 12345n);
      await fulfillVRF(gameId);
      await expect(
        game.connect(player).revealCase(gameId, 0, 99999n)
      ).to.be.revertedWithCustomError(game, "InvalidReveal");
    });

    it("reverts with wrong case index", async function () {
      const gameId = await createGame();
      await joinGame(gameId, 0, 12345n);
      await fulfillVRF(gameId);
      await expect(
        game.connect(player).revealCase(gameId, 5, 12345n)
      ).to.be.revertedWithCustomError(game, "InvalidReveal");
    });

    it("reverts if not player", async function () {
      const gameId = await createGame();
      await joinGame(gameId, 0, 12345n);
      await fulfillVRF(gameId);
      await expect(
        game.connect(other).revealCase(gameId, 0, 12345n)
      ).to.be.revertedWithCustomError(game, "NotPlayer");
    });
  });

  // ──────────── Commit-Reveal Rounds (Brodinger's Collapse) ────────────

  describe("Commit-Reveal Rounds", function () {
    it("commitRound stores hash and block, transitions to WaitingForReveal", async function () {
      const gameId = await setupToCommitRound();
      const commitHash = computeRoundCommitHash([1, 2, 3, 4], 55555n);
      await game.connect(player).commitRound(gameId, commitHash);

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.WaitingForReveal);

      const commitState = await game.getCommitState(gameId);
      expect(commitState.commitHash).to.equal(commitHash);
      expect(commitState.commitBlock).to.be.gt(0n);
    });

    it("revealRound reverts if same block (TooEarlyToReveal)", async function () {
      const gameId = await setupToCommitRound();
      const caseIndices = [1, 2, 3, 4];
      const salt = 55555n;
      const commitHash = computeRoundCommitHash(caseIndices, salt);

      // Disable automine so commit + reveal land in same block
      await ethers.provider.send("evm_setAutomine", [false]);
      await game.connect(player).commitRound(gameId, commitHash);
      const revealTx = await game.connect(player).revealRound(gameId, caseIndices, salt);
      await ethers.provider.send("evm_mine", []);
      await ethers.provider.send("evm_setAutomine", [true]);

      // The reveal TX should have reverted
      const receipt = await revealTx.wait().catch(() => null);
      expect(receipt).to.be.null;
    });

    it("revealRound reverts with wrong hash", async function () {
      const gameId = await setupToCommitRound();
      const commitHash = computeRoundCommitHash([1, 2, 3, 4], 55555n);
      await game.connect(player).commitRound(gameId, commitHash);
      await mineBlock();

      await expect(
        game.connect(player).revealRound(gameId, [1, 2, 3, 5], 55555n)
      ).to.be.revertedWithCustomError(game, "InvalidReveal");
    });

    it("revealRound reverts with wrong number of cases", async function () {
      const gameId = await setupToCommitRound();
      const commitHash = computeRoundCommitHash([1, 2, 3], 55555n);
      await game.connect(player).commitRound(gameId, commitHash);
      await mineBlock();

      await expect(
        game.connect(player).revealRound(gameId, [1, 2, 3], 55555n)
      ).to.be.revertedWithCustomError(game, "WrongNumberOfCases");
    });

    it("successfully opens 4 cases in round 0", async function () {
      const gameId = await setupToCommitRound();
      await playRound(gameId, [1, 2, 3, 4], 55555n);

      const state = await game.getGameState(gameId);
      // Should be BankerOffer (7 remaining > 1)
      expect(state.phase).to.equal(GamePhase.BankerOffer);
      expect(state.totalOpened).to.equal(4);
    });

    it("collapsed values come from the tier's value set", async function () {
      const gameId = await setupToCommitRound();
      const tier = GameTier.STANDARD;
      const tierValues = TIER_VALUES[tier];

      await playRound(gameId, [1, 2, 3, 4], 55555n);

      // Read opened case values
      for (const idx of [1, 2, 3, 4]) {
        const value = await game.getCaseValue(gameId, idx);
        expect(tierValues).to.include(Number(value));
      }
    });

    it("no duplicate values among opened cases", async function () {
      const gameId = await setupToCommitRound();
      await playRound(gameId, [1, 2, 3, 4], 55555n);

      const values = new Set<number>();
      for (const idx of [1, 2, 3, 4]) {
        const value = Number(await game.getCaseValue(gameId, idx));
        expect(values.has(value)).to.be.false;
        values.add(value);
      }
    });

    it("cannot open player's own case", async function () {
      const gameId = await setupToCommitRound(GameTier.STANDARD, 0, 12345n);
      const commitHash = computeRoundCommitHash([0, 1, 2, 3], 55555n);
      await game.connect(player).commitRound(gameId, commitHash);
      await mineBlock();

      await expect(
        game.connect(player).revealRound(gameId, [0, 1, 2, 3], 55555n)
      ).to.be.revertedWithCustomError(game, "CannotOpenOwnCase");
    });

    it("cannot open same case twice", async function () {
      const gameId = await setupToCommitRound();
      await playRound(gameId, [1, 2, 3, 4], 55555n);
      await game.connect(player).rejectDeal(gameId);

      // Try to open case 1 again in round 2
      const commitHash = computeRoundCommitHash([1, 5, 6], 66666n);
      await game.connect(player).commitRound(gameId, commitHash);
      await mineBlock();

      await expect(
        game.connect(player).revealRound(gameId, [1, 5, 6], 66666n)
      ).to.be.revertedWithCustomError(game, "CaseAlreadyOpened");
    });
  });

  // ──────────── Banker Offer ────────────

  describe("Banker Offer", function () {
    it("calculates offer based on remaining tier values", async function () {
      const gameId = await setupToCommitRound();
      await playRound(gameId, [1, 2, 3, 4], 55555n);

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.BankerOffer);
      expect(state.bankerOffer).to.be.gt(0n);
    });

    it("acceptDeal pays player the offer amount", async function () {
      const gameId = await setupToCommitRound();
      await playRound(gameId, [1, 2, 3, 4], 55555n);

      const offer = (await game.getGameState(gameId)).bankerOffer;
      const balBefore = await ethers.provider.getBalance(player.address);

      const tx = await game.connect(player).acceptDeal(gameId);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balAfter = await ethers.provider.getBalance(player.address);
      const payout = usdToWei(offer);
      expect(balAfter + gasUsed - balBefore).to.be.closeTo(payout, payout / 100n);

      const finalState = await game.getGameState(gameId);
      expect(finalState.phase).to.equal(GamePhase.GameOver);
    });

    it("rejectDeal advances to next round", async function () {
      const gameId = await setupToCommitRound();
      await playRound(gameId, [1, 2, 3, 4], 55555n);

      await game.connect(player).rejectDeal(gameId);
      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.CommitRound);
      expect(state.currentRound).to.equal(1);
    });
  });

  // ──────────── Final Decision (Commit-Reveal) ────────────

  describe("Final Decision", function () {
    async function playToFinal(gameId: bigint): Promise<void> {
      // Round 0: open 4 cases
      const state0 = await game.getGameState(gameId);
      const available0 = getUnopenedNonPlayerCases(state0.openedBitmap, 0);
      await playRound(gameId, available0.slice(0, 4), 10001n);
      await game.connect(player).rejectDeal(gameId);

      // Round 1: open 3 cases
      const state1 = await game.getGameState(gameId);
      const available1 = getUnopenedNonPlayerCases(state1.openedBitmap, 0);
      await playRound(gameId, available1.slice(0, 3), 10002n);
      await game.connect(player).rejectDeal(gameId);

      // Round 2: open 2 cases
      const state2 = await game.getGameState(gameId);
      const available2 = getUnopenedNonPlayerCases(state2.openedBitmap, 0);
      await playRound(gameId, available2.slice(0, 2), 10003n);
      await game.connect(player).rejectDeal(gameId);

      // Round 3: open 1 case — should go to CommitFinal
      const state3 = await game.getGameState(gameId);
      const available3 = getUnopenedNonPlayerCases(state3.openedBitmap, 0);
      await playRound(gameId, available3.slice(0, 1), 10004n);

      const finalState = await game.getGameState(gameId);
      expect(finalState.phase).to.equal(GamePhase.CommitFinal);
    }

    it("reaches CommitFinal after all rounds", async function () {
      const gameId = await setupToCommitRound(GameTier.STANDARD, 0, 12345n);
      await playToFinal(gameId);
    });

    it("keep: player gets their case value", async function () {
      const gameId = await setupToCommitRound(GameTier.STANDARD, 0, 12345n);
      await playToFinal(gameId);

      const salt = 77777n;
      const commitHash = computeFinalCommitHash(false, salt);
      await game.connect(player).commitFinalDecision(gameId, commitHash);
      await mineBlock();
      await game.connect(player).revealFinalDecision(gameId, false, salt);

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.GameOver);
      expect(state.finalPayout).to.be.gt(0n);
    });

    it("swap: player gets other case value", async function () {
      const gameId = await setupToCommitRound(GameTier.STANDARD, 0, 12345n);
      await playToFinal(gameId);

      const salt = 88888n;
      const commitHash = computeFinalCommitHash(true, salt);
      await game.connect(player).commitFinalDecision(gameId, commitHash);
      await mineBlock();
      await game.connect(player).revealFinalDecision(gameId, true, salt);

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.GameOver);
      expect(state.finalPayout).to.be.gt(0n);
    });

    it("commit stores block number for reveal delay check", async function () {
      // The TooEarlyToReveal check enforces block.number > commitBlock.
      // In Hardhat automine mode, each TX mines a new block, so we verify
      // the commitBlock is correctly stored and reveal works after 1+ block.
      const gameId = await setupToCommitRound(GameTier.STANDARD, 0, 12345n);
      await playToFinal(gameId);

      const salt = 77777n;
      const commitHash = computeFinalCommitHash(false, salt);
      await game.connect(player).commitFinalDecision(gameId, commitHash);

      const commitState = await game.getCommitState(gameId);
      expect(commitState.commitBlock).to.be.gt(0n);

      // Reveal succeeds after mining 1 block (Hardhat automine does this)
      await mineBlock();
      await game.connect(player).revealFinalDecision(gameId, false, salt);
      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.GameOver);
    });

    it("all 12 values assigned after game over", async function () {
      const gameId = await setupToCommitRound(GameTier.STANDARD, 0, 12345n);
      await playToFinal(gameId);

      const salt = 77777n;
      const commitHash = computeFinalCommitHash(false, salt);
      await game.connect(player).commitFinalDecision(gameId, commitHash);
      await mineBlock();
      await game.connect(player).revealFinalDecision(gameId, false, salt);

      // All 12 values should now be collapsed
      const allValues: number[] = [];
      for (let i = 0; i < 12; i++) {
        let value: bigint;
        if (i === 0) {
          // Player's case — readable after game over
          value = await game.getCaseValue(gameId, i);
        } else {
          value = await game.getCaseValue(gameId, i);
        }
        allValues.push(Number(value));
      }

      const sorted = [...allValues].sort((a, b) => a - b);
      expect(sorted).to.deep.equal(TIER_VALUES[GameTier.STANDARD]);
    });
  });

  // ──────────── Forfeit ────────────

  describe("Forfeit", function () {
    it("reverts if within 256-block window", async function () {
      const gameId = await setupToCommitRound();
      const commitHash = computeRoundCommitHash([1, 2, 3, 4], 55555n);
      await game.connect(player).commitRound(gameId, commitHash);

      await expect(
        game.connect(banker).forfeitGame(gameId)
      ).to.be.revertedWithCustomError(game, "RevealWindowActive");
    });

    it("reverts if not banker", async function () {
      const gameId = await setupToCommitRound();
      const commitHash = computeRoundCommitHash([1, 2, 3, 4], 55555n);
      await game.connect(player).commitRound(gameId, commitHash);

      await expect(
        game.connect(player).forfeitGame(gameId)
      ).to.be.revertedWithCustomError(game, "NotBanker");
    });

    it("reverts from wrong phase", async function () {
      const gameId = await setupToCommitRound();
      // Still in CommitRound, not WaitingForReveal
      await expect(
        game.connect(banker).forfeitGame(gameId)
      ).to.be.revertedWithCustomError(game, "CannotForfeit");
    });

    it("banker reclaims all funds after window expires", async function () {
      const gameId = await setupToCommitRound();
      const commitHash = computeRoundCommitHash([1, 2, 3, 4], 55555n);
      await game.connect(player).commitRound(gameId, commitHash);

      // Mine 257 blocks to expire the reveal window
      await ethers.provider.send("hardhat_mine", ["0x101"]);

      const balBefore = await ethers.provider.getBalance(banker.address);
      const tx = await game.connect(banker).forfeitGame(gameId);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(banker.address);

      // Banker should get back their deposit + player's entry fee
      expect(balAfter + gasUsed).to.be.gt(balBefore);

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.GameOver);
    });
  });

  // ──────────── Full Game Simulations ────────────

  describe("Full Game Simulations", function () {
    it("complete STANDARD game with deal accepted", async function () {
      const gameId = await setupToCommitRound(GameTier.STANDARD, 0, 12345n);

      // Round 0: open cases 1-4
      await playRound(gameId, [1, 2, 3, 4], 10001n);

      // Accept deal
      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.BankerOffer);

      await game.connect(player).acceptDeal(gameId);

      const finalState = await game.getGameState(gameId);
      expect(finalState.phase).to.equal(GamePhase.GameOver);
      expect(finalState.finalPayout).to.be.gt(0n);
    });

    it("complete MICRO game to final swap", async function () {
      const gameId = await setupToCommitRound(GameTier.MICRO, 0, 12345n);

      // Play all rounds
      let openedBitmap = 0n;
      const roundSalts = [10001n, 10002n, 10003n, 10004n];

      for (let round = 0; round < 4; round++) {
        const available = getUnopenedNonPlayerCases(openedBitmap, 0);
        const toOpen = available.slice(0, CASES_PER_ROUND[round]);
        await playRound(gameId, toOpen, roundSalts[round]);

        const state = await game.getGameState(gameId);
        openedBitmap = state.openedBitmap;

        if (Number(state.phase) === GamePhase.BankerOffer) {
          await game.connect(player).rejectDeal(gameId);
        }
      }

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.CommitFinal);

      // Swap
      const commitHash = computeFinalCommitHash(true, 99999n);
      await game.connect(player).commitFinalDecision(gameId, commitHash);
      await mineBlock();
      await game.connect(player).revealFinalDecision(gameId, true, 99999n);

      const finalState = await game.getGameState(gameId);
      expect(finalState.phase).to.equal(GamePhase.GameOver);
      expect(finalState.tier).to.equal(GameTier.MICRO);
    });

    it("complete HIGH game — values from HIGH_VALUES", async function () {
      const gameId = await setupToCommitRound(GameTier.HIGH, 0, 12345n);
      await playRound(gameId, [1, 2, 3, 4], 10001n);

      // Verify opened values are from HIGH tier
      for (const idx of [1, 2, 3, 4]) {
        const value = Number(await game.getCaseValue(gameId, idx));
        expect(TIER_VALUES[GameTier.HIGH]).to.include(value);
      }

      await game.connect(player).acceptDeal(gameId);
      const finalState = await game.getGameState(gameId);
      expect(finalState.phase).to.equal(GamePhase.GameOver);
    });
  });

  // ──────────── Settlement ────────────

  describe("Settlement", function () {
    it("contract has zero balance after settlement", async function () {
      const gameId = await setupToCommitRound();
      await playRound(gameId, [1, 2, 3, 4], 55555n);
      await game.connect(player).acceptDeal(gameId);

      const balance = await ethers.provider.getBalance(await game.getAddress());
      expect(balance).to.equal(0n);
    });

    it("banker receives refund", async function () {
      const gameId = await setupToCommitRound();
      await playRound(gameId, [1, 2, 3, 4], 55555n);

      const bankerBefore = await ethers.provider.getBalance(banker.address);
      await game.connect(player).acceptDeal(gameId);
      const bankerAfter = await ethers.provider.getBalance(banker.address);

      expect(bankerAfter).to.be.gt(bankerBefore);
    });
  });

  // ──────────── View Functions ────────────

  describe("View Functions", function () {
    it("getRemainingValues returns unused tier values", async function () {
      const gameId = await setupToCommitRound();
      const remaining = await game.getRemainingValues(gameId);
      // All 12 values should be remaining (none opened yet)
      const values = remaining.map(v => Number(v)).sort((a, b) => a - b);
      expect(values).to.deep.equal(TIER_VALUES[GameTier.STANDARD]);
    });

    it("getRemainingValues shrinks after opening cases", async function () {
      const gameId = await setupToCommitRound();
      await playRound(gameId, [1, 2, 3, 4], 55555n);

      const remaining = await game.getRemainingValues(gameId);
      expect(remaining.length).to.equal(8); // 12 - 4 opened
    });

    it("getCaseValue reverts for unopened cases", async function () {
      const gameId = await setupToCommitRound();
      await expect(game.getCaseValue(gameId, 5)).to.be.revertedWith("Case not revealed");
    });

    it("getCommitState returns commit info", async function () {
      const gameId = await setupToCommitRound();
      const commitHash = computeRoundCommitHash([1, 2, 3, 4], 55555n);
      await game.connect(player).commitRound(gameId, commitHash);

      const commitState = await game.getCommitState(gameId);
      expect(commitState.commitHash).to.equal(commitHash);
      expect(commitState.commitBlock).to.be.gt(0n);
    });

    it("getBettingOutcome returns results after game over", async function () {
      const gameId = await setupToCommitRound();
      await playRound(gameId, [1, 2, 3, 4], 55555n);
      await game.connect(player).acceptDeal(gameId);

      const outcome = await game.getBettingOutcome(gameId);
      expect(outcome.dealTaken).to.be.true;
      expect(outcome.playerCaseValue).to.be.gt(0n);
      expect(outcome.finalPayout).to.be.gt(0n);
    });

    it("getBettingOutcome reverts before game over", async function () {
      const gameId = await setupToCommitRound();
      await expect(game.getBettingOutcome(gameId)).to.be.revertedWith("Game not over");
    });
  });

  // ──────────── Multiple Games ────────────

  describe("Multiple Simultaneous Games", function () {
    it("two games run independently", async function () {
      const game1 = await setupToCommitRound(GameTier.STANDARD, 0, 11111n);
      const game2 = await setupToCommitRound(GameTier.MICRO, 0, 22222n);

      // Play round on game 1
      await playRound(game1, [1, 2, 3, 4], 55555n);
      const state1 = await game.getGameState(game1);
      expect(state1.phase).to.equal(GamePhase.BankerOffer);

      // Game 2 should still be in CommitRound
      const state2 = await game.getGameState(game2);
      expect(state2.phase).to.equal(GamePhase.CommitRound);
    });
  });
});
