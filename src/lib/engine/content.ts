import { aiGenerate } from "./ai";
import type { Sql } from "./db";
import { SITE_URL } from "@/lib/site";

/**
 * Content engine: topic selection → AI drafting → QC → publish.
 * Fact discipline: any claim about this site (pricing/models/features) may
 * only come from the factsheet built from the live catalog; external facts
 * must be hedged. Drafts failing QC are discarded, never published.
 */

// Evergreen topic library (seeded on first run)
export const EVERGREEN_TOPICS: { topic: string; keywords: string[] }[] = [
  { topic: "DeepSeek V3.2 API pricing explained: what a million tokens really costs", keywords: ["deepseek api pricing", "deepseek v3.2"] },
  { topic: "Migrating from OpenAI to open-source models: a practical checklist", keywords: ["openai alternative", "openai compatible api"] },
  { topic: "GLM-4.6 vs DeepSeek V3.2: which open model fits your workload", keywords: ["glm-4.6", "deepseek comparison"] },
  { topic: "How usage-based LLM billing works: tokens, ledgers and 402s", keywords: ["llm billing", "usage based pricing"] },
  { topic: "Streaming chat completions correctly: SSE, usage chunks and retries", keywords: ["streaming llm api", "sse chat completions"] },
  { topic: "Prompt caching and cost engineering for long-context apps", keywords: ["prompt caching", "llm cost optimization"] },
  { topic: "Qwen3 for coding agents: latency, quality and price", keywords: ["qwen3", "coding agent model"] },
  { topic: "Choosing context window size: when 128K is worth paying for", keywords: ["context window", "long context llm"] },
  { topic: "Self-serve API keys done right: rotation, budgets and rate limits", keywords: ["api key management", "llm api security"] },
  { topic: "Open-source model licenses (MIT, Apache) for commercial API resale", keywords: ["llm license", "open source commercial use"] },
  { topic: "SillyTavern and roleplay frontends: connecting a custom OpenAI-compatible endpoint", keywords: ["sillytavern api", "custom endpoint"] },
  { topic: "Cline, Roo and Kilo: pointing coding agents at cheaper open models", keywords: ["cline provider", "coding agent api"] },
  { topic: "Token economics 101: why output tokens cost more than input", keywords: ["token pricing", "inference economics"] },
  { topic: "Benchmarking TTFT and throughput for LLM APIs: a reproducible setup", keywords: ["llm benchmark", "ttft"] },
  { topic: "Building a budget guardrail: hard caps for LLM spend in production", keywords: ["llm budget", "spend control"] },
  { topic: "Multi-model routing: fallbacks and degradation chains that actually work", keywords: ["model routing", "llm fallback"] },
  { topic: "From prototype to production: hardening an LLM API integration", keywords: ["llm production", "api integration"] },
  { topic: "Why prepaid credits beat postpaid invoices for indie developers", keywords: ["prepaid api", "developer billing"] },
  { topic: "OpenAI SDK tricks: base_url, custom headers and streaming edge cases", keywords: ["openai sdk", "base url"] },
  { topic: "The real cost of GPT-4-class quality in 2026: open models close the gap", keywords: ["gpt-4 alternative", "open model quality"] },
  { topic: "Handling 402 and 429 gracefully: client-side patterns for metered APIs", keywords: ["rate limit handling", "api error handling"] },
  { topic: "JSON mode and structured output across open models", keywords: ["json mode", "structured output"] },
  { topic: "Embeddings on a budget: open alternatives and when quality matters", keywords: ["embeddings api", "cheap embeddings"] },
  { topic: "LLM API latency from Asia: routing, PoPs and what to measure", keywords: ["llm latency", "api routing asia"] },
  { topic: "Agentic workloads and token burn: estimating monthly spend", keywords: ["agent token usage", "llm spend estimate"] },
  { topic: "Fine-tune or prompt-engineer? A cost decision framework", keywords: ["fine tuning cost", "prompt engineering"] },
  { topic: "Zero data retention APIs: what it means and how to verify", keywords: ["zero data retention", "llm privacy"] },
  { topic: "Comparing tokenizers: why the same text costs different tokens", keywords: ["tokenizer comparison", "token count"] },
  { topic: "Weekend project: a Telegram bot on open-model APIs for cents", keywords: ["telegram bot llm", "cheap ai bot"] },
  { topic: "Reading model cards critically: context, quantization and eval claims", keywords: ["model card", "quantization"] },
];

export async function seedTopics(sql: Sql) {
  for (const t of EVERGREEN_TOPICS) {
    await sql`
      INSERT INTO engine.topics (topic, keywords)
      VALUES (${t.topic}, ${t.keywords})
      ON CONFLICT (topic) DO NOTHING`;
  }
}

