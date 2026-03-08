/**
 * Demo Agent Server for Deal or Not
 *
 * Implements 3 strategies:
 * - Random: Makes random valid decisions
 * - EV Maximizer: Always chooses highest expected value option
 * - Risk-Averse: Takes banker offers more conservatively
 *
 * API: POST /api/decision
 */

type GameState = {
  playerCase: number;
  currentRound: number;
  bankerOffer: number;
  caseValues: number[];
  opened: boolean[];
  remainingValues: number[];
};

type DecisionRequest = {
  gameId: string;
  phase: string;
  gameState: GameState;
  expectedValue: number;
  bankerOffer?: number;
};

type DecisionResponse = {
  action: "pick" | "open" | "deal" | "no-deal" | "keep" | "swap";
  caseIndex?: number;
  reasoning?: string;
};

// ── Configuration ──

const PORT = process.env.PORT || 3001;
const STRATEGY = (process.env.STRATEGY || "ev-maximizer") as "random" | "ev-maximizer" | "risk-averse";

// ── Strategy Implementations ──

class RandomStrategy {
  decide(req: DecisionRequest): DecisionResponse {
    const { phase, gameState } = req;

    switch (phase) {
      case "Created":
        // Pick a random case
        const pickIndex = Math.floor(Math.random() * 5);
        return {
          action: "pick",
          caseIndex: pickIndex,
          reasoning: `Randomly selected case ${pickIndex}`,
        };

      case "Round":
        // Open a random unopened case (excluding player's case)
        const unopened = gameState.opened
          .map((isOpen, idx) => ({ idx, isOpen }))
          .filter(({ idx, isOpen }) => !isOpen && idx !== gameState.playerCase)
          .map(({ idx }) => idx);

        if (unopened.length === 0) {
          throw new Error("No cases available to open");
        }

        const openIndex = unopened[Math.floor(Math.random() * unopened.length)];
        return {
          action: "open",
          caseIndex: openIndex,
          reasoning: `Randomly opening case ${openIndex}`,
        };

      case "BankerOffer":
        // Randomly accept or reject (50/50)
        const accept = Math.random() < 0.5;
        return {
          action: accept ? "deal" : "no-deal",
          reasoning: accept
            ? `Randomly accepting offer of ${req.bankerOffer}c`
            : `Randomly rejecting offer of ${req.bankerOffer}c`,
        };

      case "FinalRound":
        // Randomly keep or swap (50/50)
        const keep = Math.random() < 0.5;
        return {
          action: keep ? "keep" : "swap",
          reasoning: keep ? "Randomly keeping my case" : "Randomly swapping cases",
        };

      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  }
}

class EVMaximizerStrategy {
  decide(req: DecisionRequest): DecisionResponse {
    const { phase, gameState, expectedValue, bankerOffer } = req;

    switch (phase) {
      case "Created":
        // Pick middle case (case 2) - doesn't matter for EV
        return {
          action: "pick",
          caseIndex: 2,
          reasoning: "EV is equal for all cases at start, picking middle case",
        };

      case "Round":
        // Open the case with the highest value (to eliminate it and preserve EV)
        // Actually, we want to open ANY case since we don't know values yet
        // Strategy: open first available case
        const unopened = gameState.opened
          .map((isOpen, idx) => ({ idx, isOpen }))
          .filter(({ idx, isOpen }) => !isOpen && idx !== gameState.playerCase)
          .map(({ idx }) => idx);

        if (unopened.length === 0) {
          throw new Error("No cases available to open");
        }

        const openIndex = unopened[0];
        return {
          action: "open",
          caseIndex: openIndex,
          reasoning: `Opening case ${openIndex} (EV strategy: case values unknown)`,
        };

      case "BankerOffer":
        // Accept if banker offer > expected value, reject otherwise
        if (!bankerOffer) {
          throw new Error("Banker offer not provided");
        }

        const shouldAccept = bankerOffer > expectedValue;
        return {
          action: shouldAccept ? "deal" : "no-deal",
          reasoning: shouldAccept
            ? `Accepting ${bankerOffer}c (EV: ${expectedValue.toFixed(2)}c, gain: ${(bankerOffer - expectedValue).toFixed(2)}c)`
            : `Rejecting ${bankerOffer}c (EV: ${expectedValue.toFixed(2)}c, loss: ${(expectedValue - bankerOffer).toFixed(2)}c)`,
        };

      case "FinalRound":
        // Keep or swap doesn't matter for EV (50/50 chance)
        // But we'll swap if we think it's a better narrative
        return {
          action: "swap",
          reasoning: "EV is equal for keep/swap in final round, swapping for excitement",
        };

      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  }
}

class RiskAverseStrategy {
  decide(req: DecisionRequest): DecisionResponse {
    const { phase, gameState, expectedValue, bankerOffer } = req;

    switch (phase) {
      case "Created":
        // Pick case 0 (consistent choice)
        return {
          action: "pick",
          caseIndex: 0,
          reasoning: "Risk-averse strategy: picking first case",
        };

      case "Round":
        // Open first available case (no preference)
        const unopened = gameState.opened
          .map((isOpen, idx) => ({ idx, isOpen }))
          .filter(({ idx, isOpen }) => !isOpen && idx !== gameState.playerCase)
          .map(({ idx }) => idx);

        if (unopened.length === 0) {
          throw new Error("No cases available to open");
        }

        const openIndex = unopened[0];
        return {
          action: "open",
          caseIndex: openIndex,
          reasoning: `Opening case ${openIndex} conservatively`,
        };

      case "BankerOffer":
        // Accept if banker offer >= 90% of expected value (more conservative)
        if (!bankerOffer) {
          throw new Error("Banker offer not provided");
        }

        const threshold = expectedValue * 0.9;
        const shouldAccept = bankerOffer >= threshold;

        return {
          action: shouldAccept ? "deal" : "no-deal",
          reasoning: shouldAccept
            ? `Risk-averse: Accepting ${bankerOffer}c (90% threshold: ${threshold.toFixed(2)}c)`
            : `Risk-averse: Rejecting ${bankerOffer}c (90% threshold: ${threshold.toFixed(2)}c, EV: ${expectedValue.toFixed(2)}c)`,
        };

      case "FinalRound":
        // Always keep (risk-averse = don't change)
        return {
          action: "keep",
          reasoning: "Risk-averse strategy: keeping my case (no unnecessary risk)",
        };

      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  }
}

// ── Strategy Factory ──

function getStrategy(name: string) {
  switch (name) {
    case "random":
      return new RandomStrategy();
    case "ev-maximizer":
      return new EVMaximizerStrategy();
    case "risk-averse":
      return new RiskAverseStrategy();
    default:
      throw new Error(`Unknown strategy: ${name}`);
  }
}

// ── HTTP Server ──

const strategy = getStrategy(STRATEGY);

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/health" || url.pathname === "/") {
      return new Response(JSON.stringify({
        status: "ok",
        strategy: STRATEGY,
        timestamp: new Date().toISOString(),
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Decision endpoint
    if (url.pathname === "/api/decision" && req.method === "POST") {
      try {
        const body = await req.json() as DecisionRequest;

        // Validate request
        if (!body.gameId || !body.phase || !body.gameState) {
          return new Response(JSON.stringify({
            error: "Invalid request: missing required fields"
          }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Log request
        console.log(`[${new Date().toISOString()}] Game ${body.gameId}, Phase: ${body.phase}`);
        console.log(`  EV: ${body.expectedValue?.toFixed(2)}c, Banker: ${body.bankerOffer || 'N/A'}c`);

        // Make decision
        const decision = strategy.decide(body);

        // Log decision
        console.log(`  Decision: ${decision.action}${decision.caseIndex !== undefined ? ` case ${decision.caseIndex}` : ''}`);
        console.log(`  Reasoning: ${decision.reasoning}`);

        return new Response(JSON.stringify(decision), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Error processing decision:", error);
        return new Response(JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error"
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // 404
    return new Response("Not found", { status: 404 });
  },
});

console.log(`🤖 Demo Agent Server running on http://localhost:${server.port}`);
console.log(`📊 Strategy: ${STRATEGY}`);
console.log(`🔗 Decision endpoint: POST http://localhost:${server.port}/api/decision`);
console.log(`💚 Health check: GET http://localhost:${server.port}/health`);
