import { test as base, expect, type Page } from "@playwright/test";
import { ethers } from "ethers";

// Use 3 SEPARATE Hardhat accounts to avoid nonce conflicts
const DEPLOYER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // account[0]
const BANKER_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";  // account[1]
const PLAYER_PRIVATE_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";  // account[2]

const RPC_URL = "http://127.0.0.1:8545";

interface DeployedContracts {
  gameAddress: string;
  vrfCoordinatorAddress: string;
  priceFeedAddress: string;
  subscriptionId: bigint;
}

/** Create a provider with no response caching (needed for hardhat automining) */
function createProvider() {
  return new ethers.JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 });
}

// Cache contracts per worker
let cachedContracts: DeployedContracts | null = null;

/**
 * Deploy contracts using hardhat_reset + fresh deploy.
 */
async function deployContracts(): Promise<DeployedContracts> {
  if (cachedContracts) return cachedContracts;

  const provider = createProvider();

  // Snapshot the initial state after reset
  await provider.send("hardhat_reset", []);

  const deployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);

  const fs = await import("fs");
  const path = await import("path");

  const vrfArtifact = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../artifacts/@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol/VRFCoordinatorV2_5Mock.json"),
      "utf8"
    )
  );
  const pfArtifact = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../artifacts/@chainlink/contracts/src/v0.8/tests/MockV3Aggregator.sol/MockV3Aggregator.json"),
      "utf8"
    )
  );
  const gameArtifact = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../artifacts/contracts/DealOrNoDeal.sol/DealOrNoDeal.json"),
      "utf8"
    )
  );

  // Deploy VRF Coordinator Mock (nonce 0)
  const vrfFactory = new ethers.ContractFactory(vrfArtifact.abi, vrfArtifact.bytecode, deployer);
  const vrfCoordinator = await vrfFactory.deploy(
    ethers.parseEther("0.001"),
    ethers.parseUnits("50", "gwei"),
    ethers.parseEther("0.01"),
    { nonce: 0 }
  );
  await vrfCoordinator.waitForDeployment();
  const vrfCoordinatorAddress = await vrfCoordinator.getAddress();

  // Deploy Price Feed Mock (nonce 1)
  const pfFactory = new ethers.ContractFactory(pfArtifact.abi, pfArtifact.bytecode, deployer);
  const priceFeed = await pfFactory.deploy(8, 200000000000n, { nonce: 1 });
  await priceFeed.waitForDeployment();
  const priceFeedAddress = await priceFeed.getAddress();

  // Create VRF subscription (nonce 2)
  const createSubTx = await (vrfCoordinator as any).createSubscription({ nonce: 2 });
  const receipt = await createSubTx.wait();
  const subEvent = receipt.logs.find((log: any) => {
    try {
      return vrfCoordinator.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "SubscriptionCreated";
    } catch { return false; }
  });
  const parsed = vrfCoordinator.interface.parseLog({ topics: [...subEvent.topics], data: subEvent.data });
  const subscriptionId = parsed!.args[0];

  // Fund subscription (nonce 3)
  await (vrfCoordinator as any).fundSubscription(subscriptionId, ethers.parseEther("100"), { nonce: 3 });

  // Deploy game (nonce 4)
  const gameFactory = new ethers.ContractFactory(gameArtifact.abi, gameArtifact.bytecode, deployer);
  const keyHash = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";
  const game = await gameFactory.deploy(vrfCoordinatorAddress, subscriptionId, keyHash, priceFeedAddress, { nonce: 4 });
  await game.waitForDeployment();
  const gameAddress = await game.getAddress();

  // Add consumer (nonce 5)
  await (vrfCoordinator as any).addConsumer(subscriptionId, gameAddress, { nonce: 5 });

  cachedContracts = { gameAddress, vrfCoordinatorAddress, priceFeedAddress, subscriptionId };
  return cachedContracts;
}

/**
 * Fulfill VRF requests for a given game contract.
 */
async function fulfillVRF(vrfCoordinatorAddress: string, gameAddress: string) {
  const provider = createProvider();
  const deployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);

  const fs = await import("fs");
  const path = await import("path");
  const vrfArtifact = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../artifacts/@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol/VRFCoordinatorV2_5Mock.json"),
      "utf8"
    )
  );

  const vrfCoordinator = new ethers.Contract(vrfCoordinatorAddress, vrfArtifact.abi, deployer);

  const filter = vrfCoordinator.filters.RandomWordsRequested();
  const events = await vrfCoordinator.queryFilter(filter);

  for (const event of events) {
    const parsed = vrfCoordinator.interface.parseLog({
      topics: [...event.topics],
      data: event.data,
    });
    if (!parsed) continue;
    const requestId = parsed.args[1];
    try {
      await vrfCoordinator.fulfillRandomWords(requestId, gameAddress);
    } catch {
      // Already fulfilled
    }
  }
}

/**
 * Get the next game ID from the contract.
 */
async function getNextGameId(gameAddress: string): Promise<bigint> {
  const provider = createProvider();
  const fs = await import("fs");
  const path = await import("path");
  const gameArtifact = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../artifacts/contracts/DealOrNoDeal.sol/DealOrNoDeal.json"),
      "utf8"
    )
  );
  const game = new ethers.Contract(gameAddress, gameArtifact.abi, provider);
  return await game.nextGameId();
}

export const test = base.extend<{
  contracts: DeployedContracts;
}>({
  contracts: async ({}, use) => {
    const contracts = await deployContracts();
    await use(contracts);
  },
});

export { expect, fulfillVRF, getNextGameId, createProvider, BANKER_PRIVATE_KEY, PLAYER_PRIVATE_KEY, RPC_URL };
