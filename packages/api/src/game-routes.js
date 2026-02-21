/**
 * Express router for all Deal or No Deal game endpoints.
 *
 * Each route validates input, interacts with contracts via ethers.js v6,
 * generates ZK proofs where needed, and broadcasts WebSocket events.
 */

const { Router } = require("express");
const { ethers } = require("ethers");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const zk = require("./zk-service");
const { broadcast, broadcastToGame } = require("./ws-broadcast");

const router = Router();

// ============ Contract Setup ============

let provider, hostSigner, factory, factoryAddress;

// ABI paths (Foundry build output)
const FACTORY_ABI_PATH = path.resolve(
  __dirname,
  "../../foundry/out/DealOrNoDealFactory.sol/DealOrNoDealFactory.json"
);
const GAME_ABI_PATH = path.resolve(
  __dirname,
  "../../foundry/out/DealOrNoDeal.sol/DealOrNoDeal.json"
);

let factoryAbi = [];
let gameAbi = [];

/**
 * Load ABIs from Foundry build output.
 * Falls back to minimal ABIs if files do not exist (for dev without forge build).
 */
function loadAbis() {
  try {
    const factoryJson = JSON.parse(fs.readFileSync(FACTORY_ABI_PATH, "utf8"));
    factoryAbi = factoryJson.abi;
    console.log("[contracts] Loaded Factory ABI from Foundry output");
  } catch {
    console.warn("[contracts] Factory ABI not found at", FACTORY_ABI_PATH);
    console.warn("[contracts] Using minimal inline ABI");
    factoryAbi = [
      "function createGame(bytes32 merkleRoot, tuple(uint256 entryFee, uint256 lotteryDuration, uint256 revealDuration, uint256 turnTimeout, uint16 hostFeeBps, uint16 protocolFeeBps, uint16 refundBps, uint8 minPlayers) config, bytes32 salt) external returns (address game, address nftAddr)",
      "function nextGameId() view returns (uint256)",
      "function totalGames() view returns (uint256)",
      "function getDeployment(uint256 gid) view returns (tuple(address game, address nft, address host, uint256 createdAt, uint256 gameId))",
      "function getDeployments(uint256 offset, uint256 limit) view returns (tuple(address game, address nft, address host, uint256 createdAt, uint256 gameId)[])",
      "function getHostGames(address host) view returns (uint256[])",
      "event GameDeployed(uint256 indexed gameId, address indexed game, address indexed nft, address host, bytes32 merkleRoot)",
    ];
  }

  try {
    const gameJson = JSON.parse(fs.readFileSync(GAME_ABI_PATH, "utf8"));
    gameAbi = gameJson.abi;
    console.log("[contracts] Loaded Game ABI from Foundry output");
  } catch {
    console.warn("[contracts] Game ABI not found at", GAME_ABI_PATH);
    console.warn("[contracts] Using minimal inline ABI");
    gameAbi = [
      "function openLottery() external",
      "function enterLottery(bytes32 commitHash) external payable",
      "function closeLotteryEntries() external",
      "function revealSecret(bytes32 secret) external",
      "function drawWinner() external",
      "function selectCase(uint256 caseIndex) external",
      "function openCase(uint256 caseIndex, uint256 value, uint256[2] pA, uint256[2][2] pB, uint256[2] pC) external",
      "function acceptDeal() external",
      "function rejectDeal() external",
      "function revealFinalCase(uint256 value, uint256[2] pA, uint256[2][2] pB, uint256[2] pC) external",
      "function resolveTimeout() external",
      "function claimRefund() external",
      "function getGameState() view returns (tuple(address host, address contestant, uint8 state, uint8 outcome, bytes32 merkleRoot, uint256 prizePool, uint256 currentRound, uint256 selectedCase, uint256 bankerOffer, uint256 lastActionTime, uint256 lotteryEndTime, uint256 revealEndTime, uint256 totalEntries, uint256 hostFee, uint256 protocolFee, tuple(uint256 entryFee, uint256 lotteryDuration, uint256 revealDuration, uint256 turnTimeout, uint16 hostFeeBps, uint16 protocolFeeBps, uint16 refundBps, uint8 minPlayers) config) gameData, uint256 remainingCount, uint256 currentEV, uint256 casesLeftThisRound)",
      "function getRemainingValues() view returns (uint256[])",
      "function previewBankerOffer() view returns (uint256 offer, uint256 ev)",
      "function getBriefcase(uint256 caseIndex) view returns (tuple(uint256 value, bool opened, bool revealed, address holder))",
      "function getLotteryEntryCount() view returns (uint256)",
      "function gameId() view returns (uint256)",
      "event GameCreated(uint256 indexed gameId, address indexed host, bytes32 merkleRoot)",
      "event LotteryOpened(uint256 indexed gameId, uint256 entryFee, uint256 endTime)",
      "event LotteryEntered(uint256 indexed gameId, address indexed player, uint256 entryIndex)",
      "event SecretRevealed(uint256 indexed gameId, address indexed player)",
      "event ContestantSelected(uint256 indexed gameId, address indexed contestant)",
      "event CaseSelected(uint256 indexed gameId, uint256 caseIndex)",
      "event CaseOpened(uint256 indexed gameId, uint256 caseIndex, uint256 value)",
      "event BankerOfferMade(uint256 indexed gameId, uint256 round, uint256 offer)",
      "event DealAccepted(uint256 indexed gameId, uint256 offer)",
      "event DealRejected(uint256 indexed gameId, uint256 round)",
      "event FinalCaseRevealed(uint256 indexed gameId, uint256 caseIndex, uint256 value)",
      "event GameResolved(uint256 indexed gameId, uint8 outcome, uint256 payout)",
    ];
  }
}

