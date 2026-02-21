import { ethers } from "ethers";

// Configuration
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const GAME_ADDRESS = process.env.GAME_ADDRESS!;
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const DEMO_AGENT_KEYS = [
    "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
    "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
];

const NUM_CASES = 12;
const CASES_PER_ROUND = [4, 3, 2, 1, 1];
const SLIPPAGE_BPS = 500n;
const MAX_CASE_CENTS = 1000n;
const ENTRY_FEE_CENTS = 100n;
const POLL_INTERVAL_MS = 3000;

const GAME_ABI = [
    "function nextGameId() view returns (uint256)",
    "function getGameState(uint256 gameId) view returns (address banker, address player, uint8 phase, uint8 playerCaseIndex, uint8 currentRound, uint8 casesOpenedThisRound, uint256 openedBitmap, uint256 bankerOffer, uint256 finalPayout)",
    "function getRemainingValues(uint256 gameId) view returns (uint256[])",
    "function usdToWei(uint256 usdCents) view returns (uint256)",
    "function createGame() payable returns (uint256)",
    "function joinGame(uint256 gameId, uint256 commitHash) payable",
    "function revealCase(uint256 gameId, uint8 caseIndex, uint256 salt)",
    "function openCase(uint256 gameId, uint8 caseIndex)",
    "function acceptDeal(uint256 gameId)",
    "function rejectDeal(uint256 gameId)",
    "function finalDecision(uint256 gameId, bool swap)",
];

const REGISTRY_ABI = [
    "function nextAgentId() view returns (uint256)",
    "function getAgent(uint256 agentId) view returns (tuple(address owner, address wallet, string strategyURI, uint8 agentType, uint256 gamesPlayed, int256 totalProfitCents, bool active, uint256 createdAt))",
    "function registerAgent(string strategyURI, uint8 agentType, address wallet) returns (uint256)",
    "function recordResult(uint256 agentId, uint256 gameId, int256 profitCents)",
    "function walletToAgent(address wallet) view returns (uint256)",
    "function walletRegistered(address wallet) view returns (bool)",
];
enum GamePhase {
    WaitingForPlayer = 0,
    WaitingForVRF = 1,
    RevealCase = 2,
    OpeningCases = 3,
    BankerOffer = 4,
    FinalSwap = 5,
    GameOver = 6,
}

type StrategyName = "AGGRESSIVE" | "CONSERVATIVE" | "VALUE" | "RANDOM";

interface Strategy {
    name: StrategyName;
    prompt: string;
    decideDeal: (offer: bigint, remainingValues: bigint[]) => boolean;
    decideSwap: () => boolean;
    pickCaseToOpen: (unopened: number[]) => number;
}

const STRATEGIES: Record<StrategyName, Strategy> = {
    AGGRESSIVE: {
        name: "AGGRESSIVE",
        prompt: "You are an aggressive Deal or No Deal player. Reject deals unless they are at least 90% of the maximum remaining value. Always swap at the end.",
        decideDeal: (offer: bigint, remainingValues: bigint[]) => {
            const max = remainingValues.reduce((a, b) => a > b ? a : b, 0n);
            return offer * 100n >= max * 90n;
        },
        decideSwap: () => true,
        pickCaseToOpen: (unopened: number[]) => unopened[0],
    },
    CONSERVATIVE: {
        name: "CONSERVATIVE",
        prompt: "You are a conservative Deal or No Deal player. Accept deals that are above 60% of the average remaining value. Never swap.",
        decideDeal: (offer: bigint, remainingValues: bigint[]) => {
            const sum = remainingValues.reduce((a, b) => a + b, 0n);
            const avg = sum / BigInt(remainingValues.length);
            return offer * 100n >= avg * 60n;
        },
        decideSwap: () => false,
        pickCaseToOpen: (unopened: number[]) => unopened[unopened.length - 1],
    },
    VALUE: {
        name: "VALUE",
        prompt: "You are a value-based Deal or No Deal player. Accept when the offer exceeds 85% of expected value. Swap only if EV suggests it.",
        decideDeal: (offer: bigint, remainingValues: bigint[]) => {
            const sum = remainingValues.reduce((a, b) => a + b, 0n);
            const ev = sum / BigInt(remainingValues.length);
            return offer * 100n >= ev * 85n;
        },
        decideSwap: () => false,
        pickCaseToOpen: (unopened: number[]) => unopened[Math.floor(unopened.length / 2)],
    },
    RANDOM: {
        name: "RANDOM",
        prompt: "You are a random Deal or No Deal player. Make all decisions with a coin flip.",
        decideDeal: () => Math.random() > 0.5,
        decideSwap: () => Math.random() > 0.5,
        pickCaseToOpen: (unopened: number[]) => unopened[Math.floor(Math.random() * unopened.length)],
    },
};

