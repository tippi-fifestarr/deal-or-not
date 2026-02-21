/**
 * Deal or No Deal — Agent REST API + WebSocket Server
 *
 * Phase 2: Provides a complete API for AI agents to create, join, and play
 * onchain Deal or No Deal games. Handles ZK proof generation offchain and
 * broadcasts real-time events over WebSocket.
 *
 * Usage:
 *   cp .env.example .env  # fill in your values
 *   yarn install
 *   yarn dev              # starts with --watch for hot reload
 */

require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");

const { agentAuth, createApiKey, listApiKeys } = require("./agent-auth");
const { router: gameRouter, initContracts } = require("./game-routes");
const { createWSS, getStats } = require("./ws-broadcast");
const zk = require("./zk-service");

const PORT = parseInt(process.env.PORT, 10) || 3001;

const app = express();
const server = http.createServer(app);

// ============ Middleware ============

app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const level = status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO";
    console.log(`[${level}] ${req.method} ${req.originalUrl} ${status} ${duration}ms`);
  });
  next();
});

// ============ Public Routes ============

app.get("/", (req, res) => {
  res.json({
    name: "Deal or No Deal Agent API",
    version: "0.1.0",
    docs: {
      createGame: "POST /games",
      listGames: "GET /games",
      getGame: "GET /games/:id",
      enterLottery: "POST /games/:id/lottery/enter",
      revealSecret: "POST /games/:id/lottery/reveal",
      closeLottery: "POST /games/:id/lottery/close",
      drawWinner: "POST /games/:id/lottery/draw",
      selectCase: "POST /games/:id/select-case",
      openCase: "POST /games/:id/open-case",
      deal: "POST /games/:id/deal",
      noDeal: "POST /games/:id/no-deal",
      revealFinal: "POST /games/:id/reveal-final",
      resolveTimeout: "POST /games/:id/timeout",
      websocket: "WS /",
    },
    auth: "Bearer dond_<your_api_key>",
    rateLimit: "60 requests/minute per key",
  });
});

app.get("/health", (req, res) => {
  const wsStats = getStats();
  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    websocket: wsStats,
    contracts: {
      rpcUrl: process.env.RPC_URL ? "configured" : "missing",
      factory: process.env.FACTORY_ADDRESS ? "configured" : "missing",
      signer: process.env.PRIVATE_KEY ? "configured" : "missing",
    },
  });
});

// ============ Admin Routes (auth-protected) ============

app.post("/admin/keys", agentAuth, (req, res) => {
  const label = req.body.label || "unnamed";
  const key = createApiKey(label);
  res.status(201).json({
    message: "API key created",
    ...key,
    warning: "Store this key securely. It cannot be retrieved after this response.",
  });
});

app.get("/admin/keys", agentAuth, (req, res) => {
  res.json({ keys: listApiKeys() });
});

// ============ Game Routes (auth-protected) ============

app.use("/games", agentAuth, gameRouter);

// ============ Error Handling ============

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    path: req.originalUrl,
    hint: "GET / for available endpoints",
  });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error("[ERROR] Unhandled:", err);
  res.status(500).json({
    error: "Internal server error",
    // Do not leak stack traces in production
    ...(process.env.NODE_ENV !== "production" && { details: err.message }),
  });
});

// ============ Startup ============

async function start() {
  // Initialize ZK service (lazy Poseidon init)
  try {
    await zk.init();
    console.log("[zk] Poseidon hasher initialized");
  } catch (err) {
    console.warn("[zk] Poseidon init failed (proofs will be generated on first use):", err.message);
  }

  // Initialize contract connections
  initContracts();

  // Attach WebSocket server
  const wss = createWSS(server);
  console.log("[ws] WebSocket server attached");

  // Start listening
  server.listen(PORT, () => {
    console.log("");
    console.log("=================================================");
    console.log("  Deal or No Deal Agent API");
    console.log("=================================================");
    console.log(`  REST API:    http://localhost:${PORT}`);
    console.log(`  WebSocket:   ws://localhost:${PORT}`);
    console.log(`  Health:      http://localhost:${PORT}/health`);
    console.log("");
    console.log("  Auth:        Bearer dond_admin_dev_key_12345");
    console.log("  Rate limit:  60 req/min per key");
    console.log("=================================================");
    console.log("");
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