/**
 * Initialize provider, signer, and factory contract.
 * Called once at startup from index.js.
 */
function initContracts() {
  loadAbis();

  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  factoryAddress = process.env.FACTORY_ADDRESS;

  if (!rpcUrl || !privateKey || !factoryAddress) {
    console.warn("[contracts] Missing env vars (RPC_URL, PRIVATE_KEY, FACTORY_ADDRESS).");
    console.warn("[contracts] Contract interactions will fail. Set them in .env");
    return;
  }

  provider = new ethers.JsonRpcProvider(rpcUrl);
  hostSigner = new ethers.Wallet(privateKey, provider);
  factory = new ethers.Contract(factoryAddress, factoryAbi, hostSigner);

  console.log(`[contracts] Host wallet: ${hostSigner.address}`);
  console.log(`[contracts] Factory: ${factoryAddress}`);
  console.log(`[contracts] RPC: ${rpcUrl}`);
}

/**
 * Get a game contract instance by its onchain address.
 * @param {string} gameAddress
 * @returns {ethers.Contract}
 */
function getGameContract(gameAddress) {
  if (!provider) throw new Error("Contracts not initialized. Check env vars.");
  return new ethers.Contract(gameAddress, gameAbi, hostSigner);
}

// ============ In-Memory Game Data ============
//
// The API tracks offchain data that the contracts do not store:
// - Merkle trees, salts, case values (needed for proof generation)
// - Game address <-> game ID mapping
//

/** @type {Map<string, object>} gameId -> offchain game data */
const gameDataStore = new Map();

// Game state enum labels matching GameTypes.sol
const GAME_STATES = [
  "Created",
  "LotteryOpen",
  "LotteryReveal",
  "LotteryComplete",
  "CaseSelection",
  "RoundPlay",
  "BankerOffer",
  "GameOver",
];

const GAME_OUTCOMES = ["None", "Deal", "NoDeal", "TimeoutResolved"];

// ============ Routes ============

/**
 * POST /games
 * Create a new game. The API acts as the host:
 *   1. Generate case values, salts, and Merkle tree offchain
 *   2. Call factory.createGame(merkleRoot, config, salt) onchain
 *   3. Store the tree data for later proof generation
 *   4. Open the lottery immediately
 *
 * Body: {
 *   entryFee: string (ETH),
 *   lotteryDuration?: number (seconds, default 3600),
 *   revealDuration?: number (seconds, default 1800),
 *   turnTimeout?: number (seconds, default 3600),
 *   hostFeeBps?: number (default 500),
 *   protocolFeeBps?: number (default 500),
 *   refundBps?: number (default 5000),
 *   minPlayers?: number (default 2)
 * }
 */
