import { ethers } from "hardhat";

async function main() {
  const F = await ethers.getContractFactory("HashDebug");
  const h = await F.deploy();
  await h.waitForDeployment();

  const packed = await h.packRound([1, 2, 3, 4], 55555);
  console.log("Solidity packed:", packed);

  const hash = await h.hashRound([1, 2, 3, 4], 55555);
  console.log("Solidity hash:", hash.toString());

  const ethersHashOld = ethers.solidityPackedKeccak256(
    ["uint8", "uint8", "uint8", "uint8", "uint256"],
    [1, 2, 3, 4, 55555n]
  );
  console.log("Ethers hash (uint8):", BigInt(ethersHashOld).toString());

  const ethersHashNew = ethers.solidityPackedKeccak256(
    ["uint256", "uint256", "uint256", "uint256", "uint256"],
    [1n, 2n, 3n, 4n, 55555n]
  );
  console.log("Ethers hash (uint256):", BigInt(ethersHashNew).toString());

  const ethersPackedNew = ethers.solidityPacked(
    ["uint256", "uint256", "uint256", "uint256", "uint256"],
    [1n, 2n, 3n, 4n, 55555n]
  );
  console.log("Ethers packed (uint256):", ethersPackedNew);
}

main().catch(console.error);
