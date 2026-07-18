// SEO/GEO engine end-to-end suite against a live deployment.
// Usage: BASE_URL=https://tokshop.xyz CRON_SECRET=... INDEXNOW_KEY=... node tests/seo-e2e.mjs
const BASE = (process.env.BASE_URL ?? "https://tokshop.xyz").replace(/\/$/, "");
const CRON = process.env.CRON_SECRET ?? "";
const INDEXNOW = process.env.INDEXNOW_KEY ?? "";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function main() {
  console.log(`# TokShop seo-e2e — ${BASE} — ${new Date().toISOString()}`);

  // ---------- S1 technical foundation ----------
  const sm = await fetch(`${BASE}/sitemap.xml`);
  const smText = await sm.text();
  check("S01 sitemap.xml 200 + urlset + blog urls", sm.status === 200 &&
    smText.includes("<urlset") && smText.includes("/blog"));
  const rb = await fetch(`${BASE}/robots.txt`);
  const rbText = await rb.text();
  check("S02 robots.txt 200 + sitemap ref + api disallow", rb.status === 200 &&
    rbText.includes("Sitemap:") && rbText.includes("Disallow: /api/"));
  const rss = await fetch(`${BASE}/rss.xml`);
  const rssText = await rss.text();
  check("S03 rss.xml 200 + items", rss.status === 200 &&
    rssText.includes("<rss") && rssText.includes("<item>"));
  const llms = await fetch(`${BASE}/llms.txt`);
  const llmsText = await llms.text();
  check("S04 llms.txt dynamic (models + articles)", llms.status === 200 &&
    llmsText.includes("Models & pricing") && llmsText.includes("Latest articles"));
  const llmsFull = await fetch(`${BASE}/llms-full.txt`);
  check("S05 llms-full.txt 200 with article bodies", llmsFull.status === 200 &&
    (await llmsFull.text()).includes("## Model catalog"));
  const keyFile = await fetch(`${BASE}/${INDEXNOW}.txt`);
  check("S06 IndexNow key file at root", keyFile.status === 200 &&
    (await keyFile.text()).trim() === INDEXNOW);

  // ---------- S2 JSON-LD ----------
  const home = await (await fetch(`${BASE}/`)).text();
  check("S07 Organization+WebSite JSON-LD on home",
    home.includes("application/ld+json") && home.includes('"WebSite"'));
  const pricing = await (await fetch(`${BASE}/pricing`)).text();
  check("S08 Product JSON-LD on pricing", pricing.includes('"Product"'));
  const docs = await (await fetch(`${BASE}/docs`)).text();
  check("S09 FAQPage JSON-LD on docs", docs.includes('"FAQPage"'));

  // ---------- S3 engine endpoints ----------
  const noAuth = await fetch(`${BASE}/api/engine/trends`, { method: "POST" });
  check("S10 engine endpoints reject unauthenticated 401", noAuth.status === 401);

  const tr = await fetch(`${BASE}/api/engine/trends`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CRON}` },
  });
  const trBody = await tr.json();
  check("S11 trends engine fetches multi-geo + AI scoring",
    tr.status === 200 && trBody.fetched >= 30 && !trBody.scoring_error,
    `fetched=${trBody.fetched} inserted=${trBody.inserted} scored=${trBody.scored} relevant=${trBody.relevant}`);

  const ct = await fetch(`${BASE}/api/engine/content`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CRON}` },
  });
  const ctBody = await ct.json();
  check("S12 content engine publishes QC-passed article",
    ct.status === 200 && ctBody.ok === true && ctBody.qc?.pass === true,
    `slug=${ctBody.slug} words=${ctBody.qc?.wordCount} src=${ctBody.source}`);
  check("S13 IndexNow push accepted (200/202)",
    ctBody.indexnow?.ok === true, `status=${ctBody.indexnow?.status}`);
  check("S14 WebSub ping accepted", ctBody.websub?.ok === true);

  // ---------- S4 article page quality ----------
  const artUrl = `${BASE}/blog/${ctBody.slug}`;
  const artResp = await fetch(artUrl);
  const art = await artResp.text();
  check("S15 new article page 200", artResp.status === 200);
  check("S16 Article JSON-LD + canonical on article page",
    art.includes('"Article"') && art.includes('rel="canonical"'));
  check("S17 article has internal links",
    /href="\/(pricing|docs|blog)/.test(art));
  const titleTag = art.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
  check("S18 article title within 70 chars", titleTag.length > 0 &&
    titleTag.length <= 70, `len=${titleTag.length}`);

  // new article appears in sitemap and RSS (re-fetch)
  const sm2 = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const rss2 = await (await fetch(`${BASE}/rss.xml`)).text();
  check("S19 new article in sitemap + RSS",
    sm2.includes(ctBody.slug) && rss2.includes(ctBody.slug));

  // ---------- S5 self-audit engine ----------
  const audit = await fetch(`${BASE}/api/engine/seo-audit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CRON}` },
  });
  const auditBody = await audit.json();
  check("S20 seo-audit produces score + infra all green",
    audit.status === 200 && typeof auditBody.score === "number" &&
    Object.values(auditBody.infra || {}).every(Boolean),
    `score=${auditBody.score}`);
  check("S21 seo-audit zero page issues",
    (auditBody.pages || []).every((p) => p.issues.length === 0),
    JSON.stringify((auditBody.pages || []).filter((p) => p.issues.length).map((p) => [p.url, p.issues])).slice(0, 200));

  const fails = results.filter((r) => !r.ok);
  console.log(`\n== ${results.length - fails.length}/${results.length} PASS, FAIL ${fails.length} ==`);
  if (fails.length) process.exit(1);
}

main().catch((e) => {
  console.error("seo-e2e crashed:", e);
  process.exit(1);
});