router.post("/", async (req, res) => {
  try {
    const {
      entryFee,
      lotteryDuration = 3600,
      revealDuration = 1800,
      turnTimeout = 3600,
      hostFeeBps = 500,
      protocolFeeBps = 500,
      refundBps = 5000,
      minPlayers = 2,
    } = req.body;

    // Validate required fields
    if (!entryFee) {
      return res.status(400).json({ error: "entryFee is required (in ETH)" });
    }

    const entryFeeWei = ethers.parseEther(String(entryFee));
    if (entryFeeWei === 0n) {
      return res.status(400).json({ error: "entryFee must be > 0" });
    }

    if (hostFeeBps + protocolFeeBps > 2000) {
      return res.status(400).json({ error: "hostFeeBps + protocolFeeBps must be <= 2000" });
    }
    if (refundBps > 8000) {
      return res.status(400).json({ error: "refundBps must be <= 8000" });
    }
    if (minPlayers < 2) {
      return res.status(400).json({ error: "minPlayers must be >= 2" });
    }

    if (!factory) {
      return res.status(503).json({
        error: "Contract connection not configured",
        hint: "Set RPC_URL, PRIVATE_KEY, and FACTORY_ADDRESS in .env",
      });
    }

    // Step 1: Estimate prize pool and set up ZK data offchain
    // Prize pool = entryFee * minPlayers (minimum), but actual pool depends on entries.
    // We use a placeholder prize pool for the Merkle tree (the contract recalculates onchain).
    // The offchain tree is used for proof generation; values will match if pool matches.
    const estimatedPool = entryFeeWei * BigInt(minPlayers);
    const { caseValues, salts, tree, merkleRoot } = await zk.setupGame(estimatedPool);

    // Step 2: Create game onchain
    const config = {
      entryFee: entryFeeWei,
      lotteryDuration,
      revealDuration,
      turnTimeout,
      hostFeeBps,
      protocolFeeBps,
      refundBps,
      minPlayers,
    };

    const salt = ethers.hexlify(crypto.randomBytes(32));
    const merkleRootHex = "0x" + merkleRoot.toString(16).padStart(64, "0");

    console.log(`[game] Creating game with merkleRoot ${merkleRootHex.slice(0, 18)}...`);

    const tx = await factory.createGame(merkleRootHex, config, salt);
    const receipt = await tx.wait();

    // Parse the GameDeployed event to get addresses
    let gameAddress, nftAddress, gameId;

    for (const log of receipt.logs) {
      try {
        const parsed = factory.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === "GameDeployed") {
          gameId = parsed.args[0].toString();
          gameAddress = parsed.args[1];
          nftAddress = parsed.args[2];
          break;
        }
      } catch {
        // Not our event, skip
      }
    }

    if (!gameAddress) {
      return res.status(500).json({ error: "Game creation tx succeeded but could not parse GameDeployed event" });
    }

    // Step 3: Store offchain data
    gameDataStore.set(gameId, {
      gameId,
      gameAddress,
      nftAddress,
      caseValues: caseValues.map((v) => v.toString()),
      salts: salts.map((s) => s.toString()),
      tree,
      merkleRoot: merkleRoot.toString(),
      config,
      createdAt: Date.now(),
      createdBy: req.agent?.id || "unknown",
    });

    // Step 4: Open lottery immediately
    const gameContract = getGameContract(gameAddress);
    const openTx = await gameContract.openLottery();
    await openTx.wait();

    console.log(`[game] Game ${gameId} created at ${gameAddress}, lottery opened`);

    // Broadcast
    broadcast("game:created", {
      gameId,
      gameAddress,
      nftAddress,
      host: hostSigner.address,
      entryFee: entryFee.toString(),
      lotteryDuration,
    });

    res.status(201).json({
      gameId,
      gameAddress,
      nftAddress,
      host: hostSigner.address,
      merkleRoot: merkleRootHex,
      config: {
        entryFee: entryFee.toString(),
        lotteryDuration,
        revealDuration,
        turnTimeout,
        hostFeeBps,
        protocolFeeBps,
        refundBps,
        minPlayers,
      },
      txHash: receipt.hash,
      state: "LotteryOpen",
    });
  } catch (err) {
    console.error("[game] Create error:", err);
    res.status(500).json({ error: "Failed to create game", details: err.message });
  }
});

/**
 * GET /games
 * List active games from the factory. Supports pagination.
 *
 * Query: ?offset=0&limit=20
 */
