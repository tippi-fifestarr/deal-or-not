import { ethers, network } from "hardhat";

async function main() {
    const isLocal = network.name === "hardhat" || network.name === "localhost";
    const [deployer] = await ethers.getSigners();

    console.log("Deploying CCIP contracts with:", deployer.address);

    let routerAddress: string;
    let chainSelector: bigint;

    if (isLocal) {
        // Deploy CCIPLocalSimulator to get a mock router
        const Sim = await ethers.getContractFactory("CCIPLocalSimulator");
        const sim = await Sim.deploy();
        await sim.waitForDeployment();
        console.log("CCIPLocalSimulator deployed to:", await sim.getAddress());

        const config = await sim.configuration();
        chainSelector = config[0];
        routerAddress = await ethers.resolveAddress(config[1]);
        console.log("Chain Selector:", chainSelector.toString());
        console.log("Router Address:", routerAddress);
    } else {
        // Use environment variables for testnet/mainnet
        routerAddress = process.env.CCIP_ROUTER!;
        chainSelector = BigInt(process.env.CCIP_CHAIN_SELECTOR!);

        if (!routerAddress || !chainSelector) {
            throw new Error("CCIP_ROUTER and CCIP_CHAIN_SELECTOR must be set");
        }
    }

    // Deploy CCIPBridge (home chain)
    const Bridge = await ethers.getContractFactory("CCIPBridge");
    const bridge = await Bridge.deploy(routerAddress);
    await bridge.waitForDeployment();
    const bridgeAddress = await bridge.getAddress();
    console.log("CCIPBridge deployed to:", bridgeAddress);

    // Deploy CaseCashGateway (spoke chain - in local, same chain)
    const Gateway = await ethers.getContractFactory("CaseCashGateway");
    const gateway = await Gateway.deploy(routerAddress);
    await gateway.waitForDeployment();
    const gatewayAddress = await gateway.getAddress();
    console.log("CaseCashGateway deployed to:", gatewayAddress);

    // Configure: register gateway on bridge, set home bridge on gateway
    await bridge.setGateway(chainSelector, gatewayAddress);
    console.log("Gateway registered on bridge for chain:", chainSelector.toString());

    await gateway.setHomeBridge(chainSelector, bridgeAddress);
    console.log("Home bridge set on gateway");

    return { bridge, gateway, routerAddress, chainSelector };
}

main().catch(console.error);
export default main;
