import { ethers, network } from "hardhat";

async function main() {
  const isLocal = network.name === "hardhat" || network.name === "localhost";

  let vrfCoordinatorAddress: string;
  let subscriptionId: bigint;
  let keyHash: string;
  let priceFeedAddress: string;

  if (isLocal) {
    // Get mock addresses from local deployment
    const VRFCoordinator = await ethers.getContractFactory("VRFCoordinatorV2_5Mock");
    const MockPriceFeed = await ethers.getContractFactory("MockV3Aggregator");

    // Deploy mocks if needed
    const baseFee = ethers.parseEther("0.001");
    const gasPrice = ethers.parseUnits("50", "gwei");
    const weiPerUnitLink = ethers.parseEther("0.01");
    const vrfCoordinator = await VRFCoordinator.deploy(baseFee, gasPrice, weiPerUnitLink);
    await vrfCoordinator.waitForDeployment();
    vrfCoordinatorAddress = await vrfCoordinator.getAddress();

    const priceFeed = await MockPriceFeed.deploy(8, 200000000000n);
    await priceFeed.waitForDeployment();
    priceFeedAddress = await priceFeed.getAddress();

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
    await vrfCoordinator.fundSubscription(subscriptionId, ethers.parseEther("10"));

    keyHash = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";

    console.log("VRF Coordinator:", vrfCoordinatorAddress);
    console.log("Price Feed:", priceFeedAddress);
    console.log("Subscription ID:", subscriptionId.toString());

    // Deploy game contract
    const DealOrNoDeal = await ethers.getContractFactory("DealOrNoDeal");
    const game = await DealOrNoDeal.deploy(
      vrfCoordinatorAddress,
      subscriptionId,
      keyHash,
      priceFeedAddress
    );
    await game.waitForDeployment();
    const gameAddress = await game.getAddress();
    console.log("DealOrNoDeal deployed to:", gameAddress);

    // Add game contract as VRF consumer
    await vrfCoordinator.addConsumer(subscriptionId, gameAddress);
    console.log("Added game contract as VRF consumer");

    return { game, vrfCoordinator, priceFeed, subscriptionId };
  } else {
    // Use environment variables for testnet/mainnet
    vrfCoordinatorAddress = process.env.VRF_COORDINATOR!;
    subscriptionId = BigInt(process.env.VRF_SUBSCRIPTION_ID!);
    keyHash = process.env.VRF_KEY_HASH!;
    priceFeedAddress = process.env.ETH_USD_PRICE_FEED!;

    const DealOrNoDeal = await ethers.getContractFactory("DealOrNoDeal");
    const game = await DealOrNoDeal.deploy(
      vrfCoordinatorAddress,
      subscriptionId,
      keyHash,
      priceFeedAddress
    );
    await game.waitForDeployment();
    console.log("DealOrNoDeal deployed to:", await game.getAddress());
  }
}

main().catch(console.error);
export default main;