router.get("/", async (req, res) => {
  try {
    if (!factory) {
      return res.status(503).json({ error: "Contract connection not configured" });
    }

    const offset = parseInt(req.query.offset) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const totalGames = await factory.totalGames();
    const deployments = await factory.getDeployments(offset, limit);

    const games = [];
    for (const d of deployments) {
      const gameId = d.gameId.toString();
      const gameAddress = d.game;

      // Try to fetch onchain state
      let stateInfo = {};
      try {
        const gameContract = getGameContract(gameAddress);
        const [gameData, remainingCount, currentEV] = await gameContract.getGameState();
        stateInfo = {
          state: GAME_STATES[Number(gameData.state)] || "Unknown",
          stateIndex: Number(gameData.state),
          outcome: GAME_OUTCOMES[Number(gameData.outcome)] || "Unknown",
          contestant: gameData.contestant,
          prizePool: ethers.formatEther(gameData.prizePool),
          currentRound: Number(gameData.currentRound),
          bankerOffer: ethers.formatEther(gameData.bankerOffer),
          totalEntries: Number(gameData.totalEntries),
          remainingCases: Number(remainingCount),
          currentEV: ethers.formatEther(currentEV),
        };
      } catch {
        stateInfo = { state: "Unknown", error: "Could not read game state" };
      }

      games.push({
        gameId,
        gameAddress,
        nftAddress: d.nft,
        host: d.host,
        createdAt: Number(d.createdAt),
        ...stateInfo,
      });
    }

    res.json({
      total: Number(totalGames),
      offset,
      limit,
      games,
    });
  } catch (err) {
    console.error("[game] List error:", err);
    res.status(500).json({ error: "Failed to list games", details: err.message });
  }
});

/**
 * GET /games/:id
 * Full game state + EV analysis for a specific game.
 *
 * :id is the game ID (numeric). We look up the game address from the factory.
 */
router.get("/:id", async (req, res) => {
  try {
    if (!factory) {
      return res.status(503).json({ error: "Contract connection not configured" });
    }

    const gameId = req.params.id;
    const deployment = await factory.getDeployment(gameId);

    if (!deployment || deployment.game === ethers.ZeroAddress) {
      return res.status(404).json({ error: "Game not found" });
    }

    const gameContract = getGameContract(deployment.game);
    const [gameData, remainingCount, currentEV, casesLeftThisRound] =
      await gameContract.getGameState();

    // Fetch remaining values for EV analysis
    let remainingValues = [];
    let evAnalysis = {};
    try {
      remainingValues = await gameContract.getRemainingValues();
      const values = remainingValues.map((v) => Number(ethers.formatEther(v)));
      const sum = values.reduce((a, b) => a + b, 0);
      const ev = values.length > 0 ? sum / values.length : 0;
      const variance =
        values.length > 0
          ? values.reduce((a, v) => a + (v - ev) ** 2, 0) / values.length
          : 0;
      const stdDev = Math.sqrt(variance);

      evAnalysis = {
        expectedValue: ev.toFixed(6),
        standardDeviation: stdDev.toFixed(6),
        minRemaining: values.length > 0 ? Math.min(...values).toFixed(6) : "0",
        maxRemaining: values.length > 0 ? Math.max(...values).toFixed(6) : "0",
        remainingCount: values.length,
      };
    } catch {
      // Game may be in early state without remaining values
    }

    // Banker offer preview
    let bankerPreview = {};
    try {
      const [offer, ev] = await gameContract.previewBankerOffer();
      bankerPreview = {
        nextOffer: ethers.formatEther(offer),
        currentEV: ethers.formatEther(ev),
        offerToEVRatio:
          ev > 0n ? ((Number(offer) * 10000) / Number(ev) / 100).toFixed(2) + "%" : "N/A",
      };
    } catch {
      // May not be available in all states
    }

    // Briefcase status
    const briefcases = [];
    for (let i = 0; i < 26; i++) {
      try {
        const bc = await gameContract.getBriefcase(i);
        briefcases.push({
          index: i,
          opened: bc.opened,
          revealed: bc.revealed,
          value: bc.revealed ? ethers.formatEther(bc.value) : null,
        });
      } catch {
        briefcases.push({ index: i, opened: false, revealed: false, value: null });
      }
    }

    const stateIndex = Number(gameData.state);

    res.json({
      gameId,
      gameAddress: deployment.game,
      nftAddress: deployment.nft,
      host: gameData.host,
      contestant: gameData.contestant,
      state: GAME_STATES[stateIndex] || "Unknown",
      stateIndex,
      outcome: GAME_OUTCOMES[Number(gameData.outcome)] || "Unknown",
      merkleRoot: gameData.merkleRoot,
      prizePool: ethers.formatEther(gameData.prizePool),
      currentRound: Number(gameData.currentRound),
      selectedCase: Number(gameData.selectedCase),
      bankerOffer: ethers.formatEther(gameData.bankerOffer),
      lastActionTime: Number(gameData.lastActionTime),
      lotteryEndTime: Number(gameData.lotteryEndTime),
      revealEndTime: Number(gameData.revealEndTime),
      totalEntries: Number(gameData.totalEntries),
      casesLeftThisRound: Number(casesLeftThisRound),
      config: {
        entryFee: ethers.formatEther(gameData.config.entryFee),
        lotteryDuration: Number(gameData.config.lotteryDuration),
        revealDuration: Number(gameData.config.revealDuration),
        turnTimeout: Number(gameData.config.turnTimeout),
        hostFeeBps: Number(gameData.config.hostFeeBps),
        protocolFeeBps: Number(gameData.config.protocolFeeBps),
        refundBps: Number(gameData.config.refundBps),
        minPlayers: Number(gameData.config.minPlayers),
      },
      evAnalysis,
      bankerPreview,
      briefcases,
      remainingValues: remainingValues.map((v) => ethers.formatEther(v)),
    });
  } catch (err) {
    console.error("[game] Get error:", err);
    res.status(500).json({ error: "Failed to get game state", details: err.message });
  }
});