interface CommitState { caseIndex: number; salt: bigint; }
const agentCommits: Map<string, CommitState> = new Map();
const agentActiveGames: Map<string, bigint> = new Map();

async function aiDecision(strategyPrompt: string, gameContext: string, question: string, options: string[]): Promise<number> {
    if (!OPENAI_API_KEY) return -1;
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + OPENAI_API_KEY },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: strategyPrompt + "\nYou are playing Deal or No Deal on-chain. Respond with ONLY the number of your chosen option." },
                    { role: "user", content: gameContext + "\n\nQuestion: " + question + "\nOptions:\n" + options.map((o, i) => i + ": " + o).join("\n") + "\n\nRespond with ONLY the option number." },
                ],
                max_tokens: 5, temperature: 0.3,
            }),
        });
        const data = await response.json();
        const choice = parseInt(data.choices?.[0]?.message?.content?.trim() || "-1");
        if (choice >= 0 && choice < options.length) return choice;
    } catch (err) {
        console.log("  AI call failed, using fallback:", (err as Error).message);
    }
    return -1;
}

function getUnopenedCases(bitmap: bigint, playerCaseIndex: number): number[] {
    const indices: number[] = [];
    for (let i = 0; i < NUM_CASES; i++) {
        if (i !== playerCaseIndex && (bitmap & (1n << BigInt(i))) === 0n) indices.push(i);
    }
    return indices;
}

function withSlippage(amount: bigint): bigint {
    return (amount * (10000n + SLIPPAGE_BPS)) / 10000n;
}

function getStrategyForAgent(strategyURI: string): Strategy {
    const upper = strategyURI.toUpperCase();
    if (upper.includes("AGGRESSIVE")) return STRATEGIES.AGGRESSIVE;
    if (upper.includes("CONSERVATIVE")) return STRATEGIES.CONSERVATIVE;
    if (upper.includes("VALUE")) return STRATEGIES.VALUE;
    if (upper.includes("RANDOM")) return STRATEGIES.RANDOM;
    return STRATEGIES.VALUE;
}
async function bankerAction(
    wallet: ethers.Wallet,
    gameContract: ethers.Contract,
    agentId: bigint,
    _strategy: Strategy
) {
    const address = wallet.address;
    if (agentActiveGames.has(address)) return;
    try {
        const nextGameId = await gameContract.nextGameId();
        for (let i = 0n; i < nextGameId; i++) {
            const state = await gameContract.getGameState(i);
            if (state.banker === address && Number(state.phase) !== GamePhase.GameOver) {
                agentActiveGames.set(address, i);
                return;
            }
        }
        const depositWei = await gameContract.usdToWei(MAX_CASE_CENTS);
        const depositWithSlippage = withSlippage(depositWei);
        console.log("  [Banker Agent " + agentId + "] Creating new game...");
        const tx = await gameContract.connect(wallet).createGame({ value: depositWithSlippage });
        await tx.wait();
        const nextId = await gameContract.nextGameId();
        const gameId = nextId - 1n;
        agentActiveGames.set(address, gameId);
        console.log("  [Banker Agent " + agentId + "] Created game " + gameId);
    } catch (err) {
        console.log("  [Banker Agent " + agentId + "] Error:", (err as Error).message?.slice(0, 100));
    }
}

