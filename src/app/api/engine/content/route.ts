import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { verifyCron } from "@/lib/engine/cron";
import { ensureEngineSchema, getEngineSql } from "@/lib/engine/db";
import {
  generateArticle,
  pushIndexNow,
  pushWebSub,
  seedTopics,
} from "@/lib/engine/content";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Content generation (2-hour schedule):
 * topic priority: unused relevant trends (relevance desc) → evergreen library
 * (used_count asc). Generate → QC (discard on failure) → publish /blog →
 * IndexNow + WebSub push.
 */
export async function POST(req: Request) {
  if (!verifyCron(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run();
}

export async function GET(req: Request) {
  if (!verifyCron(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run();
}

async function run() {
  const sql = getEngineSql();
  if (!sql)
    return NextResponse.json({ error: "database not configured" }, { status: 503 });
  await ensureEngineSchema(sql);
  await seedTopics(sql);

  // 1. topic selection: trends first
  const trendRows = await sql`
    SELECT id, keyword, news_context
    FROM engine.trends
    WHERE status = 'relevant'
    ORDER BY relevance DESC, last_seen DESC LIMIT 1`;

  let source:
    | { kind: "trend"; id: number; keyword: string; context: string }
    | { kind: "evergreen"; id: number; topic: string; keywords: string[] }
    | null = null;

  if (trendRows.length) {
    const t = trendRows[0];
    source = {
      kind: "trend",
      id: t.id,
      keyword: t.keyword,
      context: ((t.news_context as { title: string }[] | null) || [])
        .map((n) => n.title)
        .join(" | "),
    };
  } else {
    const topicRows = await sql`
      SELECT id, topic, keywords FROM engine.topics
      ORDER BY used_count ASC, id ASC LIMIT 1`;
    if (topicRows.length) {
      const t = topicRows[0];
      source = { kind: "evergreen", id: t.id, topic: t.topic, keywords: t.keywords };
    }
  }
  if (!source)
    return NextResponse.json({ ok: false, reason: "no topic available" }, { status: 200 });

  // 2. generate + QC + publish
  let result: Awaited<ReturnType<typeof generateArticle>>;
  try {
    result = await generateArticle(sql, source);
  } catch (e) {
    result = { ok: false, reason: `generation error: ${String(e).slice(0, 400)}` };
  }

  // 3. cache refresh + push (only on successful publish)
  let push: Record<string, unknown> = {};
  if (result.ok && result.slug) {
    for (const p of ["/sitemap.xml", "/rss.xml", "/llms.txt", "/llms-full.txt", "/blog"]) {
      try {
        revalidatePath(p);
      } catch {
        /* non-critical */
      }
    }
    const url = `${SITE_URL}/blog/${result.slug}`;
    const [idx, websub] = await Promise.all([
      pushIndexNow([url, `${SITE_URL}/blog`, `${SITE_URL}/sitemap.xml`])
        .catch((e) => ({ ok: false, status: 0, detail: String(e).slice(0, 120) })),
      pushWebSub().catch(() => ({ ok: false, status: 0 })),
    ]);
    push = { indexnow: idx, websub };
  }

  const detail = {
    source: source.kind,
    topic: source.kind === "trend" ? source.keyword : source.topic,
    ...result,
    ...push,
  };
  await sql`
    INSERT INTO engine.ops_log (task, status, detail)
    VALUES ('content', ${result.ok ? "ok" : "skipped"},
            ${JSON.stringify(detail)}::jsonb)`;
  return NextResponse.json(detail);
}
