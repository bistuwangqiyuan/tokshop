// Seeds the model catalog. Prices are retail USD per 1M tokens.
// If AI_GATEWAY_API_KEY is set, upstream model availability is verified against
// the Vercel AI Gateway /v1/models endpoint and gateway pricing (if exposed)
// is used as the cost base with a 1.5x retail markup.
import { neon } from "@neondatabase/serverless";

const MARKUP = 1.5;

// Fallback cost base (USD per 1M tokens) if gateway pricing is unavailable.
const CANDIDATES = [
  {
    slug: "deepseek-v3.2",
    match: /^deepseek\/deepseek-v3\.?2/i,
    displayName: "DeepSeek V3.2",
    baseInput: 0.28,
    baseOutput: 0.42,
    contextLength: 128000,
  },
  {
    slug: "glm-4.6",
    match: /^zai\/glm-4\.6/i,
    displayName: "GLM 4.6",
    baseInput: 0.6,
    baseOutput: 2.2,
    contextLength: 200000,
  },
  {
    slug: "kimi-k2",
    match: /^moonshotai\/kimi-k2(?!.*thinking)/i,
    displayName: "Kimi K2",
    baseInput: 0.6,
    baseOutput: 2.5,
    contextLength: 128000,
  },
  {
    slug: "qwen3-coder",
    match: /^alibaba\/qwen-?3[.-]?coder/i,
    displayName: "Qwen3 Coder",
    baseInput: 0.4,
    baseOutput: 1.6,
    contextLength: 128000,
  },
];

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");
  const sql = neon(dbUrl);

  let gatewayModels = [];
  const gwKey = process.env.AI_GATEWAY_API_KEY;
  if (gwKey) {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      headers: { Authorization: `Bearer ${gwKey}` },
    });
    if (res.ok) {
      const data = await res.json();
      gatewayModels = data.data ?? [];
      console.log(`Gateway lists ${gatewayModels.length} models`);
    } else {
      console.warn(`Gateway /models returned ${res.status}; using fallbacks`);
    }
  } else {
    console.warn("AI_GATEWAY_API_KEY not set; seeding without verification");
  }

  for (const c of CANDIDATES) {
    let upstreamId = null;
    let baseInput = c.baseInput;
    let baseOutput = c.baseOutput;
    let contextLength = c.contextLength;

    if (gatewayModels.length > 0) {
      const hit = gatewayModels.find((m) => c.match.test(m.id));
      if (!hit) {
        console.warn(`No gateway model matches ${c.slug}; skipping`);
        continue;
      }
      upstreamId = hit.id;
      const p = hit.pricing;
      if (p?.input != null && p?.output != null) {
        // gateway pricing is USD per single token
        baseInput = Number(p.input) * 1_000_000;
        baseOutput = Number(p.output) * 1_000_000;
      }
      if (hit.context_window) contextLength = hit.context_window;
    } else {
      // unverified fallback upstream ids
      const fallbackIds = {
        "deepseek-v3.2": "deepseek/deepseek-v3.2",
        "glm-4.6": "zai/glm-4.6",
        "kimi-k2": "moonshotai/kimi-k2",
        "qwen3-coder": "alibaba/qwen3-coder",
      };
      upstreamId = fallbackIds[c.slug];
    }

    const inputPrice = (baseInput * MARKUP).toFixed(4);
    const outputPrice = (baseOutput * MARKUP).toFixed(4);

    await sql`
      INSERT INTO models (slug, upstream_id, display_name, input_price_per_m, output_price_per_m, context_length, active)
      VALUES (${c.slug}, ${upstreamId}, ${c.displayName}, ${inputPrice}, ${outputPrice}, ${contextLength}, true)
      ON CONFLICT (slug) DO UPDATE SET
        upstream_id = EXCLUDED.upstream_id,
        display_name = EXCLUDED.display_name,
        input_price_per_m = EXCLUDED.input_price_per_m,
        output_price_per_m = EXCLUDED.output_price_per_m,
        context_length = EXCLUDED.context_length,
        active = true
    `;
    console.log(
      `Seeded ${c.slug} -> ${upstreamId} @ $${inputPrice}/$${outputPrice} per 1M`
    );
  }

  const rows = await sql`SELECT slug, upstream_id, input_price_per_m, output_price_per_m FROM models ORDER BY slug`;
  console.table(rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