export type CatalogModel = {
  slug: string;
  display_name: string;
  input_price_per_m: string;
  output_price_per_m: string;
  context_length: number;
};

/** Live model catalog from the sales database (public schema, Drizzle-managed). */
export async function catalogModels(sql: Sql): Promise<CatalogModel[]> {
  try {
    const rows = await sql`
      SELECT slug, display_name, input_price_per_m, output_price_per_m,
             context_length
      FROM models WHERE active = TRUE ORDER BY slug`;
    return rows as CatalogModel[];
  } catch {
    return [];
  }
}

/** Site factsheet — the ONLY permitted source of claims about this site. */
async function factsheet(sql: Sql): Promise<string> {
  const models = await catalogModels(sql);
  return [
    `Site: TokShop (${SITE_URL}) — OpenAI-compatible pay-as-you-go API.`,
    `Base URL: ${SITE_URL}/v1 (works with any OpenAI SDK).`,
    `Signup: ${SITE_URL}/register (email + password) → create API keys in the dashboard.`,
    `API keys look like sk-tok-... and are shown once at creation.`,
    `Models and USD prices per million tokens:`,
    ...models.map(
      (m) =>
        `- ${m.display_name} (${m.slug}): input $${Number(m.input_price_per_m)}, output $${Number(m.output_price_per_m)}, context ${m.context_length} tokens`
    ),
    `Billing: prepaid USD credits; HTTP 402 insufficient_balance when empty.`,
    `Usage: every call logged with token counts and exact USD cost.`,
  ].join("\n");
}

// QC: banned claims (hype/guarantees) + length + structure
const BANNED_PATTERNS = [
  /guaranteed (returns|profit|income)/i,
  /risk[- ]free/i,
  /get rich/i,
  /100% (accurate|uptime|safe)/i,
  /best .{0,20} in the world/i,
  /#1 (provider|api) (in|on)/i,
];

export type ArticleQc = {
  pass: boolean;
  issues: string[];
  wordCount: number;
};

export function qcArticle(md: string, title: string): ArticleQc {
  const issues: string[] = [];
  const wordCount = md.split(/\s+/).length;
  if (title.length > 68) issues.push(`title too long: ${title.length} chars (>68)`);
  if (wordCount < 500) issues.push(`too short: ${wordCount} words (<500)`);
  if (wordCount > 3500) issues.push(`too long: ${wordCount} words (>3500)`);
  for (const re of BANNED_PATTERNS) {
    const m = md.match(re) || title.match(re);
    if (m) issues.push(`banned claim: "${m[0]}"`);
  }
  if (!/^##\s/m.test(md)) issues.push("no H2 sections");
  if ((md.match(/\]\(/g) || []).length < 1) issues.push("no links at all");
  return { pass: issues.length === 0, issues, wordCount };
}

const WRITER_SYSTEM = `You are the staff writer for TokShop, a developer-facing
storefront for open-source LLM APIs. Write a genuinely useful, technically
accurate article in English Markdown for the given topic.

Hard rules:
1. FACTS ABOUT TOKSHOP: you may ONLY use data from the provided factsheet.
   Never invent prices, models, SLAs or features.
2. EXTERNAL FACTS: be conservative. If uncertain, say "as of recent reports"
   or omit. Never fabricate benchmark numbers or quotes.
3. No hype, no guarantees, no "best in the world" claims. Honest trade-offs.
4. Structure: short intro (no H1 - it is added separately), 3-6 H2 sections,
   practical code snippets where helpful (curl / Python), a short conclusion.
5. 700-1500 words. Include 1-2 natural internal links to ${SITE_URL}/pricing
   or ${SITE_URL}/docs where genuinely relevant.
6. If the topic came from a trending keyword, address the actual search intent
   of that keyword first, then connect to open-model APIs only if natural.

OUTPUT FORMAT — exactly this header block, then a line with only "---", then
the Markdown body. No other wrapper, no code fence around the whole output:
TITLE: <headline, max 62 chars>
SLUG: <kebab-case-slug>
DESCRIPTION: <meta description, 140-160 chars>
KEYWORDS: <comma, separated, 3-6 keywords>
---
<markdown body>`;

/** Parse front-matter style output (far more robust than JSON for long texts). */
export function parseDraft(text: string): {
  title: string;
  slug: string;
  description: string;
  keywords: string[];
  body_md: string;
} {
  const cleaned = text.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "");
  const sep = cleaned.indexOf("\n---");
  if (sep < 0) throw new Error(`no --- separator; head=${cleaned.slice(0, 120)}`);
  const head = cleaned.slice(0, sep);
  const body = cleaned.slice(sep).replace(/^\n---+\s*\n?/, "").trim();
  const pick = (k: string) =>
    head.match(new RegExp(`^${k}:\\s*(.+)$`, "mi"))?.[1]?.trim() ?? "";
  return {
    title: pick("TITLE"),
    slug: pick("SLUG"),
    description: pick("DESCRIPTION"),
    keywords: pick("KEYWORDS").split(",").map((s) => s.trim()).filter(Boolean),
    body_md: body,
  };
}