/**
 * POST /games/:id/lottery/enter
 * Enter the lottery for a game with a commit hash.
 *
 * Body: {
 *   commitHash: string (hex),       // keccak256(abi.encodePacked(secret, playerAddress))
 *   playerAddress: string,           // the player's address (for event tracking)
 * }
 *
 * Note: The actual enterLottery call must come from the player's wallet (msg.sender check).
 * This endpoint prepares the calldata and can relay if the host has a relayer role.
 * For agent-to-agent play, the API can sign on behalf of agents.
 */
router.post("/:id/lottery/enter", async (req, res) => {
  try {
    const { commitHash, playerAddress } = req.body;
    const gameId = req.params.id;

    if (!commitHash || !playerAddress) {
      return res.status(400).json({
        error: "commitHash and playerAddress are required",
        hint: "commitHash = keccak256(abi.encodePacked(secret, playerAddress))",
      });
    }

    if (!ethers.isHexString(commitHash, 32)) {
      return res.status(400).json({ error: "commitHash must be a 32-byte hex string" });
    }

    if (!ethers.isAddress(playerAddress)) {
      return res.status(400).json({ error: "Invalid playerAddress" });
    }

    const deployment = await factory.getDeployment(gameId);
    if (!deployment || deployment.game === ethers.ZeroAddress) {
      return res.status(404).json({ error: "Game not found" });
    }

    const gameContract = getGameContract(deployment.game);

    // Read entry fee
    const [gameData] = await gameContract.getGameState();
    const entryFee = gameData.config.entryFee;

    // The host relays the lottery entry, paying the entry fee from the host wallet.
    // In production, players would sign their own txs or use a meta-tx relayer.
    const tx = await gameContract.enterLottery(commitHash, { value: entryFee });
    const receipt = await tx.wait();

    broadcastToGame(gameId, "lottery:entered", {
      gameId,
      player: playerAddress,
      txHash: receipt.hash,
    });

    res.json({
      success: true,
      gameId,
      player: playerAddress,
      entryFee: ethers.formatEther(entryFee),
      txHash: receipt.hash,
      hint: "Next: wait for lottery to close, then reveal your secret",
    });
  } catch (err) {
    console.error("[game] Lottery enter error:", err);
    res.status(500).json({ error: "Failed to enter lottery", details: err.message });
  }
});

/**
 * POST /games/:id/lottery/reveal
 * Reveal the lottery secret.
 *
 * Body: {
 *   secret: string (hex, 32 bytes)
 * }
 */
