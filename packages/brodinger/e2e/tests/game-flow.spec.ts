import { test, expect, fulfillVRF, getNextGameId, createProvider, BANKER_PRIVATE_KEY, PLAYER_PRIVATE_KEY, RPC_URL } from "../fixtures/game.fixture";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

const gameArtifact = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../artifacts/contracts/DealOrNoDeal.sol/DealOrNoDeal.json"),
    "utf8"
  )
);

test("frontend loads the game page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1").first()).toContainText("Deal or No Deal", { timeout: 15000 });
});

// Each test creates its own game (incrementing game IDs), so they can share deployed contracts
test.describe.serial("Deal or No Deal - E2E", () => {
  test("full game lifecycle — accept deal in round 1", async ({ contracts }) => {
    const provider = createProvider();
    const banker = new ethers.Wallet(BANKER_PRIVATE_KEY, provider);
    const player = new ethers.Wallet(PLAYER_PRIVATE_KEY, provider);

    const game = new ethers.Contract(contracts.gameAddress, gameArtifact.abi, banker);
    const gameAsPlayer = new ethers.Contract(contracts.gameAddress, gameArtifact.abi, player);

    // Get next game ID
    const gameId = await getNextGameId(contracts.gameAddress);

    // 1. Banker creates game
    const maxCaseWei = await game.usdToWei(1000n);
    const bankerDeposit = (maxCaseWei * 10500n) / 10000n;
    await (await game.createGame({ value: bankerDeposit })).wait();

    // 2. Player joins with commit
    const caseIndex = 3;
    const salt = 99999n;
    const commitHash = BigInt(
      ethers.solidityPackedKeccak256(["uint8", "uint256"], [caseIndex, salt])
    );
    const entryFeeWei = await game.usdToWei(100n);
    const entryDeposit = (entryFeeWei * 10500n) / 10000n;
    await (await gameAsPlayer.joinGame(gameId, commitHash, { value: entryDeposit })).wait();

    // 3. Fulfill VRF
    await fulfillVRF(contracts.vrfCoordinatorAddress, contracts.gameAddress);

    // 4. Verify phase is RevealCase
    let state = await game.getGameState(gameId);
    expect(Number(state[2])).toBe(2); // RevealCase

    // 5. Reveal case
    await (await gameAsPlayer.revealCase(gameId, caseIndex, salt)).wait();

    state = await game.getGameState(gameId);
    expect(Number(state[2])).toBe(3); // OpeningCases

    // 6. Open 4 cases (round 1)
    const bitmap = state[6];
    const unopened: number[] = [];
    for (let i = 0; i < 12; i++) {
      if (i !== caseIndex && (bitmap & (1n << BigInt(i))) === 0n) {
        unopened.push(i);
      }
    }

    for (let i = 0; i < 4; i++) {
      await (await gameAsPlayer.openCase(gameId, unopened[i])).wait();
    }

    // 7. Verify banker offer phase
    state = await game.getGameState(gameId);
    expect(Number(state[2])).toBe(4); // BankerOffer
    expect(state[7]).toBeGreaterThan(0n); // bankerOffer > 0

    // 8. Accept deal
    await (await gameAsPlayer.acceptDeal(gameId)).wait();

    // 9. Verify game over
    state = await game.getGameState(gameId);
    expect(Number(state[2])).toBe(6); // GameOver
    expect(state[8]).toBeGreaterThan(0n); // finalPayout > 0

    console.log("Payout (USD cents):", state[8].toString());
  });

  test("reject all deals and reach final swap", async ({ contracts }) => {
    const provider = createProvider();
    const banker = new ethers.Wallet(BANKER_PRIVATE_KEY, provider);
    const player = new ethers.Wallet(PLAYER_PRIVATE_KEY, provider);

    const game = new ethers.Contract(contracts.gameAddress, gameArtifact.abi, banker);
    const gameAsPlayer = new ethers.Contract(contracts.gameAddress, gameArtifact.abi, player);

    const gameId = await getNextGameId(contracts.gameAddress);

    // Create and join game
    const maxCaseWei = await game.usdToWei(1000n);
    await (await game.createGame({ value: (maxCaseWei * 10500n) / 10000n })).wait();

    const caseIndex = 0;
    const salt = 77777n;
    const commitHash = BigInt(
      ethers.solidityPackedKeccak256(["uint8", "uint256"], [caseIndex, salt])
    );
    const entryFeeWei = await game.usdToWei(100n);
    await (await gameAsPlayer.joinGame(gameId, commitHash, { value: (entryFeeWei * 10500n) / 10000n })).wait();

    await fulfillVRF(contracts.vrfCoordinatorAddress, contracts.gameAddress);
    await (await gameAsPlayer.revealCase(gameId, caseIndex, salt)).wait();

    // Play all rounds, rejecting every offer
    const casesPerRound = [4, 3, 2, 1, 1];
    for (let round = 0; round < casesPerRound.length; round++) {
      let state = await game.getGameState(gameId);
      const bitmap = state[6];
      const unopened: number[] = [];
      for (let i = 0; i < 12; i++) {
        if (i !== caseIndex && (bitmap & (1n << BigInt(i))) === 0n) {
          unopened.push(i);
        }
      }

      for (let i = 0; i < casesPerRound[round]; i++) {
        await (await gameAsPlayer.openCase(gameId, unopened[i])).wait();
      }

      state = await game.getGameState(gameId);
      const phase = Number(state[2]);

      if (phase === 5) {
        // FinalSwap — swap
        await (await gameAsPlayer.finalDecision(gameId, true)).wait();
        break;
      }
      if (phase === 4) {
        // BankerOffer — reject
        await (await gameAsPlayer.rejectDeal(gameId)).wait();
      }
    }

    // Verify game over
    const finalState = await game.getGameState(gameId);
    expect(Number(finalState[2])).toBe(6);
    expect(finalState[8]).toBeGreaterThan(0n);

    // Verify all 12 values present
    const caseValues: number[] = [];
    for (let i = 0; i < 12; i++) {
      const val = await game.getCaseValue(gameId, i);
      caseValues.push(Number(val));
    }
    const sorted = [...caseValues].sort((a, b) => a - b);
    expect(sorted).toEqual([1, 5, 10, 25, 50, 100, 200, 300, 400, 500, 750, 1000]);
  });

  test("settlement distributes ETH correctly — contract has zero balance after", async ({ contracts }) => {
    const provider = createProvider();
    const banker = new ethers.Wallet(BANKER_PRIVATE_KEY, provider);
    const player = new ethers.Wallet(PLAYER_PRIVATE_KEY, provider);

    const game = new ethers.Contract(contracts.gameAddress, gameArtifact.abi, banker);
    const gameAsPlayer = new ethers.Contract(contracts.gameAddress, gameArtifact.abi, player);

    const gameId = await getNextGameId(contracts.gameAddress);

    // Create and join
    const maxCaseWei = await game.usdToWei(1000n);
    const bankerDeposit = (maxCaseWei * 10500n) / 10000n;
    await (await game.createGame({ value: bankerDeposit })).wait();

    const caseIndex = 7;
    const salt = 55555n;
    const commitHash = BigInt(
      ethers.solidityPackedKeccak256(["uint8", "uint256"], [caseIndex, salt])
    );
    const entryFeeWei = await game.usdToWei(100n);
    await (await gameAsPlayer.joinGame(gameId, commitHash, { value: (entryFeeWei * 10500n) / 10000n })).wait();

    await fulfillVRF(contracts.vrfCoordinatorAddress, contracts.gameAddress);
    await (await gameAsPlayer.revealCase(gameId, caseIndex, salt)).wait();

    // Open 4 cases
    let state = await game.getGameState(gameId);
    const bitmap = state[6];
    const unopened: number[] = [];
    for (let i = 0; i < 12; i++) {
      if (i !== caseIndex && (bitmap & (1n << BigInt(i))) === 0n) {
        unopened.push(i);
      }
    }
    for (let i = 0; i < 4; i++) {
      await (await gameAsPlayer.openCase(gameId, unopened[i])).wait();
    }

    // Verify contract has balance
    const contractBalBefore = await provider.getBalance(contracts.gameAddress);
    expect(contractBalBefore).toBeGreaterThan(0n);

    // Record banker balance before
    const bankerBalBefore = await provider.getBalance(banker.address);

    // Accept deal
    await (await gameAsPlayer.acceptDeal(gameId)).wait();

    // Contract should have 0 balance (no games active)
    const contractBalAfter = await provider.getBalance(contracts.gameAddress);
    expect(contractBalAfter).toBe(0n);

    // Banker should have received refund
    const bankerBalAfter = await provider.getBalance(banker.address);
    expect(bankerBalAfter).toBeGreaterThan(bankerBalBefore);

    console.log("Contract balance after settlement:", contractBalAfter.toString());
    console.log("Banker received refund:", (bankerBalAfter - bankerBalBefore).toString(), "wei");
  });
});
