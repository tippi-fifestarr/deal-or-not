import { expect } from "chai";
import { ethers } from "hardhat";
import { CashCase, DealOrNoDeal, VRFCoordinatorV2_5Mock, MockV3Aggregator } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           Brodinger's Cheat-Proof — Side-by-Side                ║
 * ║                                                                  ║
 * ║  CaseCheat works perfectly against DealOrNoDeal (Fisher-Yates).  ║
 * ║  CaseCheat fails completely against CashCase (Brodinger's Case). ║
 * ║                                                                  ║
 * ║  Values don't exist until observed. Nothing to steal.            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const CASE_VALUES = [1, 5, 10, 25, 50, 100, 200, 300, 400, 500, 750, 1000];
const ETH_USD_PRICE = 200000000000n;
const ENTRY_FEE_CENTS = 100n;
const MAX_CASE_CENTS = 1000n;
const SLIPPAGE_BPS = 500n;

function usdToWei(usdCents: bigint): bigint {
  return (usdCents * 10n ** 24n) / ETH_USD_PRICE;
}

function withSlippage(amount: bigint): bigint {
  return (amount * (10000n + SLIPPAGE_BPS)) / 10000n;
}

function computeCommitHash(caseIndex: number, salt: bigint): bigint {
  return BigInt(ethers.solidityPackedKeccak256(["uint8", "uint256"], [caseIndex, salt]));
}

describe("Brodinger's Cheat-Proof", function () {
  let legacyGame: DealOrNoDeal;
  let cashCase: CashCase;
  let vrfCoordinator: VRFCoordinatorV2_5Mock;
  let priceFeed: MockV3Aggregator;
  let owner: SignerWithAddress;
  let banker: SignerWithAddress;
  let attacker: SignerWithAddress;
  let subscriptionId: bigint;

  const keyHash = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";

  beforeEach(async function () {
    [owner, banker, attacker] = await ethers.getSigners();

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

    // Deploy BOTH contracts — legacy and Brodinger's
    const LegacyFactory = await ethers.getContractFactory("DealOrNoDeal");
    legacyGame = await LegacyFactory.deploy(
      await vrfCoordinator.getAddress(),
      subscriptionId,
      keyHash,
      await priceFeed.getAddress()
    );
    await legacyGame.waitForDeployment();
    await vrfCoordinator.addConsumer(subscriptionId, await legacyGame.getAddress());

    const CashCaseFactory = await ethers.getContractFactory("CashCase");
    cashCase = await CashCaseFactory.deploy(
      await vrfCoordinator.getAddress(),
      subscriptionId,
      keyHash,
      await priceFeed.getAddress()
    );
    await cashCase.waitForDeployment();
    await vrfCoordinator.addConsumer(subscriptionId, await cashCase.getAddress());
  });

  // ──────────── Helpers ────────────

  async function setupLegacyGame(): Promise<bigint> {
    const deposit = withSlippage(usdToWei(MAX_CASE_CENTS));
    const createTx = await legacyGame.connect(banker).createGame({ value: deposit });
    const createReceipt = await createTx.wait();
    const createEvent = createReceipt?.logs.find((log: any) => {
      try {
        return legacyGame.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "GameCreated";
      } catch { return false; }
    });
    const gameId = legacyGame.interface.parseLog({ topics: [...createEvent!.topics], data: createEvent!.data })!.args[0];

    const commitHash = computeCommitHash(0, 12345n);
    const entryDeposit = withSlippage(usdToWei(ENTRY_FEE_CENTS));
    await legacyGame.connect(attacker).joinGame(gameId, commitHash, { value: entryDeposit });

    const gameState = await legacyGame.games(gameId);
    await vrfCoordinator.fulfillRandomWords(gameState.vrfRequestId, await legacyGame.getAddress());
    await legacyGame.connect(attacker).revealCase(gameId, 0, 12345n);

    return gameId;
  }

  async function setupCashCaseGame(): Promise<bigint> {
    const deposit = withSlippage(usdToWei(MAX_CASE_CENTS));
    const createTx = await cashCase.connect(banker)["createGame(uint8)"](1, { value: deposit }); // STANDARD
    const createReceipt = await createTx.wait();
    const createEvent = createReceipt?.logs.find((log: any) => {
      try {
        return cashCase.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "GameCreated";
      } catch { return false; }
    });
    const gameId = cashCase.interface.parseLog({ topics: [...createEvent!.topics], data: createEvent!.data })!.args[0];

    const commitHash = computeCommitHash(0, 12345n);
    const entryDeposit = withSlippage(usdToWei(ENTRY_FEE_CENTS));
    await cashCase.connect(attacker).joinGame(gameId, commitHash, { value: entryDeposit });

    const gameState = await cashCase.games(gameId);
    await vrfCoordinator.fulfillRandomWords(gameState.vrfRequestId, await cashCase.getAddress());
    await cashCase.connect(attacker).revealCase(gameId, 0, 12345n);

    return gameId;
  }

  // ──────────── The Proof ────────────

  it("DealOrNoDeal: caseValues is NON-ZERO after VRF (exploitable)", async function () {
    const gameId = await setupLegacyGame();
    const gameData = await legacyGame.games(gameId);
    expect(gameData.caseValues).to.not.equal(0n);

    // Decode ALL 12 values
    const stolen = new Map<number, number>();
    for (let i = 0; i < 12; i++) {
      stolen.set(i, Number((gameData.caseValues >> BigInt(i * 20)) & 0xFFFFFn));
    }
    const allValues = Array.from(stolen.values()).sort((a, b) => a - b);
    expect(allValues).to.deep.equal(CASE_VALUES);

    console.log("\n    🔓 DealOrNoDeal: ALL values readable from storage after VRF");
    console.log("       caseValues =", gameData.caseValues.toString().slice(0, 40) + "...");
    console.log("       Decoded:", allValues.join(", "));
    console.log("       → Attacker knows EVERYTHING\n");
  });

  it("CashCase: caseValues is ZERO after VRF (Brodinger's: nothing exists)", async function () {
    const gameId = await setupCashCaseGame();
    const gameData = await cashCase.games(gameId);
    expect(gameData.caseValues).to.equal(0n);
    expect(gameData.vrfSeed).to.not.equal(0n);

    console.log("\n    🔒 CashCase (Brodinger's): caseValues = 0 after VRF");
    console.log("       vrfSeed stored, but values DO NOT EXIST yet");
    console.log("       → Nothing to steal. Nothing to decode.\n");
  });

  it("CashCase: commit-reveal prevents same-block precomputation", async function () {
    const gameId = await setupCashCaseGame();

    const caseIndices = [1, 2, 3, 4];
    const salt = 55555n;
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8[]", "uint256"],
      [caseIndices, salt]
    );
    const commitHash = BigInt(ethers.keccak256(encoded));

    // Disable automine to put commit + reveal in same block
    await ethers.provider.send("evm_setAutomine", [false]);
    await cashCase.connect(attacker).commitRound(gameId, commitHash);
    const revealTx = await cashCase.connect(attacker).revealRound(gameId, caseIndices, salt);
    await ethers.provider.send("evm_mine", []);
    await ethers.provider.send("evm_setAutomine", [true]);

    // The reveal TX should have reverted — TooEarlyToReveal
    const receipt = await revealTx.wait().catch(() => null);
    expect(receipt).to.be.null;

    console.log("\n    ⏱️  CashCase: TooEarlyToReveal — same-block reveal REJECTED");
    console.log("       Bot cannot commit + compute outcome + reveal atomically");
    console.log("       Must wait 1+ block. blockhash(commitBlock) adds entropy.\n");
  });

  it("SIDE-BY-SIDE: CaseCheat works on legacy, fails on Brodinger's", async function () {
    // ─── Attack succeeds on DealOrNoDeal ───
    const legacyId = await setupLegacyGame();
    const legacyData = await legacyGame.games(legacyId);
    const stolen = new Map<number, number>();
    for (let i = 0; i < 12; i++) {
      stolen.set(i, Number((legacyData.caseValues >> BigInt(i * 20)) & 0xFFFFFn));
    }

    // Bot finds cheapest case
    let cheapest = -1;
    let cheapestVal = Infinity;
    for (const [idx, val] of stolen) {
      if (idx !== 0 && val < cheapestVal) { cheapestVal = val; cheapest = idx; }
    }

    // Opens the cheapest case first — guaranteed low value removed
    await legacyGame.connect(attacker).openCase(legacyId, cheapest);
    const openedValue = Number(await legacyGame.getCaseValue(legacyId, cheapest));
    expect(openedValue).to.equal(cheapestVal); // Bot prediction was correct

    // ─── Attack fails on CashCase ───
    const cashId = await setupCashCaseGame();
    const cashData = await cashCase.games(cashId);

    // Try to read caseValues — it's 0. Nothing to decode.
    const decodedValues: number[] = [];
    for (let i = 0; i < 12; i++) {
      decodedValues.push(Number((cashData.caseValues >> BigInt(i * 20)) & 0xFFFFFn));
    }
    // All decoded values are 0 — there's nothing in storage
    expect(decodedValues.every(v => v === 0)).to.be.true;

    console.log("\n    ╔═══════════════════════════════════════════════════════════╗");
    console.log("    ║         SIDE-BY-SIDE: Attack vs Brodinger's Case          ║");
    console.log("    ╠═══════════════════════════════════════════════════════════╣");
    console.log("    ║                                                           ║");
    console.log(`    ║  DealOrNoDeal (Fisher-Yates):                              ║`);
    console.log(`    ║    caseValues after VRF: ${legacyData.caseValues.toString().slice(0, 20).padEnd(20)}...      ║`);
    console.log(`    ║    Bot read case ${cheapest}: $${(cheapestVal / 100).toFixed(2).padEnd(6)} (correct!)           ║`);
    console.log(`    ║    → EXPLOIT SUCCESSFUL                                    ║`);
    console.log("    ║                                                           ║");
    console.log("    ║  CashCase (Brodinger's Case):                              ║");
    console.log("    ║    caseValues after VRF: 0                                ║");
    console.log("    ║    Bot reads: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]      ║");
    console.log("    ║    → NOTHING TO EXPLOIT                                    ║");
    console.log("    ║                                                           ║");
    console.log("    ╠═══════════════════════════════════════════════════════════╣");
    console.log("    ║  \"Word on the street is someone knows what's in the case\" ║");
    console.log("    ║   Not anymore. Brodinger's Case: values don't exist       ║");
    console.log("    ║   until observed.                                         ║");
    console.log("    ╚═══════════════════════════════════════════════════════════╝\n");
  });
});
