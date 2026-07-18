import { aiGenerate, extractJson } from "./ai";
import type { Sql } from "./db";

/**
 * Google Trends keyword tracking.
 * Source: official Trending RSS (https://trends.google.com/trending/rss?geo=XX)
 * with keyword, approx search traffic and related news headlines.
 * Discipline: every keyword must pass AI topical relevance filtering
 * (site topics: AI/LLM/API/developer tools/cloud & compute). Irrelevant
 * keywords are marked and never used — no unrelated trend-chasing.
 */

export const TREND_GEOS = ["US", "GB", "IN", "SG", "CA", "AU", "DE"];

export type TrendItem = {
  keyword: string;
  geo: string;
  approxTraffic: string;
  news: { title: string; url: string; source: string }[];
};

function pick(tagContent: string, tag: string): string {
  const m = tagContent.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return (m?.[1] ?? "").trim();
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Parse the Trends RSS for one geo. */
export async function fetchTrendsRss(geo: string): Promise<TrendItem[]> {
  const r = await fetch(`https://trends.google.com/trending/rss?geo=${geo}`, {
    headers: { "User-Agent": "Mozilla/5.0 (tokshop-trends-bot)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`trends rss ${geo}: HTTP ${r.status}`);
  const xml = await r.text();
  const items: TrendItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const keyword = decode(pick(it, "title"));
    if (!keyword) continue;
    const news: TrendItem["news"] = [];
    for (const n of it.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/g)) {
      news.push({
        title: decode(pick(n[1], "ht:news_item_title")),
        url: decode(pick(n[1], "ht:news_item_url")),
        source: decode(pick(n[1], "ht:news_item_source")),
      });
    }
    items.push({
      keyword,
      geo,
      approxTraffic: decode(pick(it, "ht:approx_traffic")),
      news: news.slice(0, 3),
    });
  }
  return items;
}

/** Upsert with dedupe: insert new keywords, refresh last_seen/traffic for known ones. */
export async function upsertTrends(
  sql: Sql,
  items: TrendItem[]
): Promise<{ inserted: number; keywords: string[] }> {
  let inserted = 0;
  const fresh: string[] = [];
  for (const t of items) {
    const rows = await sql`
      INSERT INTO engine.trends (keyword, geo, approx_traffic, news_context)
      VALUES (${t.keyword}, ${t.geo}, ${t.approxTraffic},
              ${JSON.stringify(t.news)}::jsonb)
      ON CONFLICT (keyword, geo) DO UPDATE
        SET last_seen = now(),
            approx_traffic = EXCLUDED.approx_traffic
      RETURNING (xmax = 0) AS is_new`;
    if (rows[0]?.is_new) {
      inserted++;
      fresh.push(t.keyword);
    }
  }
  return { inserted, keywords: fresh };
}

const RELEVANCE_SYSTEM = `You are a strict topical relevance judge for TokShop,
a developer-facing storefront selling pay-as-you-go API access to open-source
LLMs (DeepSeek, GLM, Qwen, Kimi; OpenAI-compatible endpoints; token pricing; AI
infrastructure). Score how relevant a trending search keyword is to this site's
topics: AI/LLM models and vendors, AI APIs and developer tools, AI coding
agents, cloud/GPU/compute, token pricing and inference economics, major tech
platform news that directly affects AI developers.

Rules:
- Sports, entertainment, celebrities, weather, politics, crime, lottery,
  consumer shopping etc. are IRRELEVANT (score <= 0.2) even if hugely popular.
- Only score >= 0.7 when a genuinely useful developer-facing article could be
  written that serves searchers of this keyword AND fits the site's topic.
Return strict JSON array only, no prose. Keep each reason under 8 words:
[{"keyword": "...", "score": 0.0, "reason": "..."}]`;

/** AI relevance scoring for status='new' keywords (small batches to avoid truncation). */
export async function scoreNewTrends(
  sql: Sql,
  batch = 15
): Promise<{ scored: number; relevant: number }> {
  const rows = await sql`
    SELECT id, keyword, geo, news_context
    FROM engine.trends WHERE status = 'new' AND relevance IS NULL
    ORDER BY id DESC LIMIT ${batch}`;
  if (!rows.length) return { scored: 0, relevant: 0 };

  const payload = rows.map((r) => ({
    keyword: r.keyword,
    context: (r.news_context as { title: string }[] | null)
      ?.map((n) => n.title)
      .slice(0, 2),
  }));
  const { text } = await aiGenerate({
    system: RELEVANCE_SYSTEM,
    prompt: JSON.stringify(payload),
    maxOutputTokens: 3000,
    temperature: 0.1,
  });
  const scores = extractJson<{ keyword: string; score: number; reason: string }[]>(text);
  const byKw = new Map(scores.map((s) => [s.keyword.toLowerCase(), s]));

  let relevant = 0;
  for (const r of rows) {
    const s = byKw.get(String(r.keyword).toLowerCase());
    const score = typeof s?.score === "number" ? Math.max(0, Math.min(1, s.score)) : 0;
    const status = score >= 0.7 ? "relevant" : "irrelevant";
    if (status === "relevant") relevant++;
    await sql`
      UPDATE engine.trends
      SET relevance = ${score}, relevance_reason = ${s?.reason ?? "no judgment returned"},
          status = ${status}
      WHERE id = ${r.id}`;
  }
  return { scored: rows.length, relevant };
}
