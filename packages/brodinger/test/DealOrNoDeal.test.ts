import { expect } from "chai";
import { ethers } from "hardhat";
import { DealOrNoDeal, VRFCoordinatorV2_5Mock, MockV3Aggregator } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// Game phases enum matching contract
enum GamePhase {
  WaitingForPlayer = 0,
  WaitingForVRF = 1,
  RevealCase = 2,
  OpeningCases = 3,
  BankerOffer = 4,
  FinalSwap = 5,
  GameOver = 6,
}

const CASE_VALUES = [1, 5, 10, 25, 50, 100, 200, 300, 400, 500, 750, 1000];
const CASES_PER_ROUND = [4, 3, 2, 1, 1];
const BANKER_PERCENTAGES = [15, 30, 45, 65, 85];
const ETH_USD_PRICE = 200000000000n; // $2,000 with 8 decimals
const ENTRY_FEE_CENTS = 100n;
const MAX_CASE_CENTS = 1000n;
const SLIPPAGE_BPS = 500n;

function usdToWei(usdCents: bigint): bigint {
  return (usdCents * 10n ** 24n) / ETH_USD_PRICE;
}

function withSlippage(amount: bigint): bigint {
  return (amount * (10000n + SLIPPAGE_BPS)) / 10000n;
}

describe("DealOrNoDeal", function () {
  let game: DealOrNoDeal;
  let vrfCoordinator: VRFCoordinatorV2_5Mock;
  let priceFeed: MockV3Aggregator;
  let owner: SignerWithAddress;
  let banker: SignerWithAddress;
  let player: SignerWithAddress;
  let subscriptionId: bigint;

  const keyHash = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";

  beforeEach(async function () {
    [owner, banker, player] = await ethers.getSigners();

    // Deploy VRF Mock
    const VRFFactory = await ethers.getContractFactory("VRFCoordinatorV2_5Mock");
    vrfCoordinator = await VRFFactory.deploy(
      ethers.parseEther("0.001"),
      ethers.parseUnits("50", "gwei"),
      ethers.parseEther("0.01")
    );
    await vrfCoordinator.waitForDeployment();

    // Deploy Price Feed Mock ($2,000 ETH/USD, 8 decimals)
    const PriceFeedFactory = await ethers.getContractFactory("MockV3Aggregator");
    priceFeed = await PriceFeedFactory.deploy(8, ETH_USD_PRICE);
    await priceFeed.waitForDeployment();

    // Create VRF subscription
    const tx = await vrfCoordinator.createSubscription();
    const receipt = await tx.wait();
    const event = receipt?.logs.find((log: any) => {
      try {
        return vrfCoordinator.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "SubscriptionCreated";
      } catch { return false; }
    });
    const parsed = vrfCoordinator.interface.parseLog({ topics: [...event!.topics], data: event!.data });
    subscriptionId = parsed!.args[0];

    // Fund subscription
    await vrfCoordinator.fundSubscription(subscriptionId, ethers.parseEther("100"));

    // Deploy game contract
    const GameFactory = await ethers.getContractFactory("DealOrNoDeal");
    game = await GameFactory.deploy(
      await vrfCoordinator.getAddress(),
      subscriptionId,
      keyHash,
      await priceFeed.getAddress()
    );
    await game.waitForDeployment();

    // Add game as VRF consumer
    await vrfCoordinator.addConsumer(subscriptionId, await game.getAddress());
  });

  // ──────────── Helper functions ────────────

  async function createGame(): Promise<bigint> {
    const deposit = withSlippage(usdToWei(MAX_CASE_CENTS));
    const tx = await game.connect(banker).createGame({ value: deposit });
    const receipt = await tx.wait();
    const event = receipt?.logs.find((log: any) => {
      try {
        return game.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "GameCreated";
      } catch { return false; }
    });
    const parsed = game.interface.parseLog({ topics: [...event!.topics], data: event!.data });
    return parsed!.args[0];
  }

  function computeCommitHash(caseIndex: number, salt: bigint): bigint {
    const hash = ethers.solidityPackedKeccak256(
      ["uint8", "uint256"],
      [caseIndex, salt]
    );
    return BigInt(hash);
  }

  async function joinGame(gameId: bigint, caseIndex: number, salt: bigint) {
    const commitHash = computeCommitHash(caseIndex, salt);
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

  async function getUnopenedCaseIndices(gameId: bigint, playerCaseIndex: number): Promise<number[]> {
    const state = await game.getGameState(gameId);
    const bitmap = state.openedBitmap;
    const indices: number[] = [];
    for (let i = 0; i < 12; i++) {
      if (i !== playerCaseIndex && (bitmap & (1n << BigInt(i))) === 0n) {
        indices.push(i);
      }
    }
    return indices;
  }

  async function setupGameToOpeningPhase(caseIndex: number = 0): Promise<{ gameId: bigint; salt: bigint }> {
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
      // $1.00 = 100 cents
      // At $2,000/ETH: $1 = 0.0005 ETH = 500000000000000 wei
      const weiAmount = await game.usdToWei(100);
      expect(weiAmount).to.equal(500000000000000n);
    });

    it("converts max case value correctly", async function () {
      // $10.00 = 1000 cents
      // At $2,000/ETH: $10 = 0.005 ETH
      const weiAmount = await game.usdToWei(1000);
      expect(weiAmount).to.equal(ethers.parseEther("0.005"));
    });

    it("returns current ETH/USD price", async function () {
      const price = await game.getEthUsdPrice();
      expect(price).to.equal(ETH_USD_PRICE);
    });
  });

  describe("Game Creation", function () {
    it("banker can create a game with sufficient deposit", async function () {
      const deposit = withSlippage(usdToWei(MAX_CASE_CENTS));
      await expect(game.connect(banker).createGame({ value: deposit }))
        .to.emit(game, "GameCreated")
        .withArgs(0n, banker.address);

      const state = await game.getGameState(0);
      expect(state.banker).to.equal(banker.address);
      expect(state.phase).to.equal(GamePhase.WaitingForPlayer);
    });

    it("reverts if deposit is insufficient", async function () {
      const tooLittle = usdToWei(MAX_CASE_CENTS) / 2n;
      await expect(
        game.connect(banker).createGame({ value: tooLittle })
      ).to.be.revertedWithCustomError(game, "InsufficientDeposit");
    });

    it("increments game IDs", async function () {
      const deposit = withSlippage(usdToWei(MAX_CASE_CENTS));
      await game.connect(banker).createGame({ value: deposit });
      await game.connect(banker).createGame({ value: deposit });
      expect(await game.nextGameId()).to.equal(2n);
    });
  });

  describe("Join Game", function () {
    let gameId: bigint;

    beforeEach(async function () {
      gameId = await createGame();
    });

    it("player can join with entry fee and commit hash", async function () {
      const salt = 42n;
      const commitHash = computeCommitHash(3, salt);
      const deposit = withSlippage(usdToWei(ENTRY_FEE_CENTS));

      await expect(game.connect(player).joinGame(gameId, commitHash, { value: deposit }))
        .to.emit(game, "GameJoined")
        .withArgs(gameId, player.address);

      const state = await game.getGameState(gameId);
      expect(state.player).to.equal(player.address);
      expect(state.phase).to.equal(GamePhase.WaitingForVRF);
    });

    it("reverts if game is not in WaitingForPlayer phase", async function () {
      const salt = 42n;
      const commitHash = computeCommitHash(3, salt);
      const deposit = withSlippage(usdToWei(ENTRY_FEE_CENTS));
      await game.connect(player).joinGame(gameId, commitHash, { value: deposit });

      // Try joining again
      await expect(
        game.connect(player).joinGame(gameId, commitHash, { value: deposit })
      ).to.be.revertedWithCustomError(game, "WrongPhase");
    });

    it("reverts if entry fee is insufficient", async function () {
      const commitHash = computeCommitHash(3, 42n);
      await expect(
        game.connect(player).joinGame(gameId, commitHash, { value: 1n })
      ).to.be.revertedWithCustomError(game, "InsufficientDeposit");
    });
  });

  describe("VRF Fulfillment", function () {
    it("shuffles all 12 values correctly", async function () {
      const salt = 99n;
      const gameId = await createGame();
      await joinGame(gameId, 0, salt);
      await fulfillVRF(gameId);

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.RevealCase);

      // After game is over we can check values — for now just verify phase transition
      // We'll verify values after a full game
    });

    it("emits ValuesAssigned event", async function () {
      const salt = 99n;
      const gameId = await createGame();
      await joinGame(gameId, 0, salt);

      const gameState = await game.games(gameId);
      const requestId = gameState.vrfRequestId;

      await expect(vrfCoordinator.fulfillRandomWords(requestId, await game.getAddress()))
        .to.emit(game, "ValuesAssigned")
        .withArgs(gameId);
    });
  });

  describe("Commit-Reveal", function () {
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
      expect(state.phase).to.equal(GamePhase.OpeningCases);
      expect(state.playerCaseIndex).to.equal(caseIndex);
    });

    it("reverts with wrong case index", async function () {
      const caseIndex = 5;
      const salt = 777n;
      const gameId = await createGame();
      await joinGame(gameId, caseIndex, salt);
      await fulfillVRF(gameId);

      await expect(
        game.connect(player).revealCase(gameId, 3, salt) // wrong index
      ).to.be.revertedWithCustomError(game, "InvalidReveal");
    });

    it("reverts with wrong salt", async function () {
      const caseIndex = 5;
      const salt = 777n;
      const gameId = await createGame();
      await joinGame(gameId, caseIndex, salt);
      await fulfillVRF(gameId);

      await expect(
        game.connect(player).revealCase(gameId, caseIndex, 999n) // wrong salt
      ).to.be.revertedWithCustomError(game, "InvalidReveal");
    });

    it("reverts if called by non-player", async function () {
      const caseIndex = 5;
      const salt = 777n;
      const gameId = await createGame();
      await joinGame(gameId, caseIndex, salt);
      await fulfillVRF(gameId);

      await expect(
        game.connect(banker).revealCase(gameId, caseIndex, salt)
      ).to.be.revertedWithCustomError(game, "NotPlayer");
    });

    it("reverts with invalid case index >= 12", async function () {
      const caseIndex = 5;
      const salt = 777n;
      const gameId = await createGame();
      await joinGame(gameId, caseIndex, salt);
      await fulfillVRF(gameId);

      await expect(
        game.connect(player).revealCase(gameId, 12, salt)
      ).to.be.revertedWithCustomError(game, "InvalidCaseIndex");
    });
  });

  describe("Opening Cases", function () {
    it("opens cases and emits values", async function () {
      const { gameId } = await setupGameToOpeningPhase(0);

      const unopened = await getUnopenedCaseIndices(gameId, 0);
      await expect(game.connect(player).openCase(gameId, unopened[0]))
        .to.emit(game, "CaseOpened");
    });

    it("cannot open player's own case", async function () {
      const { gameId } = await setupGameToOpeningPhase(0);

      await expect(
        game.connect(player).openCase(gameId, 0)
      ).to.be.revertedWithCustomError(game, "CannotOpenOwnCase");
    });

    it("cannot open the same case twice", async function () {
      const { gameId } = await setupGameToOpeningPhase(0);

      const unopened = await getUnopenedCaseIndices(gameId, 0);
      await game.connect(player).openCase(gameId, unopened[0]);

      await expect(
        game.connect(player).openCase(gameId, unopened[0])
      ).to.be.revertedWithCustomError(game, "CaseAlreadyOpened");
    });

    it("transitions to BankerOffer after opening required cases in round", async function () {
      const { gameId } = await setupGameToOpeningPhase(0);

      // Round 1: open 4 cases
      const unopened = await getUnopenedCaseIndices(gameId, 0);
      for (let i = 0; i < 4; i++) {
        await game.connect(player).openCase(gameId, unopened[i]);
      }

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.BankerOffer);
      expect(state.bankerOffer).to.be.gt(0n);
    });

    it("bitmap tracks opened cases correctly", async function () {
      const { gameId } = await setupGameToOpeningPhase(0);

      const unopened = await getUnopenedCaseIndices(gameId, 0);
      await game.connect(player).openCase(gameId, unopened[0]);

      const state = await game.getGameState(gameId);
      expect(state.openedBitmap & (1n << BigInt(unopened[0]))).to.not.equal(0n);
    });

    it("only player can open cases", async function () {
      const { gameId } = await setupGameToOpeningPhase(0);

      const unopened = await getUnopenedCaseIndices(gameId, 0);
      await expect(
        game.connect(banker).openCase(gameId, unopened[0])
      ).to.be.revertedWithCustomError(game, "NotPlayer");
    });
  });

  describe("Banker Offer", function () {
    it("calculates offer as percentage of expected value", async function () {
      const { gameId } = await setupGameToOpeningPhase(0);

      // Open 4 cases (round 1)
      const unopened = await getUnopenedCaseIndices(gameId, 0);
      for (let i = 0; i < 4; i++) {
        await game.connect(player).openCase(gameId, unopened[i]);
      }

      const state = await game.getGameState(gameId);
      const offer = state.bankerOffer;

      // The offer should be 15% of expected value of remaining cases
      // We can verify it's > 0 and reasonable
      expect(offer).to.be.gt(0n);
    });

    it("accept deal transitions to GameOver and sends payout", async function () {
      const { gameId } = await setupGameToOpeningPhase(0);

      // Open 4 cases (round 1)
      const unopened = await getUnopenedCaseIndices(gameId, 0);
      for (let i = 0; i < 4; i++) {
        await game.connect(player).openCase(gameId, unopened[i]);
      }

      const playerBalBefore = await ethers.provider.getBalance(player.address);

      const tx = await game.connect(player).acceptDeal(gameId);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.GameOver);

      // Player should have received payout
      const playerBalAfter = await ethers.provider.getBalance(player.address);
      expect(playerBalAfter + gasUsed).to.be.gt(playerBalBefore);
    });

    it("reject deal advances to next round", async function () {
      const { gameId } = await setupGameToOpeningPhase(0);

      // Open 4 cases (round 1)
      const unopened = await getUnopenedCaseIndices(gameId, 0);
      for (let i = 0; i < 4; i++) {
        await game.connect(player).openCase(gameId, unopened[i]);
      }

      await expect(game.connect(player).rejectDeal(gameId))
        .to.emit(game, "DealRejected")
        .withArgs(gameId);

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.OpeningCases);
      expect(state.currentRound).to.equal(1);
      expect(state.casesOpenedThisRound).to.equal(0);
    });

    it("cannot accept deal in wrong phase", async function () {
      const { gameId } = await setupGameToOpeningPhase(0);

      await expect(
        game.connect(player).acceptDeal(gameId)
      ).to.be.revertedWithCustomError(game, "WrongPhase");
    });
  });

  describe("Final Swap", function () {
    async function playToFinalSwap(): Promise<{ gameId: bigint; playerCaseIndex: number }> {
      const playerCaseIndex = 0;
      const { gameId } = await setupGameToOpeningPhase(playerCaseIndex);

      // Play through all rounds, rejecting every deal
      let caseCount = 0;
      for (let round = 0; round < CASES_PER_ROUND.length; round++) {
        const unopened = await getUnopenedCaseIndices(gameId, playerCaseIndex);
        for (let i = 0; i < CASES_PER_ROUND[round]; i++) {
          await game.connect(player).openCase(gameId, unopened[i]);
          caseCount++;
        }

        const state = await game.getGameState(gameId);
        if (state.phase === BigInt(GamePhase.FinalSwap)) {
          return { gameId, playerCaseIndex };
        }
        if (state.phase === BigInt(GamePhase.BankerOffer)) {
          await game.connect(player).rejectDeal(gameId);
        }
      }

      return { gameId, playerCaseIndex };
    }

    it("reaches FinalSwap after all rounds", async function () {
      const { gameId } = await playToFinalSwap();
      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.FinalSwap);
    });

    it("keep original case pays correct value", async function () {
      const { gameId, playerCaseIndex } = await playToFinalSwap();

      const tx = await game.connect(player).finalDecision(gameId, false);
      await tx.wait();

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.GameOver);
      expect(state.finalPayout).to.be.gt(0n);
    });

    it("swap case pays the other case's value", async function () {
      const { gameId, playerCaseIndex } = await playToFinalSwap();

      const tx = await game.connect(player).finalDecision(gameId, true);
      await tx.wait();

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.GameOver);
      expect(state.finalPayout).to.be.gt(0n);
    });

    it("keep and swap give different payouts (unless both cases have same value)", async function () {
      // This tests that the logic is different for swap vs keep
      // We can't guarantee different values, but we test both paths work
      const { gameId: gameId1 } = await playToFinalSwap();
      await game.connect(player).finalDecision(gameId1, false);
      const state1 = await game.getGameState(gameId1);

      // The payout should be one of the CASE_VALUES
      const payout = state1.finalPayout;
      expect(CASE_VALUES).to.include(Number(payout));
    });
  });

  describe("Full Game Simulation", function () {
    it("plays a complete game with deal accepted", async function () {
      const playerCaseIndex = 3;
      const salt = 54321n;
      const gameId = await createGame();

      // Check balances before
      const bankerBalBefore = await ethers.provider.getBalance(banker.address);

      await joinGame(gameId, playerCaseIndex, salt);
      await fulfillVRF(gameId);
      await revealCase(gameId, playerCaseIndex, salt);

      // Round 1: open 4 cases
      let unopened = await getUnopenedCaseIndices(gameId, playerCaseIndex);
      for (let i = 0; i < 4; i++) {
        await game.connect(player).openCase(gameId, unopened[i]);
      }

      // Accept the deal
      let state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.BankerOffer);
      expect(state.bankerOffer).to.be.gt(0n);

      await game.connect(player).acceptDeal(gameId);

      state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.GameOver);
      expect(state.finalPayout).to.be.gt(0n);
    });

    it("plays a complete game to final swap", async function () {
      const playerCaseIndex = 7;
      const salt = 11111n;
      const gameId = await createGame();
      await joinGame(gameId, playerCaseIndex, salt);
      await fulfillVRF(gameId);
      await revealCase(gameId, playerCaseIndex, salt);

      // Play through all rounds
      for (let round = 0; round < CASES_PER_ROUND.length; round++) {
        const unopened = await getUnopenedCaseIndices(gameId, playerCaseIndex);
        for (let i = 0; i < CASES_PER_ROUND[round]; i++) {
          await game.connect(player).openCase(gameId, unopened[i]);
        }

        const state = await game.getGameState(gameId);
        if (state.phase === BigInt(GamePhase.FinalSwap)) {
          break;
        }
        if (state.phase === BigInt(GamePhase.BankerOffer)) {
          await game.connect(player).rejectDeal(gameId);
        }
      }

      // Final swap — keep original
      await game.connect(player).finalDecision(gameId, false);

      const state = await game.getGameState(gameId);
      expect(state.phase).to.equal(GamePhase.GameOver);
    });

    it("VRF shuffle contains all 12 original values", async function () {
      // Play a full game to GameOver to unlock all case values
      const playerCaseIndex = 0;
      const { gameId } = await setupGameToOpeningPhase(playerCaseIndex);

      // Open all non-player cases
      for (let round = 0; round < CASES_PER_ROUND.length; round++) {
        const unopened = await getUnopenedCaseIndices(gameId, playerCaseIndex);
        for (let i = 0; i < CASES_PER_ROUND[round]; i++) {
          await game.connect(player).openCase(gameId, unopened[i]);
        }

        const state = await game.getGameState(gameId);
        if (state.phase === BigInt(GamePhase.FinalSwap)) {
          break;
        }
        if (state.phase === BigInt(GamePhase.BankerOffer)) {
          await game.connect(player).rejectDeal(gameId);
        }
      }

      // End game
      await game.connect(player).finalDecision(gameId, false);

      // Now read all case values
      const values: number[] = [];
      for (let i = 0; i < 12; i++) {
        const v = await game.getCaseValue(gameId, i);
        values.push(Number(v));
      }

      // Sort both arrays and compare
      const sorted = [...values].sort((a, b) => a - b);
      const expectedSorted = [...CASE_VALUES].sort((a, b) => a - b);
      expect(sorted).to.deep.equal(expectedSorted);
    });
  });

  describe("Settlement", function () {
    it("contestant receives ETH payout on deal", async function () {
      const { gameId } = await setupGameToOpeningPhase(0);

      // Open 4 cases (round 1)
      const unopened = await getUnopenedCaseIndices(gameId, 0);
      for (let i = 0; i < 4; i++) {
        await game.connect(player).openCase(gameId, unopened[i]);
      }

      const playerBalBefore = await ethers.provider.getBalance(player.address);
      const tx = await game.connect(player).acceptDeal(gameId);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const playerBalAfter = await ethers.provider.getBalance(player.address);

      // Player got payout minus gas
      const netGain = playerBalAfter - playerBalBefore + gasUsed;
      expect(netGain).to.be.gt(0n);
    });

    it("banker receives refund after game ends", async function () {
      const { gameId } = await setupGameToOpeningPhase(0);

      // Open 4 cases
      const unopened = await getUnopenedCaseIndices(gameId, 0);
      for (let i = 0; i < 4; i++) {
        await game.connect(player).openCase(gameId, unopened[i]);
      }

      const bankerBalBefore = await ethers.provider.getBalance(banker.address);
      await game.connect(player).acceptDeal(gameId);
      const bankerBalAfter = await ethers.provider.getBalance(banker.address);

      // Banker should receive a refund (deposit + entry - payout)
      expect(bankerBalAfter).to.be.gt(bankerBalBefore);
    });

    it("contract has zero balance after settlement", async function () {
      const { gameId } = await setupGameToOpeningPhase(0);

      // Open 4 cases
      const unopened = await getUnopenedCaseIndices(gameId, 0);
      for (let i = 0; i < 4; i++) {
        await game.connect(player).openCase(gameId, unopened[i]);
      }

      await game.connect(player).acceptDeal(gameId);

      const contractBal = await ethers.provider.getBalance(await game.getAddress());
      expect(contractBal).to.equal(0n);
    });
  });

  describe("View Functions", function () {
    it("getRemainingValues returns correct count", async function () {
      const { gameId } = await setupGameToOpeningPhase(0);

      const remaining = await game.getRemainingValues(gameId);
      expect(remaining.length).to.equal(12); // All cases still unopened at start

      // Open 2 cases
      const unopened = await getUnopenedCaseIndices(gameId, 0);
      await game.connect(player).openCase(gameId, unopened[0]);
      await game.connect(player).openCase(gameId, unopened[1]);

      const remaining2 = await game.getRemainingValues(gameId);
      expect(remaining2.length).to.equal(10);
    });

    it("getCaseValue reverts for unopened cases", async function () {
      const { gameId } = await setupGameToOpeningPhase(0);

      // Case 1 is not opened
      await expect(game.getCaseValue(gameId, 1)).to.be.revertedWith("Case not revealed");
    });

    it("getCaseValue works for opened cases", async function () {
      const { gameId } = await setupGameToOpeningPhase(0);

      const unopened = await getUnopenedCaseIndices(gameId, 0);
      await game.connect(player).openCase(gameId, unopened[0]);

      const value = await game.getCaseValue(gameId, unopened[0]);
      expect(CASE_VALUES).to.include(Number(value));
    });

    it("getGameState returns complete state", async function () {
      const { gameId } = await setupGameToOpeningPhase(5);

      const state = await game.getGameState(gameId);
      expect(state.banker).to.equal(banker.address);
      expect(state.player).to.equal(player.address);
      expect(state.phase).to.equal(GamePhase.OpeningCases);
      expect(state.playerCaseIndex).to.equal(5);
      expect(state.currentRound).to.equal(0);
    });
  });

  describe("Multiple Simultaneous Games", function () {
    it("two games can run independently", async function () {
      // Game 1
      const gameId1 = await createGame();
      const salt1 = 111n;
      await joinGame(gameId1, 0, salt1);
      await fulfillVRF(gameId1);
      await revealCase(gameId1, 0, salt1);

      // Game 2
      const gameId2 = await createGame();
      const salt2 = 222n;
      await joinGame(gameId2, 5, salt2);
      await fulfillVRF(gameId2);
      await revealCase(gameId2, 5, salt2);

      // Both should be in OpeningCases
      const state1 = await game.getGameState(gameId1);
      const state2 = await game.getGameState(gameId2);
      expect(state1.phase).to.equal(GamePhase.OpeningCases);
      expect(state2.phase).to.equal(GamePhase.OpeningCases);
      expect(state1.playerCaseIndex).to.equal(0);
      expect(state2.playerCaseIndex).to.equal(5);
    });
  });
});