router.post("/:id/lottery/reveal", async (req, res) => {
  try {
    const { secret } = req.body;
    const gameId = req.params.id;

    if (!secret) {
      return res.status(400).json({ error: "secret is required (32-byte hex)" });
    }

    if (!ethers.isHexString(secret, 32)) {
      return res.status(400).json({ error: "secret must be a 32-byte hex string" });
    }

    const deployment = await factory.getDeployment(gameId);
    if (!deployment || deployment.game === ethers.ZeroAddress) {
      return res.status(404).json({ error: "Game not found" });
    }

    const gameContract = getGameContract(deployment.game);
    const tx = await gameContract.revealSecret(secret);
    const receipt = await tx.wait();

    broadcastToGame(gameId, "lottery:revealed", {
      gameId,
      txHash: receipt.hash,
    });

    res.json({
      success: true,
      gameId,
      txHash: receipt.hash,
      hint: "Wait for reveal window to close, then drawWinner can be called",
    });
  } catch (err) {
    console.error("[game] Lottery reveal error:", err);
    res.status(500).json({ error: "Failed to reveal secret", details: err.message });
  }
});

/**
 * POST /games/:id/select-case
 * Contestant picks their briefcase.
 *
 * Body: { caseIndex: number (0-25) }
 */
router.post("/:id/select-case", async (req, res) => {
  try {
    const { caseIndex } = req.body;
    const gameId = req.params.id;

    if (caseIndex === undefined || caseIndex === null) {
      return res.status(400).json({ error: "caseIndex is required (0-25)" });
    }

    const idx = Number(caseIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx > 25) {
      return res.status(400).json({ error: "caseIndex must be an integer 0-25" });
    }

    const deployment = await factory.getDeployment(gameId);
    if (!deployment || deployment.game === ethers.ZeroAddress) {
      return res.status(404).json({ error: "Game not found" });
    }

    const gameContract = getGameContract(deployment.game);
    const tx = await gameContract.selectCase(idx);
    const receipt = await tx.wait();

    broadcastToGame(gameId, "case:selected", {
      gameId,
      caseIndex: idx,
      txHash: receipt.hash,
    });

    res.json({
      success: true,
      gameId,
      caseIndex: idx,
      txHash: receipt.hash,
      hint: "Now open cases one at a time with POST /games/:id/open-case",
    });
  } catch (err) {
    console.error("[game] Select case error:", err);
    res.status(500).json({ error: "Failed to select case", details: err.message });
  }
});

/**
 * POST /games/:id/open-case
 * Open a briefcase. The API generates the ZK proof from stored tree data.
 *
 * Body: { caseIndex: number (0-25) }
 */
router.post("/:id/open-case", async (req, res) => {
  try {
    const { caseIndex } = req.body;
    const gameId = req.params.id;

    if (caseIndex === undefined || caseIndex === null) {
      return res.status(400).json({ error: "caseIndex is required (0-25)" });
    }

    const idx = Number(caseIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx > 25) {
      return res.status(400).json({ error: "caseIndex must be an integer 0-25" });
    }

    const offchainData = gameDataStore.get(gameId);
    if (!offchainData) {
      return res.status(404).json({
        error: "Game offchain data not found",
        hint: "This game may have been created before the API started, or on a different instance",
      });
    }

    const deployment = await factory.getDeployment(gameId);
    if (!deployment || deployment.game === ethers.ZeroAddress) {
      return res.status(404).json({ error: "Game not found onchain" });
    }

    // Generate ZK proof
    const value = BigInt(offchainData.caseValues[idx]);
    const salt = BigInt(offchainData.salts[idx]);

    console.log(`[zk] Generating proof for case ${idx}, value ${value}`);
    const { proof, publicSignals, mock } = await zk.generateProof(
      idx,
      value,
      salt,
      offchainData.tree
    );

    // Call openCase onchain
    const gameContract = getGameContract(deployment.game);
    const tx = await gameContract.openCase(
      idx,
      value,
      proof.pA,
      proof.pB,
      proof.pC
    );
    const receipt = await tx.wait();

    // Check if a BankerOfferMade event was emitted (round complete)
    let bankerOffer = null;
    for (const log of receipt.logs) {
      try {
        const parsed = gameContract.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === "BankerOfferMade") {
          bankerOffer = ethers.formatEther(parsed.args[2]);
        }
      } catch {
        // Not our event
      }
    }

    broadcastToGame(gameId, "case:opened", {
      gameId,
      caseIndex: idx,
      value: ethers.formatEther(value),
      txHash: receipt.hash,
      bankerOffer,
      proofMock: mock,
    });

    const response = {
      success: true,
      gameId,
      caseIndex: idx,
      revealedValue: ethers.formatEther(value),
      txHash: receipt.hash,
      proofMock: mock,
    };

    if (bankerOffer) {
      response.bankerOffer = bankerOffer;
      response.hint = "Banker has made an offer! Accept with POST /deal or reject with POST /no-deal";
    } else {
      response.hint = "Keep opening cases this round";
    }

    res.json(response);
  } catch (err) {
    console.error("[game] Open case error:", err);
    res.status(500).json({ error: "Failed to open case", details: err.message });
  }
});

