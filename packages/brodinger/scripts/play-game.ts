/**
 * Plays a full game of Deal or No Deal on local Hardhat network.
 * Deploys contracts, creates game, plays through, and logs results.
 */
import { ethers } from "hardhat";

const CASE_VALUES_USD = [
  "$0.01", "$0.05", "$0.10", "$0.25", "$0.50", "$1.00",
  "$2.00", "$3.00", "$4.00", "$5.00", "$7.50", "$10.00",
];

async function main() {
  const [owner, bankerSigner, playerSigner] = await ethers.getSigners();

  console.log("\n=== Deploying Contracts ===\n");

  // Deploy mocks
  const VRFFactory = await ethers.getContractFactory("VRFCoordinatorV2_5Mock");
  const vrfCoordinator = await VRFFactory.deploy(
    ethers.parseEther("0.001"),
    ethers.parseUnits("50", "gwei"),
    ethers.parseEther("0.01")
  );
  const vrfAddress = await vrfCoordinator.getAddress();
  console.log("VRF Coordinator:", vrfAddress);

  const PriceFeedFactory = await ethers.getContractFactory("MockV3Aggregator");
  const priceFeed = await PriceFeedFactory.deploy(8, 200000000000n);
  console.log("Price Feed:", await priceFeed.getAddress());

  // Create subscription
  const tx = await vrfCoordinator.createSubscription();
  const receipt = await tx.wait();
  const event = receipt?.logs.find((log: any) => {
    try {
      return vrfCoordinator.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "SubscriptionCreated";
    } catch { return false; }
  });
  const parsed = vrfCoordinator.interface.parseLog({ topics: [...event!.topics], data: event!.data });
  const subscriptionId = parsed!.args[0];
  await vrfCoordinator.fundSubscription(subscriptionId, ethers.parseEther("100"));

  // Deploy game
  const GameFactory = await ethers.getContractFactory("DealOrNoDeal");
  const game = await GameFactory.deploy(
    vrfAddress,
    subscriptionId,
    "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae",
    await priceFeed.getAddress()
  );
  const gameAddress = await game.getAddress();
  await vrfCoordinator.addConsumer(subscriptionId, gameAddress);
  console.log("Game Contract:", gameAddress);

  // ─────── Play the game ───────

  console.log("\n=== Banker Creates Game ===\n");
  const maxCaseWei = await game.usdToWei(100000);
  const bankerDeposit = (maxCaseWei * 10500n) / 10000n; // 5% slippage
  await game.connect(bankerSigner).createGame({ value: bankerDeposit });
  console.log("Game ID: 0");
  console.log("Banker deposit:", ethers.formatEther(bankerDeposit), "ETH");

  console.log("\n=== Player Joins Game ===\n");
  const caseIndex = 5;
  const salt = 123456789n;
  const commitHash = BigInt(ethers.solidityPackedKeccak256(
    ["uint8", "uint256"],
    [caseIndex, salt]
  ));
  const entryFeeWei = await game.usdToWei(100);
  const entryDeposit = (entryFeeWei * 10500n) / 10000n;
  await game.connect(playerSigner).joinGame(0, commitHash, { value: entryDeposit });
  console.log("Player chose case:", caseIndex + 1);

  console.log("\n=== Fulfilling VRF ===\n");
  const gameState = await game.games(0);
  await vrfCoordinator.fulfillRandomWords(gameState.vrfRequestId, gameAddress);
  console.log("Cases shuffled!");

  console.log("\n=== Revealing Case ===\n");
  await game.connect(playerSigner).revealCase(0, caseIndex, salt);
  console.log("Case revealed:", caseIndex + 1);

  // Play rounds
  const casesPerRound = [4, 3, 2, 1, 1];
  for (let round = 0; round < casesPerRound.length; round++) {
    console.log(`\n=== Round ${round + 1} — Opening ${casesPerRound[round]} cases ===\n`);

    // Find unopened cases
    const state = await game.getGameState(0);
    const bitmap = state.openedBitmap;
    const unopened: number[] = [];
    for (let i = 0; i < 12; i++) {
      if (i !== caseIndex && (bitmap & (1n << BigInt(i))) === 0n) {
        unopened.push(i);
      }
    }

    for (let i = 0; i < casesPerRound[round]; i++) {
      const tx = await game.connect(playerSigner).openCase(0, unopened[i]);
      const receipt = await tx.wait();
      const openEvent = receipt?.logs.find((log: any) => {
        try {
          return game.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "CaseOpened";
        } catch { return false; }
      });
      if (openEvent) {
        const p = game.interface.parseLog({ topics: [...openEvent.topics], data: openEvent.data });
        const value = Number(p!.args[2]);
        console.log(`  Opened case ${unopened[i] + 1}: ${CASE_VALUES_USD[CASE_VALUES_USD.length - 1]}`);
        console.log(`  Opened case ${unopened[i] + 1}: ${value / 100 >= 1 ? "$" + (value / 100).toFixed(2) : "$" + (value / 100).toFixed(2)}`);
      }
    }

    const newState = await game.getGameState(0);
    if (Number(newState.phase) === 5) {
      // FinalSwap
      console.log("\n=== Final Decision: Keep or Swap? ===\n");
      console.log("Keeping original case...");
      await game.connect(playerSigner).finalDecision(0, false);
      break;
    }

    if (Number(newState.phase) === 4) {
      // BankerOffer
      const offerWei = await game.usdToWei(newState.bankerOffer);
      console.log(`\n  Banker offers: $${(Number(newState.bankerOffer) / 100).toFixed(2)} (~${ethers.formatEther(offerWei)} ETH)`);

      if (round === 2) {
        // Accept deal on round 3
        console.log("  => DEAL!\n");
        await game.connect(playerSigner).acceptDeal(0);
        break;
      } else {
        console.log("  => NO DEAL!\n");
        await game.connect(playerSigner).rejectDeal(0);
      }
    }
  }

  // Final state
  const finalState = await game.getGameState(0);
  const payoutWei = await game.usdToWei(finalState.finalPayout);
  console.log("\n=== Game Over ===\n");
  console.log(`Payout: $${(Number(finalState.finalPayout) / 100).toFixed(2)} (~${ethers.formatEther(payoutWei)} ETH)`);
  console.log("Phase:", Number(finalState.phase) === 6 ? "GameOver" : "Unknown");
}

main().catch(console.error);