/** Cut at a word boundary and drop dangling punctuation/connectives. */
export function shortenTitle(title: string, max: number): string {
  if (title.length <= max) return title;
  let cut = title.slice(0, max + 1);
  cut = cut.slice(0, cut.lastIndexOf(" "));
  cut = cut.replace(/[\s:;,\-–—]+$/g, "");
  cut = cut.replace(/\s+(and|or|for|with|the|a|an|to|of|in|on|vs\.?)$/i, "");
  return cut;
}

export async function generateArticle(
  sql: Sql,
  source: { kind: "trend"; id: number; keyword: string; context: string } |
          { kind: "evergreen"; id: number; topic: string; keywords: string[] }
): Promise<{
  ok: boolean;
  slug?: string;
  title?: string;
  qc?: ArticleQc;
  model?: string;
  reason?: string;
}> {
  const facts = await factsheet(sql);
  const prompt =
    source.kind === "trend"
      ? `TOPIC (from a currently trending Google search): "${source.keyword}"
News context: ${source.context}
FACTSHEET:\n${facts}`
      : `TOPIC (evergreen): "${source.topic}"
Target keywords: ${source.keywords.join(", ")}
FACTSHEET:\n${facts}`;

  const { text, model } = await aiGenerate({
    system: WRITER_SYSTEM,
    prompt,
    maxOutputTokens: 6000,
    temperature: 0.65,
  });
  const draft = parseDraft(text);

  const slug = String(draft.slug || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!slug || !draft.title || !draft.body_md)
    return { ok: false, reason: "draft missing title/slug/body" };

  // Models occasionally overshoot the title budget; shorten at a word
  // boundary instead of discarding an otherwise good draft.
  if (draft.title.length > 68) draft.title = shortenTitle(draft.title, 68);

  const qc = qcArticle(draft.body_md, draft.title);
  if (!qc.pass) return { ok: false, qc, reason: `qc failed: ${qc.issues.join("; ")}` };

  const dup = await sql`
    SELECT 1 FROM engine.articles WHERE slug = ${slug} LIMIT 1`;
  if (dup.length) return { ok: false, reason: `slug exists: ${slug}` };

  await sql`
    INSERT INTO engine.articles
      (slug, title, description, body_md, keywords, source, trend_id, qc_report, model)
    VALUES (${slug}, ${draft.title}, ${draft.description || ""}, ${draft.body_md},
            ${(draft.keywords || []).slice(0, 8)},
            ${source.kind}, ${source.kind === "trend" ? source.id : null},
            ${JSON.stringify(qc)}::jsonb, ${model})`;

  if (source.kind === "trend") {
    await sql`UPDATE engine.trends SET status = 'used' WHERE id = ${source.id}`;
  } else {
    await sql`
      UPDATE engine.topics
      SET used_count = used_count + 1, last_used_at = now()
      WHERE id = ${source.id}`;
  }
  return { ok: true, slug, title: draft.title, qc, model };
}

/** IndexNow push (shared endpoint for Bing/Yandex/Seznam/Naver). */
export async function pushIndexNow(
  urls: string[]
): Promise<{ ok: boolean; status: number; detail: string }> {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return { ok: false, status: 0, detail: "INDEXNOW_KEY not configured" };
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: new URL(SITE_URL).host,
      key,
      keyLocation: `${SITE_URL}/${key}.txt`,
      urlList: urls,
    }),
  });
  return {
    ok: res.ok,
    status: res.status,
    detail: res.ok ? "" : (await res.text().catch(() => "")).slice(0, 160),
  };
}

/** WebSub: broadcast RSS updates to the public hub (no token needed). */
export async function pushWebSub(): Promise<{ ok: boolean; status: number }> {
  const res = await fetch("https://pubsubhubbub.appspot.com/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      "hub.mode": "publish",
      "hub.url": `${SITE_URL}/rss.xml`,
    }),
  });
  return { ok: res.ok, status: res.status };
}