/**
 * POST /games/:id/deal
 * Accept the banker's offer.
 */
router.post("/:id/deal", async (req, res) => {
  try {
    const gameId = req.params.id;

    const deployment = await factory.getDeployment(gameId);
    if (!deployment || deployment.game === ethers.ZeroAddress) {
      return res.status(404).json({ error: "Game not found" });
    }

    const gameContract = getGameContract(deployment.game);

    // Get current offer for response
    const [gameData] = await gameContract.getGameState();
    const offer = ethers.formatEther(gameData.bankerOffer);

    const tx = await gameContract.acceptDeal();
    const receipt = await tx.wait();

    broadcastToGame(gameId, "deal:accepted", {
      gameId,
      offer,
      txHash: receipt.hash,
    });

    broadcast("game:ended", {
      gameId,
      outcome: "Deal",
      payout: offer,
    });

    res.json({
      success: true,
      gameId,
      outcome: "Deal",
      acceptedOffer: offer,
      txHash: receipt.hash,
    });
  } catch (err) {
    console.error("[game] Deal error:", err);
    res.status(500).json({ error: "Failed to accept deal", details: err.message });
  }
});

/**
 * POST /games/:id/no-deal
 * Reject the banker's offer and continue playing.
 */
router.post("/:id/no-deal", async (req, res) => {
  try {
    const gameId = req.params.id;

    const deployment = await factory.getDeployment(gameId);
    if (!deployment || deployment.game === ethers.ZeroAddress) {
      return res.status(404).json({ error: "Game not found" });
    }

    const gameContract = getGameContract(deployment.game);

    // Get current state before rejecting
    const [gameData, remainingCount, currentEV] = await gameContract.getGameState();
    const rejectedOffer = ethers.formatEther(gameData.bankerOffer);
    const round = Number(gameData.currentRound);

    const tx = await gameContract.rejectDeal();
    const receipt = await tx.wait();

    // Check if this triggers final case reveal (all rounds done)
    const [newGameData] = await gameContract.getGameState();
    const newState = GAME_STATES[Number(newGameData.state)];

    broadcastToGame(gameId, "deal:rejected", {
      gameId,
      rejectedOffer,
      round,
      newState,
      txHash: receipt.hash,
    });

    const response = {
      success: true,
      gameId,
      rejectedOffer,
      round,
      newState,
      currentEV: ethers.formatEther(currentEV),
      remainingCases: Number(remainingCount),
      txHash: receipt.hash,
    };

    if (newState === "RoundPlay" && Number(newGameData.currentRound) >= 10) {
      response.hint = "All rounds complete! The final case needs to be revealed with a ZK proof.";
    } else {
      response.hint = `Continue opening cases. Round ${Number(newGameData.currentRound) + 1} of 10.`;
    }

    res.json(response);
  } catch (err) {
    console.error("[game] No deal error:", err);
    res.status(500).json({ error: "Failed to reject deal", details: err.message });
  }
});

// ============ Admin / Helper Routes ============

/**
 * POST /games/:id/lottery/close
 * Close lottery entries (callable after lotteryEndTime).
 */
router.post("/:id/lottery/close", async (req, res) => {
  try {
    const gameId = req.params.id;

    const deployment = await factory.getDeployment(gameId);
    if (!deployment || deployment.game === ethers.ZeroAddress) {
      return res.status(404).json({ error: "Game not found" });
    }

    const gameContract = getGameContract(deployment.game);
    const tx = await gameContract.closeLotteryEntries();
    const receipt = await tx.wait();

    broadcastToGame(gameId, "lottery:closed", { gameId, txHash: receipt.hash });

    res.json({
      success: true,
      gameId,
      txHash: receipt.hash,
      hint: "Lottery entries closed. Players should now reveal their secrets.",
    });
  } catch (err) {
    console.error("[game] Lottery close error:", err);
    res.status(500).json({ error: "Failed to close lottery", details: err.message });
  }
});

