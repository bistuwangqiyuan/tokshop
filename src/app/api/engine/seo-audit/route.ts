import { NextResponse } from "next/server";
import { verifyCron } from "@/lib/engine/cron";
import { ensureEngineSchema, getEngineSql, listArticles } from "@/lib/engine/db";
import { extractFaq, hasQuestionHeading, hasTldr } from "@/lib/engine/extract";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily SEO + GEO self-audit.
 *
 * SEO score (0-100): 0.7 x (pages without issues / pages audited)
 *                  + 0.3 x (infrastructure endpoints OK / total).
 * Audits every marketing page in both languages plus the latest articles
 * (EN + zh) for: HTTP status, title, meta description, self-referencing
 * canonical, parseable JSON-LD, og:image / og:title / twitter:card, single
 * H1, reciprocal hreflang, internal links.
 *
 * GEO score (0-100): a reproducible checklist derived from Google's AI
 * features guide (developers.google.com/search/docs/fundamentals/
 * ai-optimization-guide) and published GEO practice (answer-first content,
 * machine-readable surfaces, explicit AI-crawler access, entity-rich
 * structured data). Weights are fixed in code below; every input is a
 * machine-checkable boolean or fraction, so any third party can recompute
 * the score from public URLs.
 */
/**
 * Daily runs audit the newest articles only, which keeps the run short but
 * means an older page can never be re-checked. `?articles=N` widens the window
 * on demand, up to the whole archive.
 */
function articleWindow(req: Request): number {
  const asked = Number(new URL(req.url).searchParams.get("articles"));
  return Number.isFinite(asked) && asked > 0 ? Math.min(asked, 100) : 10;
}