async function playerAction(
    wallet: ethers.Wallet,
    gameContract: ethers.Contract,
    registryContract: ethers.Contract,
    agentId: bigint,
    strategy: Strategy
) {
    const address = wallet.address;
    if (agentActiveGames.has(address)) {
        const gameId = agentActiveGames.get(address)!;
        await handleActiveGame(wallet, gameContract, registryContract, agentId, gameId, strategy);
        return;
    }
    try {
        const nextGameId = await gameContract.nextGameId();
        for (let i = 0n; i < nextGameId; i++) {
            const state = await gameContract.getGameState(i);
            if (Number(state.phase) === GamePhase.WaitingForPlayer && state.banker !== address) {
                const caseIndex = Math.floor(Math.random() * NUM_CASES);
                const saltBytes = ethers.randomBytes(32);
                const salt = BigInt(ethers.hexlify(saltBytes));
                const commitHash = BigInt(
                    ethers.solidityPackedKeccak256(["uint8", "uint256"], [caseIndex, salt])
                );
                agentCommits.set(address, { caseIndex, salt });
                const entryWei = await gameContract.usdToWei(ENTRY_FEE_CENTS);
                const entryWithSlippage = withSlippage(entryWei);
                console.log("  [Player Agent " + agentId + "] Joining game " + i + "...");
                const tx = await gameContract.connect(wallet).joinGame(i, commitHash, { value: entryWithSlippage });
                await tx.wait();
                agentActiveGames.set(address, i);
                console.log("  [Player Agent " + agentId + "] Joined game " + i);
                return;
            }
        }
    } catch (err) {
        console.log("  [Player Agent " + agentId + "] Error:", (err as Error).message?.slice(0, 100));
    }
}

async function handleActiveGame(
    wallet: ethers.Wallet,
    gameContract: ethers.Contract,
    registryContract: ethers.Contract,
    agentId: bigint,
    gameId: bigint,
    strategy: Strategy
) {
    const address = wallet.address;
    try {
        const state = await gameContract.getGameState(gameId);
        const phase = Number(state.phase);

        if (phase === GamePhase.GameOver) {
            const finalPayout = state.finalPayout;
            const isPlayer = state.player === address;
            if (isPlayer) {
                const profitCents = Number(finalPayout) - Number(ENTRY_FEE_CENTS);
                console.log("  [Agent " + agentId + "] Game " + gameId + " over. Profit: " + profitCents + " cents");
                try {
                    const tx = await registryContract.connect(wallet).recordResult(agentId, gameId, profitCents);
                    await tx.wait();
                } catch (e) {
                    console.log("  [Agent " + agentId + "] Could not record result");
                }
            } else {
                const profitCents = Number(ENTRY_FEE_CENTS) - Number(finalPayout) + Number(MAX_CASE_CENTS);
                console.log("  [Banker Agent " + agentId + "] Game " + gameId + " over. Player payout: " + finalPayout + " cents");
                try {
                    const tx = await registryContract.connect(wallet).recordResult(agentId, gameId, profitCents);
                    await tx.wait();
                } catch (e) {
                    console.log("  [Agent " + agentId + "] Could not record result");
                }
            }
            agentActiveGames.delete(address);
            agentCommits.delete(address);
            return;
        }

        if (state.player !== address) return;

        switch (phase) {
            case GamePhase.RevealCase: {
                const commit = agentCommits.get(address);
                if (!commit) { console.log("  [Agent " + agentId + "] No commit found!"); return; }
                console.log("  [Agent " + agentId + "] Revealing case " + commit.caseIndex + "...");
                const tx = await gameContract.connect(wallet).revealCase(gameId, commit.caseIndex, commit.salt);
                await tx.wait();
                console.log("  [Agent " + agentId + "] Case revealed");
                break;
            }
            case GamePhase.OpeningCases: {
                const unopened = getUnopenedCases(state.openedBitmap, state.playerCaseIndex);
                if (unopened.length === 0) return;
                let caseToOpen: number;
                const aiResult = await aiDecision(
                    strategy.prompt,
                    "Round " + (state.currentRound + 1) + ", " + unopened.length + " cases remaining.",
                    "Which case should I open?",
                    unopened.map((i: number) => "Case " + i)
                );
                if (aiResult >= 0) { caseToOpen = unopened[aiResult]; }
                else { caseToOpen = strategy.pickCaseToOpen(unopened); }
                console.log("  [Agent " + agentId + "] Opening case " + caseToOpen + "...");
                const tx = await gameContract.connect(wallet).openCase(gameId, caseToOpen);
                await tx.wait();
                break;
            }
            case GamePhase.BankerOffer: {
                const remaining = await gameContract.getRemainingValues(gameId);
                const offer = state.bankerOffer;
                let acceptDeal: boolean;
                const aiResult = await aiDecision(
                    strategy.prompt,
                    "Banker offers " + offer + " cents.",
                    "Should I accept this deal?",
                    ["DEAL (accept)", "NO DEAL (reject)"]
                );
                if (aiResult >= 0) { acceptDeal = aiResult === 0; }
                else { acceptDeal = strategy.decideDeal(offer, remaining); }
                if (acceptDeal) {
                    console.log("  [Agent " + agentId + "] Accepting deal of " + offer + " cents");
                    const tx = await gameContract.connect(wallet).acceptDeal(gameId);
                    await tx.wait();
                } else {
                    console.log("  [Agent " + agentId + "] Rejecting deal of " + offer + " cents");
                    const tx = await gameContract.connect(wallet).rejectDeal(gameId);
                    await tx.wait();
                }
                break;
            }
            case GamePhase.FinalSwap: {
                let swap: boolean;
                const aiResult = await aiDecision(
                    strategy.prompt,
                    "Final decision. Keep or swap.",
                    "Should I swap cases?",
                    ["KEEP original case", "SWAP to the other case"]
                );
                if (aiResult >= 0) { swap = aiResult === 1; }
                else { swap = strategy.decideSwap(); }
                console.log("  [Agent " + agentId + "] Final decision: " + (swap ? "SWAP" : "KEEP"));
                const tx = await gameContract.connect(wallet).finalDecision(gameId, swap);
                await tx.wait();
                break;
            }
            default: break;
        }
    } catch (err) {
        console.log("  [Agent " + agentId + "] Error in game " + gameId + ":", (err as Error).message?.slice(0, 120));
    }
}

