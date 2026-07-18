import { NextResponse } from "next/server";
import { verifyCron } from "@/lib/engine/cron";
import { ensureEngineSchema, getEngineSql, listArticles } from "@/lib/engine/db";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily SEO self-audit: fetch key pages + latest articles, check
 * title / meta description / canonical / JSON-LD / H1 / internal links /
 * HTTP status. Score written to engine.seo_scores; issues to engine.ops_log.
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

type PageAudit = {
  url: string;
  status: number;
  issues: string[];
};

async function auditPage(url: string, kind: "page" | "article"): Promise<PageAudit> {
  const issues: string[] = [];
  let status = 0;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "tokshop-seo-audit" },
      signal: AbortSignal.timeout(15_000),
    });
    status = r.status;
    if (!r.ok) {
      issues.push(`HTTP ${r.status}`);
      return { url, status, issues };
    }
    const html = await r.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
    if (!title) issues.push("missing <title>");
    else if (title.length > 70) issues.push(`title too long (${title.length})`);
    const desc = html.match(
      /<meta[^>]+name="description"[^>]+content="([^"]*)"/i
    )?.[1] ?? html.match(
      /<meta[^>]+content="([^"]*)"[^>]+name="description"/i
    )?.[1] ?? "";
    if (!desc) issues.push("missing meta description");
    else if (desc.length < 50) issues.push(`description too short (${desc.length})`);
    if (!/rel="canonical"/i.test(html)) issues.push("missing canonical");
    if (!/application\/ld\+json/i.test(html)) issues.push("missing JSON-LD");
    const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
    if (h1Count !== 1) issues.push(`h1 count = ${h1Count}`);
    if (kind === "article") {
      const internal = (html.match(/href="\/(pricing|docs|blog)/g) || []).length;
      if (internal < 1) issues.push("no internal links");
    }
  } catch (e) {
    issues.push(`fetch error: ${String(e).slice(0, 80)}`);
  }
  return { url, status, issues };
}

async function run() {
  const sql = getEngineSql();
  if (!sql)
    return NextResponse.json({ error: "database not configured" }, { status: 503 });
  await ensureEngineSchema(sql);

  const staticUrls = ["/", "/pricing", "/docs", "/blog"].map((p) => SITE_URL + p);
  const articles = await listArticles(sql, 10);
  const audits: PageAudit[] = [];
  for (const u of staticUrls) audits.push(await auditPage(u, "page"));
  for (const a of articles)
    audits.push(await auditPage(`${SITE_URL}/blog/${a.slug}`, "article"));

  // infrastructure checks
  const infra: Record<string, boolean> = {};
  for (const p of ["/sitemap.xml", "/robots.txt", "/rss.xml", "/llms.txt"]) {
    try {
      const r = await fetch(SITE_URL + p, { signal: AbortSignal.timeout(10_000) });
      infra[p] = r.ok;
    } catch {
      infra[p] = false;
    }
  }

  const pagesWithIssues = audits.filter((a) => a.issues.length > 0).length;
  const infraOk = Object.values(infra).filter(Boolean).length;
  const score =
    100 *
    (0.7 * (1 - pagesWithIssues / Math.max(audits.length, 1)) +
      0.3 * (infraOk / Math.max(Object.keys(infra).length, 1)));

  const detail = {
    pages: audits.map((a) => ({ url: a.url.replace(SITE_URL, ""), status: a.status, issues: a.issues })),
    infra,
  };
  await sql`
    INSERT INTO engine.seo_scores (score, pages_audited, pages_with_issues, detail)
    VALUES (${Math.round(score * 10) / 10}, ${audits.length}, ${pagesWithIssues},
            ${JSON.stringify(detail)}::jsonb)`;
  const ok = pagesWithIssues === 0 && infraOk === Object.keys(infra).length;
  await sql`
    INSERT INTO engine.ops_log (task, status, detail)
    VALUES ('seo_audit', ${ok ? "ok" : "issues"}, ${JSON.stringify({
      score: Math.round(score * 10) / 10,
      pages_audited: audits.length,
      pages_with_issues: pagesWithIssues,
      infra,
    })}::jsonb)`;
  return NextResponse.json({ ok, score: Math.round(score * 10) / 10, ...detail });
}
