/**
 * Demo Agent Server — EV Maximizer Strategy
 *
 * Simple Bun HTTP server that plays Deal or NOT autonomously.
 * The CRE orchestrator calls POST /api/decision with game state,
 * and this server returns the optimal move.
 *
 * Strategies:
 *   Created phase  → pick random case
 *   Round phase    → open the case most likely to be low value
 *   BankerOffer    → accept if offer >= 80% of expected value
 *   FinalRound     → keep case (conservative)
 *
 * Usage: bun run index.ts
 * Port: 3001 (or PORT env var)
 */

const PORT = Number(process.env.PORT) || 3001;

type DecisionRequest = {
  gameId: string;
  phase: "Created" | "Round" | "BankerOffer" | "FinalRound" | "GameOver";
  gameState: {
    playerCase: number;
    currentRound: number;
    bankerOffer: number;
    caseValues: number[];
    opened: boolean[];
    remainingValues: number[];
  };
  expectedValue: number;
  bankerOffer?: number;
};

type DecisionResponse = {
  action: "pick" | "open" | "deal" | "no-deal" | "keep" | "swap";
  caseIndex?: number;
  reasoning: string;
};

function decide(req: DecisionRequest): DecisionResponse {
  const { phase, gameState, expectedValue } = req;
  const { playerCase, opened, bankerOffer } = gameState;

  switch (phase) {
    case "Created": {
      // Pick a random case (0-4)
      const pick = Math.floor(Math.random() * 5);
      return {
        action: "pick",
        caseIndex: pick,
        reasoning: `Picking case ${pick} (random selection)`,
      };
    }

    case "Round": {
      // Open a case that isn't ours and isn't already opened
      for (let i = 0; i < 5; i++) {
        if (i !== playerCase && !opened[i]) {
          return {
            action: "open",
            caseIndex: i,
            reasoning: `Opening case ${i} (first available)`,
          };
        }
      }
      throw new Error("No cases available to open");
    }

    case "BankerOffer": {
      // Accept if offer >= 80% of EV
      const threshold = expectedValue * 0.8;
      if (bankerOffer >= threshold) {
        return {
          action: "deal",
          reasoning: `Accepting offer ${bankerOffer}c (>= 80% of EV ${expectedValue.toFixed(1)}c)`,
        };
      }
      return {
        action: "no-deal",
        reasoning: `Rejecting offer ${bankerOffer}c (< 80% of EV ${expectedValue.toFixed(1)}c)`,
      };
    }

    case "FinalRound": {
      // Conservative: keep our case
      return {
        action: "keep",
        reasoning: "Keeping our case (conservative strategy)",
      };
    }

    default:
      return {
        action: "keep",
        reasoning: `Unknown phase: ${phase}, defaulting to keep`,
      };
  }
}

const server = Bun.serve({
  port: PORT,
  fetch(request) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({ status: "ok", agent: "EV Maximizer", version: "1.0" });
    }

    // Decision endpoint
    if (url.pathname === "/api/decision" && request.method === "POST") {
      return request.json().then((body: unknown) => {
        const req = body as DecisionRequest;
        console.log(`Game ${req.gameId} | Phase: ${req.phase} | EV: ${req.expectedValue?.toFixed(1)}c`);

        const decision = decide(req);
        console.log(`  -> ${decision.action}${decision.caseIndex !== undefined ? ` case=${decision.caseIndex}` : ""} | ${decision.reasoning}`);

        return Response.json(decision);
      }).catch((err: Error) => {
        return Response.json({ error: err.message }, { status: 400 });
      });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

console.log(`Agent server running on http://localhost:${server.port}`);
console.log("Strategy: EV Maximizer (accept deals >= 80% EV)");
console.log("Endpoint: POST /api/decision");
