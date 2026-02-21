import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("CCIP Bridge", function () {
    let deployer: SignerWithAddress;
    let user: SignerWithAddress;

    let sim: any;
    let bridge: any;
    let gateway: any;
    let mockBettingPool: any;
    let routerAddress: string;
    let chainSelector: bigint;

    before(async function () {
        [deployer, user] = await ethers.getSigners();
    });

    describe("CCIPLocalSimulator Setup", function () {
        it("should deploy the CCIP local simulator", async function () {
            const Sim = await ethers.getContractFactory("CCIPLocalSimulator");
            sim = await Sim.deploy();
            await sim.waitForDeployment();
            expect(await sim.getAddress()).to.be.properAddress;
        });

        it("should return valid configuration", async function () {
            const config = await sim.configuration();
            chainSelector = config[0];
            routerAddress = await ethers.resolveAddress(config[1]);
            expect(chainSelector).to.be.gt(0n);
            expect(routerAddress).to.be.properAddress;
        });
    });

    describe("Contract Deployment", function () {
        it("should deploy MockBettingPool", async function () {
            const Pool = await ethers.getContractFactory("MockBettingPool");
            mockBettingPool = await Pool.deploy();
            await mockBettingPool.waitForDeployment();
            expect(await mockBettingPool.getAddress()).to.be.properAddress;
        });

        it("should deploy CCIPBridge on the home chain", async function () {
            const Bridge = await ethers.getContractFactory("CCIPBridge");
            bridge = await Bridge.deploy(routerAddress);
            await bridge.waitForDeployment();
            expect(await bridge.getAddress()).to.be.properAddress;
            expect(await bridge.owner()).to.equal(deployer.address);
            expect(await bridge.getRouter()).to.equal(routerAddress);
        });

        it("should deploy CaseCashGateway on the spoke chain", async function () {
            const Gateway = await ethers.getContractFactory("CaseCashGateway");
            gateway = await Gateway.deploy(routerAddress);
            await gateway.waitForDeployment();
            expect(await gateway.getAddress()).to.be.properAddress;
            expect(await gateway.owner()).to.equal(deployer.address);
        });
    });

    describe("Admin Configuration", function () {
        it("should set the gateway on the bridge", async function () {
            const gatewayAddr = await gateway.getAddress();
            await bridge.setGateway(chainSelector, gatewayAddr);
            expect(await bridge.gateways(chainSelector)).to.equal(gatewayAddr);
        });

        it("should set the home bridge on the gateway", async function () {
            const bridgeAddr = await bridge.getAddress();
            await gateway.setHomeBridge(chainSelector, bridgeAddr);
            expect(await gateway.homeChainSelector()).to.equal(chainSelector);
            expect(await gateway.homeBridge()).to.equal(bridgeAddr);
        });

        it("should set the betting pool on the bridge", async function () {
            const poolAddr = await mockBettingPool.getAddress();
            await bridge.setBettingPool(poolAddr);
            expect(await bridge.bettingPool()).to.equal(poolAddr);
        });

        it("should reject unauthorized gateway set", async function () {
            await expect(
                bridge.connect(user).setGateway(chainSelector, user.address)
            ).to.be.revertedWithCustomError(bridge, "OnlyOwner");
        });

        it("should reject unauthorized home bridge set", async function () {
            await expect(
                gateway.connect(user).setHomeBridge(chainSelector, user.address)
            ).to.be.revertedWithCustomError(gateway, "OnlyOwner");
        });

        it("should reject zero address gateway", async function () {
            await expect(
                bridge.setGateway(chainSelector, ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(bridge, "InvalidGatewayAddress");
        });
    });

    describe("Cross-Chain Bet Placement", function () {
        it("should send a bet from gateway to bridge via CCIP", async function () {
            const betAmount = ethers.parseEther("0.01");
            const gameId = 42;
            const betType = 1;
            const choice = 3;

            // Place bet: gateway -> CCIP router -> bridge -> MockBettingPool
            const tx = await gateway.connect(user).placeBet(gameId, betType, choice, {
                value: betAmount,
            });

            // Verify gateway emitted BetPlaced
            await expect(tx).to.emit(gateway, "BetPlaced");

            // Verify bridge received the bet and forwarded to pool
            await expect(tx).to.emit(bridge, "CrossChainBetReceived");

            // Verify the MockBettingPool received the bet
            await expect(tx).to.emit(mockBettingPool, "BetReceived")
                .withArgs(gameId, betType, choice, user.address, chainSelector, 0);

            // Verify bet was recorded in the pool
            const betCount = await mockBettingPool.getBetCount();
            expect(betCount).to.equal(1n);

            // Verify the bet details
            const bet = await mockBettingPool.bets(0);
            expect(bet.gameId).to.equal(gameId);
            expect(bet.betType).to.equal(betType);
            expect(bet.choice).to.equal(choice);
            expect(bet.bettor).to.equal(user.address);
            expect(bet.sourceChainSelector).to.equal(chainSelector);
        });

        it("should reject zero-value bets", async function () {
            await expect(
                gateway.connect(user).placeBet(1, 0, 0, { value: 0 })
            ).to.be.revertedWithCustomError(gateway, "InsufficientBetAmount");
        });

        it("should reject bet when home bridge is not set", async function () {
            const Gateway = await ethers.getContractFactory("CaseCashGateway");
            const freshGateway = await Gateway.deploy(routerAddress);
            await freshGateway.waitForDeployment();

            await expect(
                freshGateway.connect(user).placeBet(1, 0, 0, {
                    value: ethers.parseEther("0.01"),
                })
            ).to.be.revertedWithCustomError(freshGateway, "HomeBridgeNotSet");
        });

        it("should track total bets sent on gateway", async function () {
            expect(await gateway.totalBetsSent()).to.equal(1n);
        });

        it("should track total bets received on bridge", async function () {
            expect(await bridge.totalBetsReceived()).to.equal(1n);
        });
    });

    describe("Payout Sending", function () {
        it("should reject payout from non-owner", async function () {
            await expect(
                bridge
                    .connect(user)
                    .sendPayout(chainSelector, user.address, ethers.parseEther("0.01"))
            ).to.be.revertedWithCustomError(bridge, "OnlyOwner");
        });

        it("should reject payout to unknown chain", async function () {
            const unknownChain = 999n;
            await expect(
                bridge.sendPayout(unknownChain, user.address, ethers.parseEther("0.01"), {
                    value: ethers.parseEther("0.1"),
                })
            ).to.be.revertedWithCustomError(bridge, "InvalidGatewayAddress");
        });

        it("should send payout via CCIP when funded", async function () {
            const payoutAmount = ethers.parseEther("0.05");

            // Fund the bridge with ETH for CCIP fees
            await deployer.sendTransaction({
                to: await bridge.getAddress(),
                value: ethers.parseEther("1.0"),
            });

            // Fund the gateway with ETH to pay out the recipient
            await deployer.sendTransaction({
                to: await gateway.getAddress(),
                value: ethers.parseEther("1.0"),
            });

            const userBalanceBefore = await ethers.provider.getBalance(user.address);

            // Send payout from bridge to gateway via CCIP
            const tx = await bridge.sendPayout(
                chainSelector,
                user.address,
                payoutAmount,
                { value: ethers.parseEther("0.1") }
            );

            await expect(tx).to.emit(bridge, "PayoutSent");
            await expect(tx).to.emit(gateway, "PayoutReceived");

            // Verify the user received the payout
            const userBalanceAfter = await ethers.provider.getBalance(user.address);
            expect(userBalanceAfter - userBalanceBefore).to.equal(payoutAmount);
        });

        it("should track total payouts sent", async function () {
            expect(await bridge.totalPayoutsSent()).to.equal(1n);
        });

        it("should track total payouts received on gateway", async function () {
            expect(await gateway.totalPayoutsReceived()).to.equal(1n);
        });
    });
});
