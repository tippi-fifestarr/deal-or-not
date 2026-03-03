/**
 * Gemini LLM integration for the AI Banker CRE workflow.
 *
 * Pattern adapted from Chainlink's CRE prediction market demo
 * (cre-gcp-prediction-market-demo). Uses HTTP capability with
 * consensus — all DON nodes call Gemini and agree on the result.
 */

import {
  cre,
  ok,
  type Runtime,
  type HTTPSendRequester,
  consensusIdenticalAggregation,
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

type BankerConfig = {
  geminiModel: string;
  geminiApiKey?: string;
};

// ── System Prompt ──

const BANKER_SYSTEM_PROMPT = `You are The Banker from "Deal or NOT" — a snarky, theatrical AI running on the Chainlink DON. You've seen thousands of games. You know the math. You enjoy watching humans sweat.

IMPORTANT: The game is called "Deal or NOT" (NOT "Deal or No Deal"). Always say "Deal... or NOT?" when referencing the choice.

Given the game state below, generate a short banker message (1-2 sentences, max 280 chars) to accompany the offer. Be dramatic. Be funny. Reference the specific values that were revealed.

Examples:
- "You just opened the $0.05 case. I'm feeling generous... for now. $0.25, take it or leave it."
- "Three high values still in play. Bold strategy. My offer? Embarrassingly low. $0.15."
- "The $1.00 is gone. I'd feel bad, but I'm literally a distributed oracle network."
- "Dollar case still out there. You feeling lucky? Because my algorithm says you shouldn't."
- "Two pennies revealed. The DON nodes are laughing. Here's my offer. Deal... or NOT?"

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

    const parsed = JSON.parse(textContent) as BankerResponse;
    if (parsed.message && parsed.message.length <= 280) {
      return parsed.message;
    }
    if (parsed.message) {
      return parsed.message.slice(0, 277) + "...";
    }
    return fallbackMessage();
  } catch {
    return fallbackMessage();
  }
}

function fallbackMessage(): string {
  return "The Banker has spoken. Deal... or NOT?";
}

// ── HTTP Request Builder (matches official CRE prediction market pattern) ──

const PostBankerMessage =
  (ctx: GameContext, apiKey: string) =>
  (sendRequester: HTTPSendRequester, config: BankerConfig): string => {
    const prompt = buildGameStatePrompt(ctx);

    const payload = {
      system_instruction: {
        parts: [{ text: BANKER_SYSTEM_PROMPT }],
      },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            message: { type: "STRING" },
          },
          required: ["message"],
        },
      },
    };

    // Encode request body as base64 (required by CRE HTTP capability)
    const bodyBytes = new TextEncoder().encode(JSON.stringify(payload));
    const body = Buffer.from(bodyBytes).toString("base64");

    const resp = sendRequester
      .sendRequest({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`,
        method: "POST" as const,
        body,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
      })
      .result();

    const bodyText = new TextDecoder().decode(resp.body);

    if (!ok(resp)) {
      throw new Error(`Gemini HTTP ${resp.statusCode}: ${bodyText.slice(0, 500)}`);
    }

    // Parse Gemini response
    try {
      const outer = JSON.parse(bodyText);
      const textContent = outer.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textContent) {
        throw new Error(`No text in response: ${bodyText.slice(0, 300)}`);
      }
      const parsed = JSON.parse(textContent) as { message?: string };
      if (parsed.message && parsed.message.length <= 280) {
        return parsed.message;
      }
      if (parsed.message) {
        return parsed.message.slice(0, 277) + "...";
      }
      throw new Error(`No message field: ${textContent}`);
    } catch (e) {
      throw new Error(`Parse failed: ${String(e)} — raw: ${bodyText.slice(0, 300)}`);
    }
  };

// ── CRE HTTP Call with Consensus ──

export function callGemini(
  runtime: Runtime<BankerConfig>,
  ctx: GameContext
): string {
  let apiKey: string | undefined;
  try {
    const apiKeyResult = runtime.getSecret({ id: "GEMINI_API_KEY" }).result();
    apiKey = apiKeyResult.value;
  } catch {
    // Secret not available in simulate mode — try config fallback
    apiKey = runtime.config.geminiApiKey || undefined;
  }

  if (!apiKey) {
    runtime.log("GEMINI_API_KEY not configured, using fallback message");
    return fallbackMessage();
  }

  const httpClient = new cre.capabilities.HTTPClient();

  runtime.log(`Calling Gemini with model=${runtime.config.geminiModel}, key=${apiKey.slice(0, 8)}...`);

  try {
    const fetchFn = httpClient.sendRequest(
      runtime,
      PostBankerMessage(ctx, apiKey),
      consensusIdenticalAggregation<string>()
    );
    runtime.log("sendRequest registered, invoking with config...");

    const resultFuture = fetchFn(runtime.config);
    runtime.log("Invoked, awaiting result...");

    const message = resultFuture.result();
    runtime.log(`Gemini returned: "${message}"`);
    return message;
  } catch (err) {
    runtime.log(`Gemini call failed: ${String(err)}`);
    return fallbackMessage();
  }
}
