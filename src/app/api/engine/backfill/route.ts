import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { verifyCron } from "@/lib/engine/cron";
import { ensureEngineSchema, getEngineSql } from "@/lib/engine/db";
import {
  pushIndexNow,
  retrofitArticle,
  translateArticle,
} from "@/lib/engine/content";
import { extractFaq, hasTldr } from "@/lib/engine/extract";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Backfill for pre-existing articles, ?limit=N per call (default 2):
 * 1. retrofit to answer-first structure (TL;DR + FAQ + question H2)
 * 2. translate to Chinese if missing
 * Idempotent: articles already up to standard are skipped, so this can run
 * on a schedule until the corpus converges, then becomes a no-op.
 */
export async function POST(req: Request) {
  if (!verifyCron(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run(req);
}

export async function GET(req: Request) {
  if (!verifyCron(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run(req);
}

async function run(req: Request) {
  const sql = getEngineSql();
  if (!sql)
    return NextResponse.json({ error: "database not configured" }, { status: 503 });
  await ensureEngineSchema(sql);

  const limit = Math.min(
    Math.max(Number(new URL(req.url).searchParams.get("limit")) || 2, 1),
    5
  );

  const rows = (await sql`
    SELECT id, slug, title, description, body_md, zh_body_md
    FROM engine.articles
    WHERE status = 'published'
    ORDER BY random()`) as {
    id: number;
    slug: string;
    title: string;
    description: string;
    body_md: string;
    zh_body_md: string | null;
  }[];

  const pending = rows.filter(
    (a) =>
      !hasTldr(a.body_md) || extractFaq(a.body_md).length < 2 || !a.zh_body_md
  );

  const processed: Record<string, unknown>[] = [];
  const touched: string[] = [];
  for (const a of pending.slice(0, limit)) {
    const entry: Record<string, unknown> = { slug: a.slug };
    let body = a.body_md;
    if (!hasTldr(body) || extractFaq(body).length < 2) {
      try {
        const r = await retrofitArticle(sql, a);
        entry.retrofit = r;
        if (r.ok) {
          const fresh = await sql`
            SELECT body_md FROM engine.articles WHERE id = ${a.id}`;
          body = (fresh[0] as { body_md: string }).body_md;
        }
      } catch (e) {
        entry.retrofit = { ok: false, reason: String(e).slice(0, 200) };
      }
    }
    if (!a.zh_body_md) {
      try {
        entry.translate = await translateArticle(sql, { ...a, body_md: body });
      } catch (e) {
        entry.translate = { ok: false, reason: String(e).slice(0, 200) };
      }
    }
    processed.push(entry);
    touched.push(a.slug);
  }

  if (touched.length) {
    for (const p of ["/sitemap.xml", "/llms-full.txt", "/blog", "/zh/blog"]) {
      try {
        revalidatePath(p);
      } catch {
        /* non-critical */
      }
    }
    for (const slug of touched) {
      try {
        revalidatePath(`/blog/${slug}`);
        revalidatePath(`/zh/blog/${slug}`);
      } catch {
        /* non-critical */
      }
    }
    await pushIndexNow(
      touched.flatMap((s) => [`${SITE_URL}/blog/${s}`, `${SITE_URL}/zh/blog/${s}`])
    ).catch(() => null);
  }

  const detail = {
    total: rows.length,
    pending: pending.length,
    processed,
    remaining: Math.max(pending.length - processed.length, 0),
  };
  await sql`
    INSERT INTO engine.ops_log (task, status, detail)
    VALUES ('backfill', 'ok', ${JSON.stringify(detail)}::jsonb)`;
  return NextResponse.json(detail);
}
