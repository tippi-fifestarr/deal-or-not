/**
 * Auto-fulfills VRF requests on local Hardhat network.
 * Watches for RandomWordsRequested events and immediately fulfills them.
 * Run this in the background during E2E tests.
 */
import { ethers } from "hardhat";

async function main() {
  const vrfCoordinatorAddress = process.env.VRF_COORDINATOR_ADDRESS;
  const gameAddress = process.env.GAME_ADDRESS;

  if (!vrfCoordinatorAddress || !gameAddress) {
    console.error("Set VRF_COORDINATOR_ADDRESS and GAME_ADDRESS env vars");
    process.exit(1);
  }

  const vrfCoordinator = await ethers.getContractAt(
    "VRFCoordinatorV2_5Mock",
    vrfCoordinatorAddress
  );

  console.log("Watching for VRF requests...");
  console.log("VRF Coordinator:", vrfCoordinatorAddress);
  console.log("Game Contract:", gameAddress);

  // Poll for new requests
  let lastRequestId = 0n;
  setInterval(async () => {
    try {
      const filter = vrfCoordinator.filters.RandomWordsRequested();
      const events = await vrfCoordinator.queryFilter(filter);

      for (const event of events) {
        const parsed = vrfCoordinator.interface.parseLog({
          topics: [...event.topics],
          data: event.data,
        });
        if (!parsed) continue;

        const requestId = parsed.args[1]; // requestId
        if (requestId > lastRequestId) {
          console.log(`Fulfilling VRF request ${requestId}...`);
          try {
            await vrfCoordinator.fulfillRandomWords(requestId, gameAddress);
            console.log(`Fulfilled request ${requestId}`);
          } catch (e: any) {
            // May already be fulfilled
            if (!e.message.includes("InvalidRequest")) {
              console.error(`Failed to fulfill ${requestId}:`, e.message);
            }
          }
          lastRequestId = requestId;
        }
      }
    } catch (e: any) {
      console.error("Poll error:", e.message);
    }
  }, 1000);
}

main().catch(console.error);
