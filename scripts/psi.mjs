// External, independently reproducible Lighthouse scores via the Google
// PageSpeed Insights API v5 (the industry-standard SEO score).
//
// Usage:  BASE_URL=https://tokshop.xyz [PSI_API_KEY=...] node scripts/psi.mjs
// Output: per-URL Lighthouse category scores (0-100) + JSON archive on disk.
// Exit code 1 if any SEO score < MIN_SEO (default 100).
//
// Anyone can re-run this command (or paste the URLs into
// https://pagespeed.web.dev/) to verify the numbers.

import { writeFileSync, mkdirSync } from "node:fs";

const BASE = (process.env.BASE_URL ?? "https://tokshop.xyz").replace(/\/$/, "");
const KEY = process.env.PSI_API_KEY ?? "";
const MIN_SEO = Number(process.env.MIN_SEO ?? 100);

const PATHS = ["/", "/pricing", "/docs", "/blog", "/zh", "/zh/pricing"];

const CATEGORIES = ["SEO", "PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES"];

async function psi(url, attempt = 1) {
  const q = new URLSearchParams({ url, strategy: "mobile" });
  for (const c of CATEGORIES) q.append("category", c);
  if (KEY) q.set("key", KEY);
  const r = await fetch(
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`,
    { signal: AbortSignal.timeout(120_000) }
  );
  if (!r.ok) {
    if (attempt < 3 && (r.status === 429 || r.status >= 500)) {
      const wait = attempt * 30_000;
      console.log(`  HTTP ${r.status}, retrying in ${wait / 1000}s...`);
      await new Promise((res) => setTimeout(res, wait));
      return psi(url, attempt + 1);
    }
    throw new Error(`PSI HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  return r.json();
}

async function main() {
  console.log(`# PSI/Lighthouse — ${BASE} — ${new Date().toISOString()}`);
  mkdirSync("psi-results", { recursive: true });
  const summary = [];
  let failed = 0;

  // add newest article to the URL list (dynamic content must score too)
  const paths = [...PATHS];
  try {
    const sm = await (await fetch(`${BASE}/sitemap.xml`)).text();
    const article = sm.match(/<loc>[^<]*(\/blog\/[a-z0-9-]+)<\/loc>/)?.[1];
    if (article) paths.push(article);
  } catch {
    /* sitemap unavailable: static list still covers the site */
  }

  for (const p of paths) {
    const url = `${BASE}${p}`;
    process.stdout.write(`${url} ... `);
    try {
      const data = await psi(url);
      const cats = data.lighthouseResult?.categories ?? {};
      const row = {
        url: p,
        seo: Math.round((cats.seo?.score ?? 0) * 100),
        performance: Math.round((cats.performance?.score ?? 0) * 100),
        accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
        bestPractices: Math.round((cats["best-practices"]?.score ?? 0) * 100),
        lighthouseVersion: data.lighthouseResult?.lighthouseVersion,
        fetchTime: data.lighthouseResult?.fetchTime,
      };
      summary.push(row);
      const file = `psi-results/${p.replace(/\W+/g, "_") || "home"}.json`;
      writeFileSync(file, JSON.stringify(data.lighthouseResult, null, 1));
      const flag = row.seo >= MIN_SEO ? "PASS" : "FAIL";
      if (row.seo < MIN_SEO) failed++;
      console.log(
        `${flag}  SEO=${row.seo} Perf=${row.performance} A11y=${row.accessibility} BP=${row.bestPractices}`
      );
    } catch (e) {
      failed++;
      summary.push({ url: p, error: String(e).slice(0, 200) });
      console.log(`ERROR ${String(e).slice(0, 120)}`);
    }
    // keyless quota is tight: pace the calls
    await new Promise((res) => setTimeout(res, KEY ? 2000 : 15_000));
  }

  writeFileSync(
    "psi-results/summary.json",
    JSON.stringify({ base: BASE, at: new Date().toISOString(), summary }, null, 2)
  );
  console.log(`\n== SEO>=${MIN_SEO}: ${summary.length - failed}/${summary.length} PASS ==`);
  console.table(summary);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error("psi crashed:", e);
  process.exit(1);
});