async function main() {
    if (!GAME_ADDRESS || !REGISTRY_ADDRESS) {
        console.error("Missing GAME_ADDRESS or REGISTRY_ADDRESS env vars");
        process.exit(1);
    }
    console.log("=== Deal or No Deal Agent Runner ===");
    console.log("RPC: " + RPC_URL);
    console.log("Game: " + GAME_ADDRESS);
    console.log("Registry: " + REGISTRY_ADDRESS);
    console.log("AI enabled: " + !!OPENAI_API_KEY);

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const gameContract = new ethers.Contract(GAME_ADDRESS, GAME_ABI, provider);
    const registryContract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);

    const agentWallets = DEMO_AGENT_KEYS.map(key => new ethers.Wallet(key, provider));

    console.log("Demo agent wallets:");
    for (const w of agentWallets) {
        const bal = await provider.getBalance(w.address);
        console.log("  " + w.address + " - Balance: " + ethers.formatEther(bal) + " ETH");
    }

    const demoStrategies: { name: string; type: number; strategy: StrategyName }[] = [
        { name: "AGGRESSIVE banker/player", type: 2, strategy: "AGGRESSIVE" },
        { name: "CONSERVATIVE player", type: 1, strategy: "CONSERVATIVE" },
    ];

    for (let i = 0; i < agentWallets.length; i++) {
        const wallet = agentWallets[i];
        const config = demoStrategies[i];
        const isRegistered = await registryContract.walletRegistered(wallet.address);
        if (!isRegistered) {
            console.log("Registering agent: " + config.name + "...");
            try {
                const tx = await registryContract.connect(wallet).registerAgent(
                    config.strategy, config.type, wallet.address
                );
                await tx.wait();
                const id = (await registryContract.nextAgentId()) - 1n;
                console.log("  Registered as agent " + id);
            } catch (err) {
                console.log("  Registration failed:", (err as Error).message?.slice(0, 100));
            }
        } else {
            const id = await registryContract.walletToAgent(wallet.address);
            console.log("Agent already registered: " + wallet.address + " = agent " + id);
        }
    }

    console.log("Starting agent loop (polling every 3s...)");

    while (true) {
        try {
            const totalAgents = await registryContract.nextAgentId();
            for (let i = 0n; i < totalAgents; i++) {
                const agent = await registryContract.getAgent(i);
                if (!agent.active) continue;
                const walletKey = DEMO_AGENT_KEYS.find((key) => {
                    const w = new ethers.Wallet(key);
                    return w.address.toLowerCase() === agent.wallet.toLowerCase();
                });
                if (!walletKey) continue;
                const wallet = new ethers.Wallet(walletKey, provider);
                const strategy = getStrategyForAgent(agent.strategyURI);
                if (agent.agentType === 0 || agent.agentType === 2) {
                    await bankerAction(wallet, gameContract, i, strategy);
                }
                if (agent.agentType === 1 || agent.agentType === 2) {
                    await playerAction(wallet, gameContract, registryContract, i, strategy);
                }
            }
        } catch (err) {
            console.log("Poll error:", (err as Error).message?.slice(0, 100));
        }
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
}

main().catch(console.error);