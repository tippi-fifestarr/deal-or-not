import { ethers, network } from "hardhat";

async function main() {
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("Skipping mock deployment on non-local network");
    return;
  }

  console.log("Deploying mocks...");

  // Deploy VRF Coordinator Mock
  const VRFCoordinator = await ethers.getContractFactory("VRFCoordinatorV2_5Mock");
  const baseFee = ethers.parseEther("0.001"); // 0.001 LINK
  const gasPrice = ethers.parseUnits("50", "gwei");
  const weiPerUnitLink = ethers.parseEther("0.01");
  const vrfCoordinator = await VRFCoordinator.deploy(baseFee, gasPrice, weiPerUnitLink);
  await vrfCoordinator.waitForDeployment();
  const vrfAddress = await vrfCoordinator.getAddress();
  console.log("VRFCoordinatorV2_5Mock deployed to:", vrfAddress);

  // Deploy Mock Price Feed (ETH/USD = $2,000 with 8 decimals)
  const MockPriceFeed = await ethers.getContractFactory("MockV3Aggregator");
  const priceFeed = await MockPriceFeed.deploy(8, 200000000000n);
  await priceFeed.waitForDeployment();
  const pfAddress = await priceFeed.getAddress();
  console.log("MockV3Aggregator deployed to:", pfAddress);

  return { vrfCoordinator, priceFeed, vrfAddress, pfAddress };
}

main().catch(console.error);
export default main;