export async function POST(req: Request) {
  if (!verifyCron(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run(articleWindow(req));
}

export async function GET(req: Request) {
  if (!verifyCron(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run(articleWindow(req));
}

type PageAudit = {
  url: string;
  status: number;
  issues: string[];
  jsonLdTypes: string[];
};

// Marketing pages that must carry reciprocal en/zh-CN hreflang
const HREFLANG_PAGES = new Set([
  "/", "/pricing", "/docs", "/blog", "/downloads",
  "/terms", "/refund", "/privacy",
  "/zh", "/zh/pricing", "/zh/docs", "/zh/blog", "/zh/downloads",
  "/zh/terms", "/zh/refund", "/zh/privacy",
]);

const AI_UA_REQUIRED = [
  "GPTBot",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
];

async function fetchText(url: string, timeoutMs = 15_000) {
  const r = await fetch(url, {
    headers: { "User-Agent": "tokshop-seo-audit" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: r.status, ok: r.ok, text: r.ok ? await r.text() : "" };
}

function jsonLdBlocks(html: string): { types: string[]; parseErrors: number } {
  const types: string[] = [];
  let parseErrors = 0;
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = Array.isArray(data) ? data : data["@graph"] ?? [data];
      for (const n of nodes) {
        const t = n?.["@type"];
        if (typeof t === "string") types.push(t);
        else if (Array.isArray(t)) types.push(...t);
      }
    } catch {
      parseErrors++;
    }
  }
  return { types, parseErrors };
}

/**
 * Length limits apply to what a searcher sees, not to the escaped markup. An
 * ampersand in a title arrives as `&amp;`, so measuring the raw HTML counted
 * four characters that do not exist and failed a 67-character title as 71.
 */
/**
 * Search engines truncate titles and snippets by pixel width, not by character
 * count, and a CJK glyph is about twice as wide as a Latin one. The 70 and 40
 * thresholds below were picked for Latin text, so measure in the same unit:
 * a 37-character Chinese description says as much as a 125-character English
 * one and must not be reported as too short.
 */
function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w +=
      /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(
        ch
      )
        ? 2
        : 1;
  }
  return w;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

async function auditPage(
  path: string,
  kind: "page" | "article"
): Promise<PageAudit> {
  const url = SITE_URL + path;
  const issues: string[] = [];
  let status = 0;
  let jsonLdTypes: string[] = [];
  try {
    const r = await fetchText(url);
    status = r.status;
    if (!r.ok) {
      issues.push(`HTTP ${r.status}`);
      return { url, status, issues, jsonLdTypes };
    }
    const html = r.text;

    const title = decodeEntities(
      html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? ""
    );
    if (!title) issues.push("missing <title>");
    else if (displayWidth(title) > 70)
      issues.push(`title too long (${displayWidth(title)})`);

    const desc = decodeEntities(
      html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i)?.[1] ??
        html.match(/<meta[^>]+content="([^"]*)"[^>]+name="description"/i)?.[1] ??
        ""
    );
    if (!desc) issues.push("missing meta description");
    else if (displayWidth(desc) < 40)
      issues.push(`description too short (${displayWidth(desc)})`);

    const canonical =
      html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i)?.[1] ??
      html.match(/<link[^>]+href="([^"]*)"[^>]+rel="canonical"/i)?.[1] ?? "";
    if (!canonical) issues.push("missing canonical");
    else if (canonical.replace(/\/$/, "") !== url.replace(/\/$/, ""))
      issues.push(`canonical not self-referencing (${canonical})`);

    const ld = jsonLdBlocks(html);
    jsonLdTypes = ld.types;
    if (!ld.types.length) issues.push("missing JSON-LD");
    if (ld.parseErrors) issues.push(`${ld.parseErrors} unparseable JSON-LD block(s)`);

    if (!/property="og:title"/i.test(html)) issues.push("missing og:title");
    if (!/property="og:image"/i.test(html)) issues.push("missing og:image");
    if (!/name="twitter:card"/i.test(html)) issues.push("missing twitter:card");

    const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
    if (h1Count !== 1) issues.push(`h1 count = ${h1Count}`);

    if (HREFLANG_PAGES.has(path)) {
      if (!/hreflang="zh-CN"/i.test(html) || !/hreflang="en"/i.test(html))
        issues.push("missing reciprocal hreflang (en/zh-CN)");
    }

    if (kind === "article") {
      const internal = (html.match(/href="\/(zh\/)?(pricing|docs|blog)/g) || []).length;
      if (internal < 1) issues.push("no internal links");
    }
  } catch (e) {
    issues.push(`fetch error: ${String(e).slice(0, 80)}`);
  }
  return { url, status, issues, jsonLdTypes };
}

async function run(articleLimit: number) {
  const sql = getEngineSql();
  if (!sql)
    return NextResponse.json({ error: "database not configured" }, { status: 503 });
  await ensureEngineSchema(sql);

  // ---------- page audits (both languages) ----------
  const staticPaths = [
    "/", "/pricing", "/docs", "/blog", "/downloads",
    "/terms", "/refund", "/privacy",
    "/zh", "/zh/pricing", "/zh/docs", "/zh/blog", "/zh/downloads",
    "/zh/terms", "/zh/refund", "/zh/privacy",
  ];
  const articles = await listArticles(sql, articleLimit);
  const audits: PageAudit[] = [];
  for (const p of staticPaths) audits.push(await auditPage(p, "page"));
  for (const a of articles) {
    audits.push(await auditPage(`/blog/${a.slug}`, "article"));
    if (a.zh_title && a.zh_body_md)
      audits.push(await auditPage(`/zh/blog/${a.slug}`, "article"));
  }

  // ---------- infrastructure ----------
  const infra: Record<string, boolean> = {};
  let robotsText = "";
  let llmsText = "";
  for (const p of ["/sitemap.xml", "/robots.txt", "/rss.xml", "/llms.txt", "/llms-full.txt"]) {
    try {
      const r = await fetchText(SITE_URL + p, 10_000);
      infra[p] = r.ok;
      if (p === "/robots.txt") robotsText = r.text;
      if (p === "/llms.txt") llmsText = r.text;
    } catch {
      infra[p] = false;
    }
  }

  // ---------- GEO checklist (weights fixed; every input reproducible) ----------
  const byUrl = (path: string) =>
    audits.find((a) => a.url === SITE_URL + path);
  const homeTypes = byUrl("/")?.jsonLdTypes ?? [];
  const pricingTypes = byUrl("/pricing")?.jsonLdTypes ?? [];
  const docsTypes = byUrl("/docs")?.jsonLdTypes ?? [];
  const zhDocsTypes = byUrl("/zh/docs")?.jsonLdTypes ?? [];

  const n = Math.max(articles.length, 1);
  const frac = (count: number) => count / n;
  const articleAudit = (slug: string) => byUrl(`/blog/${slug}`);

  const geoChecks: { name: string; weight: number; value: number }[] = [
    // -- machine-readable surfaces (40) --
    {
      name: "llms.txt valid (H1 + summary blockquote + links)",
      weight: 8,
      value:
        infra["/llms.txt"] && /^# /m.test(llmsText) &&
        /^> /m.test(llmsText) && /\]\(https?:\/\//.test(llmsText) ? 1 : 0,
    },
    { name: "llms-full.txt served", weight: 4, value: infra["/llms-full.txt"] ? 1 : 0 },
    {
      name: "robots.txt explicitly allows AI crawlers",
      weight: 8,
      value: AI_UA_REQUIRED.every((ua) => robotsText.includes(ua)) ? 1 : 0,
    },
    { name: "RSS feed served", weight: 6, value: infra["/rss.xml"] ? 1 : 0 },
    {
      name: "IndexNow key at site root",
      weight: 6,
      value: await (async () => {
        const key = process.env.INDEXNOW_KEY;
        if (!key) return 0;
        try {
          const r = await fetchText(`${SITE_URL}/${key}.txt`, 10_000);
          return r.ok && r.text.trim() === key ? 1 : 0;
        } catch {
          return 0;
        }
      })(),
    },
    {
      name: "sitemap includes both languages",
      weight: 8,
      value: await (async () => {
        try {
          const r = await fetchText(`${SITE_URL}/sitemap.xml`, 10_000);
          return r.ok && r.text.includes("/zh") ? 1 : 0;
        } catch {
          return 0;
        }
      })(),
    },
    // -- entity-rich structured data (30) --
    {
      name: "Organization + WebSite on home",
      weight: 8,
      value:
        homeTypes.includes("Organization") && homeTypes.includes("WebSite") ? 1 : 0,
    },
    {
      name: "Product + OfferCatalog on pricing",
      weight: 6,
      value:
        pricingTypes.includes("Product") && pricingTypes.includes("OfferCatalog")
          ? 1 : 0,
    },
    {
      name: "FAQPage on docs (en + zh)",
      weight: 4,
      value:
        docsTypes.includes("FAQPage") && zhDocsTypes.includes("FAQPage") ? 1 : 0,
    },
    {
      name: "Article JSON-LD with BreadcrumbList on latest articles",
      weight: 6,
      value: frac(
        articles.filter((a) => {
          const t = articleAudit(a.slug)?.jsonLdTypes ?? [];
          return t.includes("Article") && t.includes("BreadcrumbList");
        }).length
      ),
    },
    {
      name: "FAQPage on latest articles",
      weight: 6,
      value: frac(
        articles.filter((a) =>
          (articleAudit(a.slug)?.jsonLdTypes ?? []).includes("FAQPage")
        ).length
      ),
    },
    // -- answer-first, extractable content (30) --
    {
      name: "TL;DR block on latest articles",
      weight: 8,
      value: frac(articles.filter((a) => hasTldr(a.body_md)).length),
    },
    {
      name: "FAQ section (>=2 Q&A) on latest articles",
      weight: 8,
      value: frac(articles.filter((a) => extractFaq(a.body_md).length >= 2).length),
    },
    {
      name: "question-style H2 on latest articles",
      weight: 6,
      value: frac(articles.filter((a) => hasQuestionHeading(a.body_md)).length),
    },
    {
      name: "Chinese translation on latest articles",
      weight: 8,
      value: frac(
        articles.filter((a) => a.zh_title && a.zh_body_md).length
      ),
    },
  ];
  const geoScore =
    Math.round(
      geoChecks.reduce((sum, c) => sum + c.weight * c.value, 0) * 10
    ) / 10;

  // ---------- SEO score ----------
  const pagesWithIssues = audits.filter((a) => a.issues.length > 0).length;
  const infraOk = Object.values(infra).filter(Boolean).length;
  const score =
    Math.round(
      100 *
        (0.7 * (1 - pagesWithIssues / Math.max(audits.length, 1)) +
          0.3 * (infraOk / Math.max(Object.keys(infra).length, 1))) *
        10
    ) / 10;

  const detail = {
    pages: audits.map((a) => ({
      url: a.url.replace(SITE_URL, ""),
      status: a.status,
      issues: a.issues,
    })),
    infra,
    geo_checks: geoChecks.map((c) => ({
      check: c.name,
      weight: c.weight,
      value: Math.round(c.value * 100) / 100,
    })),
  };
  await sql`
    INSERT INTO engine.seo_scores
      (score, geo_score, pages_audited, pages_with_issues, detail)
    VALUES (${score}, ${geoScore}, ${audits.length}, ${pagesWithIssues},
            ${JSON.stringify(detail)}::jsonb)`;
  const ok =
    pagesWithIssues === 0 && infraOk === Object.keys(infra).length && geoScore >= 100;
  await sql`
    INSERT INTO engine.ops_log (task, status, detail)
    VALUES ('seo_audit', ${ok ? "ok" : "issues"}, ${JSON.stringify({
      score,
      geo_score: geoScore,
      pages_audited: audits.length,
      pages_with_issues: pagesWithIssues,
      infra,
    })}::jsonb)`;
  return NextResponse.json({ ok, score, geo: geoScore, ...detail });
}
