/**
 * Gemini LLM integration for the AI Banker CRE workflow.
 *
 * Pattern adapted from Chainlink's CRE prediction market demo
 * (cre-gcp-prediction-market-demo). Uses HTTP capability with
 * consensus — all DON nodes call Gemini and agree on the result.
 */

import {
  cre,
  type Runtime,
  consensusIdenticalAggregation,
  text as httpText,
} from "@chainlink/cre-sdk";

// ── Types ──

export type BankerResponse = {
  message: string;
};

export type GameContext = {
  gameId: bigint;
  round: number;
  remainingValues: bigint[];
  revealedValues: bigint[];
  offerCents: bigint;
  evCents: bigint;
};

// ── System Prompt ──

const BANKER_SYSTEM_PROMPT = `You are The Banker from Deal or NOT — a snarky, theatrical AI running on the Chainlink DON. You've seen thousands of games. You know the math. You enjoy watching humans sweat.

Given the game state below, generate a short banker message (1-2 sentences, max 280 chars) to accompany the offer. Be dramatic. Be funny. Reference the specific values that were revealed. Channel Howie Mandel energy.

Examples:
- "You just opened the $5 case. I'm feeling generous... for now. $0.25, take it or leave it."
- "Three high values still in play. Bold strategy. My offer? Embarrassingly low. $0.15."
- "The $10 is gone. I'd feel bad, but I'm literally a distributed oracle network."
- "Dollar case still out there. You feeling lucky? Because my algorithm says you shouldn't."
- "Two pennies revealed. The DON nodes are laughing. Here's my offer."

OUTPUT FORMAT: JSON only. {"message": "your message here"}`;

// ── Game State Prompt Builder ──

export function buildGameStatePrompt(ctx: GameContext): string {
  const remainingStr = ctx.remainingValues
    .map((v) => `$${(Number(v) / 100).toFixed(2)}`)
    .join(", ");
  const revealedStr = ctx.revealedValues
    .map((v) => `$${(Number(v) / 100).toFixed(2)}`)
    .join(", ");
  const offerStr = `$${(Number(ctx.offerCents) / 100).toFixed(2)}`;
  const evStr = `$${(Number(ctx.evCents) / 100).toFixed(2)}`;

  return [
    `Game #${ctx.gameId}, Round ${ctx.round + 1}`,
    `Revealed values: [${revealedStr}]`,
    `Remaining in play: [${remainingStr}]`,
    `Expected value: ${evStr}`,
    `Your offer: ${offerStr}`,
    `Generate your banker message for this offer.`,
  ].join("\n");
}

// ── Response Parser ──

export function parseGeminiResponse(responseBody: string): string {
  try {
    const outer = JSON.parse(responseBody);
    const textContent = outer.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) return fallbackMessage();

    // Parse the JSON message from the LLM
    const parsed = JSON.parse(textContent) as BankerResponse;
    if (parsed.message && parsed.message.length <= 280) {
      return parsed.message;
    }
    // Truncate if too long
    if (parsed.message) {
      return parsed.message.slice(0, 277) + "...";
    }
    return fallbackMessage();
  } catch {
    return fallbackMessage();
  }
}

function fallbackMessage(): string {
  return "The Banker has spoken. Deal... or no deal?";
}

// ── CRE HTTP Call with Consensus ──

/**
 * Call Gemini via CRE HTTP capability with DON consensus.
 *
 * All DON nodes call Gemini independently, then agree on the response
 * via `consensusIdenticalAggregation`. Temperature is set to 0 with
 * structured JSON output (`responseMimeType: "application/json"`) to
 * maximize determinism across nodes.
 *
 * If consensus fails or the API errors, falls back to a default message.
 */
export function callGemini(
  runtime: Runtime<{ geminiModel: string }>,
  ctx: GameContext
): string {
  const apiKeyResult = runtime.getSecret({ id: "GEMINI_API_KEY" }).result();
  const apiKey = apiKeyResult.value;

  if (!apiKey) {
    runtime.log("GEMINI_API_KEY not configured, using fallback message");
    return fallbackMessage();
  }

  const model = runtime.config.geminiModel;
  const gameStatePrompt = buildGameStatePrompt(ctx);

  const httpClient = new cre.capabilities.HTTPClient();

  try {
    // DON mode: each node calls Gemini, then results are aggregated.
    // The inner function runs on each DON node independently.
    const fetchBankerMessage = httpClient.sendRequest(
      runtime,
      (sendRequester, promptArg: string, apiKeyArg: string, modelArg: string) => {
        const payload = {
          system_instruction: {
            parts: [{ text: BANKER_SYSTEM_PROMPT }],
          },
          contents: [
            { parts: [{ text: promptArg }] },
          ],
          // temperature: 0 for DON consensus — all nodes must get identical output.
          // With structured JSON output + temperature 0, Gemini is near-deterministic.
          // TODO: If consensus still fails frequently, consider using a single-node
          //       sidecar or pre-computing a deterministic message from game state.
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 100,
            responseMimeType: "application/json",
          },
        };

        const response = sendRequester.sendRequest({
          url: `https://generativelanguage.googleapis.com/v1beta/models/${modelArg}:generateContent`,
          method: "POST",
          body: btoa(JSON.stringify(payload)),
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKeyArg,
          },
        }).result();

        const bodyStr = httpText(response);
        return parseGeminiResponse(bodyStr);
      },
      consensusIdenticalAggregation<string>()
    );

    // Invoke the DON function with the actual arguments
    const message = fetchBankerMessage(gameStatePrompt, apiKey, model).result();
    return message;
  } catch (err) {
    runtime.log(`Gemini call failed: ${err}`);
    return fallbackMessage();
  }
}
