/**
 * Agent API key authentication middleware with sliding-window rate limiting.
 *
 * Keys are prefixed with `dond_`. In production these would live in a database;
 * here we use an in-memory Map for dev speed.
 */

const { v4: uuidv4 } = require("uuid");

// ============ Key Store ============

/** @type {Map<string, {id: string, label: string, createdAt: number}>} */
const apiKeys = new Map();

// Bootstrap admin key for local development
apiKeys.set("dond_admin_dev_key_12345", {
  id: "admin",
  label: "Dev Admin",
  createdAt: Date.now(),
});

// ============ Rate Limiter ============

/** @type {Map<string, number[]>} sliding window of request timestamps per key */
const requestWindows = new Map();

const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT = 60; // 60 requests per window

/**
 * Check and record a request against the rate limiter.
 * @param {string} key API key
 * @returns {boolean} true if allowed, false if rate-limited
 */
function checkRateLimit(key) {
  const now = Date.now();
  let window = requestWindows.get(key);

  if (!window) {
    window = [];
    requestWindows.set(key, window);
  }

  // Slide: drop entries older than the window
  const cutoff = now - RATE_WINDOW_MS;
  while (window.length > 0 && window[0] < cutoff) {
    window.shift();
  }

  if (window.length >= RATE_LIMIT) {
    return false;
  }

  window.push(now);
  return true;
}

// ============ Middleware ============

/**
 * Express middleware that validates `Authorization: Bearer dond_...` headers
 * and enforces sliding-window rate limiting.
 */
function agentAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Missing or malformed Authorization header",
      hint: "Use: Authorization: Bearer dond_<your_key>",
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token.startsWith("dond_")) {
    return res.status(401).json({
      error: "Invalid API key format",
      hint: "Keys must start with the dond_ prefix",
    });
  }

  const keyData = apiKeys.get(token);
  if (!keyData) {
    return res.status(401).json({ error: "Unknown API key" });
  }

  // Rate limit
  if (!checkRateLimit(token)) {
    const retryAfter = Math.ceil(RATE_WINDOW_MS / 1000);
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: "Rate limit exceeded",
      limit: RATE_LIMIT,
      windowSeconds: RATE_WINDOW_MS / 1000,
      retryAfter,
    });
  }

  // Attach agent identity to the request for downstream handlers
  req.agent = { key: token, ...keyData };
  next();
}

// ============ Key Management ============

/**
 * Create a new API key.
 * @param {string} label Human-readable label for the key
 * @returns {{key: string, id: string, label: string, createdAt: number}}
 */
function createApiKey(label) {
  const id = uuidv4();
  const key = `dond_${id.replace(/-/g, "")}`;
  const record = { id, label, createdAt: Date.now() };
  apiKeys.set(key, record);
  return { key, ...record };
}

/**
 * Look up an API key's metadata.
 * @param {string} key The full dond_... key
 * @returns {{id: string, label: string, createdAt: number} | undefined}
 */
function getApiKey(key) {
  return apiKeys.get(key);
}

/**
 * List all registered keys (for admin use).
 * @returns {Array<{key: string, id: string, label: string, createdAt: number}>}
 */
function listApiKeys() {
  const result = [];
  for (const [key, data] of apiKeys) {
    result.push({ key: `${key.slice(0, 12)}...`, ...data });
  }
  return result;
}

module.exports = {
  agentAuth,
  createApiKey,
  getApiKey,
  listApiKeys,
};
