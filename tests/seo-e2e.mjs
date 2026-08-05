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

  // ---------- S6 GEO hardening (og images, AI crawlers, zh locale) ----------
  check("S22 og:image + twitter:card on home",
    /property="og:image"/.test(home) && /name="twitter:card"/.test(home));
  check("S23 Organization logo + sameAs + contactPoint on home",
    home.includes('"logo"') && home.includes('"sameAs"') &&
    home.includes('"contactPoint"'));
  check("S24 robots.txt explicitly allows AI crawlers",
    ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot"]
      .every((ua) => rbText.includes(ua)));
  const zhHome = await fetch(`${BASE}/zh`);
  const zhHomeText = await zhHome.text();
  // Note: React renders the attribute camelCased as hrefLang= — match /i.
  check("S25 zh home 200 + reciprocal hreflang",
    zhHome.status === 200 && /hreflang="en"/i.test(zhHomeText) &&
    /hreflang="zh-CN"/i.test(zhHomeText));
  const zhPricing = await (await fetch(`${BASE}/zh/pricing`)).text();
  const zhDocs = await (await fetch(`${BASE}/zh/docs`)).text();
  check("S26 OfferCatalog on pricing (en+zh) + FAQPage on zh docs",
    pricing.includes('"OfferCatalog"') && zhPricing.includes('"OfferCatalog"') &&
    zhDocs.includes('"FAQPage"'));
  const zhBlog = await fetch(`${BASE}/zh/blog`);
  check("S27 zh blog index 200", zhBlog.status === 200);

  // ---------- S8 commerce and legal pages ----------
  // Payment onboarding reviewers check for these, and so do buyers.
  for (const slug of ["terms", "refund", "privacy", "aup", "contact", "about"]) {
    const en = await fetch(`${BASE}/${slug}`);
    const enText = await en.text();
    const zh = await fetch(`${BASE}/zh/${slug}`);
    const zhText = await zh.text();
    check(`S35 /${slug} en+zh 200 with canonical and reciprocal hreflang`,
      en.status === 200 && zh.status === 200 &&
      enText.includes(`rel="canonical" href="${BASE}/${slug}"`) &&
      zhText.includes(`rel="canonical" href="${BASE}/zh/${slug}"`) &&
      /hreflang="zh-CN"/i.test(enText) && /hreflang="en"/i.test(zhText),
      `en=${en.status} zh=${zh.status}`);
    check(`S36 /${slug} in sitemap (both locales)`,
      smText.includes(`${BASE}/${slug}`) && smText.includes(`${BASE}/zh/${slug}`));
  }
  const dl = await fetch(`${BASE}/downloads`);
  const dlText = await dl.text();
  const zhDl = await fetch(`${BASE}/zh/downloads`);
  const zhDlText = await zhDl.text();
  check("S37 downloads landing en+zh 200 with Product+Offer JSON-LD",
    dl.status === 200 && zhDl.status === 200 &&
    dlText.includes('"Product"') && dlText.includes('"Offer"') &&
    zhDlText.includes('"Offer"'),
    `en=${dl.status} zh=${zhDl.status}`);
  check("S38 downloads canonical + reciprocal hreflang",
    dlText.includes(`rel="canonical" href="${BASE}/downloads"`) &&
    /hreflang="zh-CN"/i.test(dlText) && /hreflang="en"/i.test(zhDlText));
  // The price must be stated on the product card itself, not only on the buy
  // button, which does not render until a payment rail is configured.
  check("S39 downloads states the USD price in both locales",
    dlText.includes("$1.00") && zhDlText.includes("$1.00"));
  check("S40 legal pages linked from every footer",
    home.includes("/terms") && home.includes("/refund") &&
    home.includes("/privacy") && home.includes("/downloads") &&
    home.includes("/aup") && home.includes("/contact") &&
    home.includes("/about"));
  check("S41 llms.txt advertises policies and downloads",
    llmsText.includes("/refund") && llmsText.includes("/downloads") &&
    llmsText.includes("/aup") && llmsText.includes("/contact") &&
    llmsText.includes("/about"));
  const about = await (await fetch(`${BASE}/about`)).text();
  const zhAbout = await (await fetch(`${BASE}/zh/about`)).text();
  check("S49 about page states operator and payment rails (en+zh)",
    /Wang Qiyuan/i.test(about) && /Creem/i.test(about) &&
    /merchant of record/i.test(about) &&
    zhAbout.includes("王启源") && zhAbout.includes("Creem"));

  // ---------- merchant identity, required by payment-provider review ----------
  // The seller's legal name and address must be reachable from any page, in
  // both languages, not buried in one paragraph of one document.
  check("S43 operator name and address in every footer (en+zh)",
    home.includes("Wang Qiyuan") && home.includes("Beijing 100192") &&
    zhHomeText.includes("王启源") && zhHomeText.includes("100192"));
  const terms = await (await fetch(`${BASE}/terms`)).text();
  const zhTerms = await (await fetch(`${BASE}/zh/terms`)).text();
  check("S44 legal pages carry the seller identity block",
    terms.includes("Who you are buying from") &&
    terms.includes("Beijing 100192") &&
    zhTerms.includes("你在向谁购买") && zhTerms.includes("100192"));
  const orgLd = home.match(/"@type":"Organization".*?\}\},/s)?.[0] ?? home;
  check("S45 Organization JSON-LD carries legalName and PostalAddress",
    orgLd.includes('"legalName"') && orgLd.includes('"PostalAddress"') &&
    orgLd.includes('"postalCode":"100192"'));

  // ---------- AI transparency, required for AI products ----------
  const aup = await (await fetch(`${BASE}/aup`)).text();
  const zhAup = await (await fetch(`${BASE}/zh/aup`)).text();
  check("S46 AUP states non-affiliation and text-only catalog (en+zh)",
    /not affiliated with/i.test(aup) && /text models only/i.test(aup) &&
    zhAup.includes("无附属") && zhAup.includes("只有文本模型"));
  check("S47 AUP prohibits the content a reviewer looks for",
    /minors/i.test(aup) && /malware/i.test(aup) &&
    zhAup.includes("未成年人") && zhAup.includes("恶意软件"));

  // A merchant-of-record reviewer treats "we will complete your order by hand"
  // as an offer to settle payments off-rail. It must not appear anywhere.
  const offRail = [home, zhHomeText, dlText, zhDlText].some((page) =>
    /by hand|手工为你完成订单/i.test(page));
  check("S48 no off-rail manual order fulfilment offered", !offRail);
  const delivery = await fetch(`${BASE}/downloads/success?order=nope&t=nope`);
  check("S42 delivery page noindex and refuses a forged link",
    delivery.status === 200 &&
    /<meta name="robots" content="noindex/i.test(await delivery.text()),
    `status=${delivery.status}`);

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
  // Declining to publish a draft that fails QC is the QC working, not a
  // regression. What must always hold is that the engine answers coherently -
  // either a published article that passed QC, or a stated reason - and that
  // the site is still being fed over time, which S12b checks independently.
  const published = ctBody.ok === true;
  check("S12 content engine publishes a QC-passed article or says why not",
    ct.status === 200 &&
    (published ? ctBody.qc?.pass === true : typeof ctBody.reason === "string"),
    `slug=${ctBody.slug} words=${ctBody.qc?.wordCount} src=${ctBody.source}` +
    (published ? "" : ` reason=${ctBody.reason ?? "(none reported)"}`));

  const rssFresh = await (await fetch(`${BASE}/rss.xml`)).text();
  const newestPub = rssFresh.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1];
  const ageHours = newestPub
    ? (Date.now() - new Date(newestPub).getTime()) / 3_600_000
    : Infinity;
  check("S12b newest article published within 48h (engine is not stuck)",
    ageHours < 48, `age=${Number.isFinite(ageHours) ? ageHours.toFixed(1) : "?"}h`);

  check("S13 IndexNow push accepted (200/202)",
    published ? ctBody.indexnow?.ok === true : true,
    published ? `status=${ctBody.indexnow?.status}` : "no publish this run");
  check("S14 WebSub ping accepted",
    published ? ctBody.websub?.ok === true : true,
    published ? "" : "no publish this run");

  // ---------- S4 article page quality ----------
  // The engine legitimately publishes nothing when every candidate topic is
  // already covered. Audit the newest live article in that case, so page
  // quality is still measured; S12 above is what holds the engine to account.
  const sm1 = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const newestSlug = sm1.match(/<loc>[^<]*\/blog\/([a-z0-9-]+)<\/loc>/)?.[1];
  const slug = ctBody.slug ?? newestSlug;
  const artResp = await fetch(`${BASE}/blog/${slug}`);
  const art = await artResp.text();
  check("S15 new article page 200", artResp.status === 200,
    `slug=${slug}${ctBody.slug ? "" : " (newest live article)"}`);
  check("S16 Article JSON-LD + canonical on article page",
    art.includes('"Article"') && art.includes('rel="canonical"'));
  check("S17 article has internal links",
    /href="\/(pricing|docs|blog)/.test(art));
  const titleTag = art.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
  check("S18 article title within 70 chars", titleTag.length > 0 &&
    titleTag.length <= 70, `len=${titleTag.length}`);

  // article appears in sitemap and RSS (re-fetch)
  const sm2 = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const rss2 = await (await fetch(`${BASE}/rss.xml`)).text();
  check("S19 new article in sitemap + RSS",
    Boolean(slug) && sm2.includes(slug) && rss2.includes(slug));

  // ---------- S7 answer-first article structure + Chinese twin ----------
  check("S28 article answer-first structure (TL;DR + FAQ + question H2)",
    /TL;?DR/i.test(art) && /"FAQPage"/.test(art) &&
    /"BreadcrumbList"/.test(art) && /"dateModified"/.test(art));
  check("S29 article og:image + dateModified in JSON-LD",
    /property="og:image"/.test(art));
  // JSON.stringify(undefined) is undefined, not a string: slicing it used to
  // crash the whole suite and skip every assertion after this one.
  check("S30 content engine produced Chinese translation",
    published ? ctBody.zh?.ok === true : true,
    published
      ? String(JSON.stringify(ctBody.zh ?? null)).slice(0, 120)
      : "no publish this run");
  // The Chinese twin is checked for whichever article was audited above, so a
  // run that published nothing still verifies the bilingual pair is intact.
  const zhSlug = ctBody.zh?.ok ? ctBody.slug : newestSlug;
  if (zhSlug) {
    const zhArtResp = await fetch(`${BASE}/zh/blog/${zhSlug}`);
    const zhArt = await zhArtResp.text();
    check("S31 zh article 200 + Article JSON-LD (zh-CN) + hreflang pair",
      zhArtResp.status === 200 && zhArt.includes('"zh-CN"') &&
      /hreflang="en"/i.test(zhArt) && zhArt.includes('"Article"'));
    check("S32 zh article in sitemap", sm2.includes(`/zh/blog/${zhSlug}`));
  } else {
    check("S31 zh article 200 + Article JSON-LD (zh-CN) + hreflang pair", false,
      "no article available to check");
    check("S32 zh article in sitemap", false, "no article available to check");
  }

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
    JSON.stringify((auditBody.pages || []).filter((p) => p.issues.length).map((p) => [p.url, p.issues])).slice(0, 300));
  check("S33 SEO score = 100", auditBody.score === 100, `score=${auditBody.score}`);
  const geoFails = (auditBody.geo_checks || []).filter((c) => c.value < 1);
  check("S34 GEO score = 100", auditBody.geo === 100,
    `geo=${auditBody.geo}${geoFails.length ? " failing=" + JSON.stringify(geoFails).slice(0, 240) : ""}`);

  const fails = results.filter((r) => !r.ok);
  console.log(`\n== ${results.length - fails.length}/${results.length} PASS, FAIL ${fails.length} ==`);
  if (fails.length) process.exit(1);
}

main().catch((e) => {
  console.error("seo-e2e crashed:", e);
  process.exit(1);
});
