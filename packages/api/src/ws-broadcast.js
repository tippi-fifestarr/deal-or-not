/**
 * WebSocket broadcast service.
 *
 * Manages connected clients, per-game subscriptions, and broadcast helpers.
 * Clients subscribe to a game by sending: {"subscribe": "<gameId>"}
 * Clients unsubscribe with: {"unsubscribe": "<gameId>"}
 */

const { WebSocketServer } = require("ws");

/** @type {Set<import('ws').WebSocket>} all connected clients */
const clients = new Set();

/** @type {Map<string, Set<import('ws').WebSocket>>} gameId -> subscribed clients */
const gameSubscriptions = new Map();

/** @type {WeakMap<import('ws').WebSocket, Set<string>>} ws -> subscribed gameIds */
const clientSubscriptions = new WeakMap();

/**
 * Attach a WebSocket server to an existing HTTP server.
 * @param {import('http').Server} server
 * @returns {import('ws').WebSocketServer}
 */
function createWSS(server) {
  const wss = new WebSocketServer({ server, path: "/" });

  wss.on("connection", (ws, req) => {
    clients.add(ws);
    clientSubscriptions.set(ws, new Set());

    const remoteAddr = req.socket.remoteAddress;
    console.log(`[ws] client connected from ${remoteAddr} (${clients.size} total)`);

    // Send welcome
    safeSend(ws, {
      type: "connected",
      message: "Deal or No Deal WebSocket API",
      commands: [
        '{"subscribe": "<gameId>"} - subscribe to game events',
        '{"unsubscribe": "<gameId>"} - unsubscribe from game events',
      ],
    });

    ws.on("message", (raw) => {
      handleMessage(ws, raw);
    });

    ws.on("close", () => {
      cleanup(ws);
      console.log(`[ws] client disconnected (${clients.size} total)`);
    });

    ws.on("error", (err) => {
      console.error("[ws] client error:", err.message);
      cleanup(ws);
    });
  });

  return wss;
}

/**
 * Handle an incoming client message (subscribe/unsubscribe).
 * @param {import('ws').WebSocket} ws
 * @param {Buffer} raw
 */
function handleMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    safeSend(ws, { type: "error", message: "Invalid JSON" });
    return;
  }

  if (msg.subscribe) {
    const gameId = String(msg.subscribe);
    subscribeToGame(ws, gameId);
    safeSend(ws, { type: "subscribed", gameId });
    return;
  }

  if (msg.unsubscribe) {
    const gameId = String(msg.unsubscribe);
    unsubscribeFromGame(ws, gameId);
    safeSend(ws, { type: "unsubscribed", gameId });
    return;
  }

  safeSend(ws, { type: "error", message: "Unknown command. Use subscribe/unsubscribe." });
}

/**
 * Subscribe a client to a game's events.
 * @param {import('ws').WebSocket} ws
 * @param {string} gameId
 */
function subscribeToGame(ws, gameId) {
  // Track on the game side
  if (!gameSubscriptions.has(gameId)) {
    gameSubscriptions.set(gameId, new Set());
  }
  gameSubscriptions.get(gameId).add(ws);

  // Track on the client side (for cleanup)
  const subs = clientSubscriptions.get(ws);
  if (subs) subs.add(gameId);
}

/**
 * Unsubscribe a client from a game.
 * @param {import('ws').WebSocket} ws
 * @param {string} gameId
 */
function unsubscribeFromGame(ws, gameId) {
  const gameSubs = gameSubscriptions.get(gameId);
  if (gameSubs) {
    gameSubs.delete(ws);
    if (gameSubs.size === 0) gameSubscriptions.delete(gameId);
  }

  const subs = clientSubscriptions.get(ws);
  if (subs) subs.delete(gameId);
}

/**
 * Remove a disconnected client from all subscriptions.
 * @param {import('ws').WebSocket} ws
 */
function cleanup(ws) {
  clients.delete(ws);

  const subs = clientSubscriptions.get(ws);
  if (subs) {
    for (const gameId of subs) {
      const gameSubs = gameSubscriptions.get(gameId);
      if (gameSubs) {
        gameSubs.delete(ws);
        if (gameSubs.size === 0) gameSubscriptions.delete(gameId);
      }
    }
  }
}

/**
 * Send JSON to a single WebSocket, handling closed connections.
 * @param {import('ws').WebSocket} ws
 * @param {object} data
 */
function safeSend(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ============ Broadcast Helpers ============

/**
 * Broadcast an event to ALL connected clients.
 * @param {string} event Event type name
 * @param {object} data Payload
 */
function broadcast(event, data) {
  const payload = JSON.stringify({ type: event, data, timestamp: Date.now() });
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
}

/**
 * Broadcast an event only to clients subscribed to a specific game.
 * @param {string} gameId
 * @param {string} event Event type name
 * @param {object} data Payload
 */
function broadcastToGame(gameId, event, data) {
  const subs = gameSubscriptions.get(String(gameId));
  if (!subs || subs.size === 0) return;

  const payload = JSON.stringify({
    type: event,
    gameId,
    data,
    timestamp: Date.now(),
  });

  for (const ws of subs) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
}

/**
 * Get current connection stats.
 * @returns {{totalClients: number, totalSubscriptions: number}}
 */
function getStats() {
  let totalSubscriptions = 0;
  for (const [, subs] of gameSubscriptions) {
    totalSubscriptions += subs.size;
  }
  return { totalClients: clients.size, totalSubscriptions };
}

module.exports = {
  createWSS,
  broadcast,
  broadcastToGame,
  getStats,
};
