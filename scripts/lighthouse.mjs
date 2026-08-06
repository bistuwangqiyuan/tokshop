// Industry-standard Lighthouse SEO scores via the Lighthouse CLI (the same
// scoring engine PageSpeed Insights runs server-side). Used as the CI gate
// because the keyless PSI API quota is too small; scripts/psi.mjs remains
// for when a PSI_API_KEY is configured.
//
// Usage:  BASE_URL=https://tokshop.xyz node scripts/lighthouse.mjs
// Output: per-URL Lighthouse SEO score + JSON archive in psi-results/.
// Exit 1 if any SEO score < MIN_SEO (default 100).
// Reproduce independently: npx lighthouse <url> --only-categories=seo

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const BASE = (process.env.BASE_URL ?? "https://tokshop.xyz").replace(/\/$/, "");
const MIN_SEO = Number(process.env.MIN_SEO ?? 100);

const PATHS = [
  "/",
  "/pricing",
  "/docs",
  "/blog",
  "/zh",
  "/zh/pricing",
  "/downloads",
  "/terms",
  "/refund",
  "/privacy",
  "/aup",
  "/contact",
  "/about",
];

async function main() {
  console.log(`# Lighthouse CLI — ${BASE} — ${new Date().toISOString()}`);
  mkdirSync("psi-results", { recursive: true });

  // include the newest article (dynamic content must score too)
  const paths = [...PATHS];
  try {
    const sm = await (await fetch(`${BASE}/sitemap.xml`)).text();
    const article = sm.match(/<loc>[^<]*(\/blog\/[a-z0-9-]+)<\/loc>/)?.[1];
    if (article) paths.push(article);
  } catch {
    /* static list still covers the site */
  }

  const summary = [];
  let failed = 0;
  for (const p of paths) {
    const url = `${BASE}${p}`;
    const file = `psi-results/lh${p.replace(/\W+/g, "_") || "_home"}.json`;
    process.stdout.write(`${url} ... `);
    rmSync(file, { force: true });
    let executionError = null;
    try {
      execFileSync(
        "npx",
        [
          "--yes",
          "lighthouse",
          url,
          "--only-categories=seo",
          "--output=json",
          `--output-path=${file}`,
          '--chrome-flags="--headless=new --no-sandbox --disable-gpu"',
          "--quiet",
        ],
        { stdio: ["ignore", "ignore", "pipe"], timeout: 300_000, shell: process.platform === "win32" }
      );
    } catch (error) {
      executionError = error;
    }

    try {
      if (executionError) {
        const stderr = String(executionError.stderr ?? executionError);
        const reportSurvivedWindowsCleanupError =
          process.platform === "win32" &&
          /EPERM[\s\S]*[\\/]lighthouse\./i.test(stderr);
        if (!reportSurvivedWindowsCleanupError) throw executionError;
        process.stdout.write("WARN Chrome temp cleanup; ");
      }
      const lh = JSON.parse(readFileSync(file, "utf8"));
      const seo = Math.round((lh.categories?.seo?.score ?? 0) * 100);
      const row = { url: p, seo, lighthouseVersion: lh.lighthouseVersion, fetchTime: lh.fetchTime };
      summary.push(row);
      if (seo < MIN_SEO) failed++;
      console.log(`${seo >= MIN_SEO ? "PASS" : "FAIL"}  SEO=${seo} (LH ${lh.lighthouseVersion})`);
    } catch (e) {
      failed++;
      summary.push({ url: p, error: String(e).slice(0, 200) });
      console.log(`ERROR ${String(e).slice(0, 160)}`);
    }
  }

  writeFileSync(
    "psi-results/lighthouse-summary.json",
    JSON.stringify({ base: BASE, at: new Date().toISOString(), summary }, null, 2)
  );
  console.log(`\n== SEO>=${MIN_SEO}: ${summary.length - failed}/${summary.length} PASS ==`);
  console.table(summary);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error("lighthouse crashed:", e);
  process.exit(1);
});