/**
 * POST /games/:id/lottery/draw
 * Draw the winner after reveal window closes.
 */
router.post("/:id/lottery/draw", async (req, res) => {
  try {
    const gameId = req.params.id;

    const deployment = await factory.getDeployment(gameId);
    if (!deployment || deployment.game === ethers.ZeroAddress) {
      return res.status(404).json({ error: "Game not found" });
    }

    const gameContract = getGameContract(deployment.game);
    const tx = await gameContract.drawWinner();
    const receipt = await tx.wait();

    // Parse ContestantSelected event
    let contestant = null;
    for (const log of receipt.logs) {
      try {
        const parsed = gameContract.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === "ContestantSelected") {
          contestant = parsed.args[1];
        }
      } catch {
        // Not our event
      }
    }

    broadcastToGame(gameId, "lottery:winner", {
      gameId,
      contestant,
      txHash: receipt.hash,
    });

    broadcast("game:contestant-selected", {
      gameId,
      contestant,
    });

    res.json({
      success: true,
      gameId,
      contestant,
      txHash: receipt.hash,
      hint: "Contestant selected! They should now pick their case with POST /games/:id/select-case",
    });
  } catch (err) {
    console.error("[game] Draw winner error:", err);
    res.status(500).json({ error: "Failed to draw winner", details: err.message });
  }
});

/**
 * POST /games/:id/reveal-final
 * Reveal the contestant's selected case at game end (ZK proof required).
 * This is called after all rounds are complete and no deal was made.
 */
router.post("/:id/reveal-final", async (req, res) => {
  try {
    const gameId = req.params.id;

    const offchainData = gameDataStore.get(gameId);
    if (!offchainData) {
      return res.status(404).json({ error: "Game offchain data not found" });
    }

    const deployment = await factory.getDeployment(gameId);
    if (!deployment || deployment.game === ethers.ZeroAddress) {
      return res.status(404).json({ error: "Game not found onchain" });
    }

    const gameContract = getGameContract(deployment.game);
    const [gameData] = await gameContract.getGameState();
    const selectedCase = Number(gameData.selectedCase);

    // Generate ZK proof for the final case
    const value = BigInt(offchainData.caseValues[selectedCase]);
    const salt = BigInt(offchainData.salts[selectedCase]);

    console.log(`[zk] Generating final case proof for case ${selectedCase}, value ${value}`);
    const { proof, mock } = await zk.generateProof(
      selectedCase,
      value,
      salt,
      offchainData.tree
    );

    const tx = await gameContract.revealFinalCase(
      value,
      proof.pA,
      proof.pB,
      proof.pC
    );
    const receipt = await tx.wait();

    const revealedValue = ethers.formatEther(value);

    broadcastToGame(gameId, "case:final-revealed", {
      gameId,
      caseIndex: selectedCase,
      value: revealedValue,
      txHash: receipt.hash,
    });

    broadcast("game:ended", {
      gameId,
      outcome: "NoDeal",
      payout: revealedValue,
    });

    res.json({
      success: true,
      gameId,
      outcome: "NoDeal",
      selectedCase,
      revealedValue,
      proofMock: mock,
      txHash: receipt.hash,
    });
  } catch (err) {
    console.error("[game] Reveal final error:", err);
    res.status(500).json({ error: "Failed to reveal final case", details: err.message });
  }
});

/**
 * POST /games/:id/timeout
 * Resolve a timed-out game.
 */
router.post("/:id/timeout", async (req, res) => {
  try {
    const gameId = req.params.id;

    const deployment = await factory.getDeployment(gameId);
    if (!deployment || deployment.game === ethers.ZeroAddress) {
      return res.status(404).json({ error: "Game not found" });
    }

    const gameContract = getGameContract(deployment.game);
    const tx = await gameContract.resolveTimeout();
    const receipt = await tx.wait();

    broadcastToGame(gameId, "game:timeout", { gameId, txHash: receipt.hash });

    res.json({
      success: true,
      gameId,
      outcome: "TimeoutResolved",
      txHash: receipt.hash,
    });
  } catch (err) {
    console.error("[game] Timeout resolve error:", err);
    res.status(500).json({ error: "Failed to resolve timeout", details: err.message });
  }
});

// ============ Exports ============

module.exports = { router, initContracts };
