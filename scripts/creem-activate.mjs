// One-shot Creem activation and health check.
//
// Usage:
//   CREEM_API_KEY=creem_test_xxx CREEM_WEBHOOK_SECRET=xxx \
//   BASE_URL=https://tokshop.xyz node scripts/creem-activate.mjs
//
// What it does, in order:
//   1. Probes the Creem API with your key to prove it is valid, and derives the
//      environment from the key prefix.
//   2. Drives the deployed site's own checkout endpoints so that every product
//      is created upstream with the right price and tax category. It never
//      reimplements the catalog: whatever the server sells is what gets built.
//   3. Verifies the webhook secret by posting a signed event to production.
//   4. Prints what is ready and what is still missing.
//
// Safety: a signed settlement event is only simulated in test mode. In live
// mode that would write a paid order nobody paid for, so the script instead
// checks that the endpoint is reachable and rejects a forged signature; real
// settlement is proven by your own small purchase.

import { createHmac, randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "https://tokshop.xyz").replace(/\/$/, "");
const KEY = process.env.CREEM_API_KEY ?? "";
const WEBHOOK_SECRET = process.env.CREEM_WEBHOOK_SECRET ?? "";
const IS_TEST = !KEY.startsWith("creem_") || KEY.startsWith("creem_test_");
const CREEM_API = IS_TEST
  ? "https://test-api.creem.io/v1"
  : "https://api.creem.io/v1";

let failures = 0;
const todo = [];

function ok(label, detail = "") {
  console.log(`  PASS  ${label}${detail ? `  ${detail}` : ""}`);
}
function bad(label, detail = "") {
  failures++;
  console.log(`  FAIL  ${label}${detail ? `  ${detail}` : ""}`);
}
function skip(label, why) {
  console.log(`  SKIP  ${label}  ${why}`);
}

async function json(res) {
  return res.json().catch(() => ({}));
}

/** Step 1: is the key real, and which environment does it belong to? */
async function probeKey() {
  console.log(`\n[1] Creem API key (${IS_TEST ? "TEST" : "LIVE"} -> ${CREEM_API})`);
  if (!KEY) {
    bad("CREEM_API_KEY is not set", "nothing to activate");
    todo.push("Set CREEM_API_KEY to the key from Creem -> Developers.");
    return false;
  }
  if (!KEY.startsWith("creem_")) {
    console.log(
      "  NOTE  key does not start with creem_; assuming test environment"
    );
  }
  const res = await fetch(`${CREEM_API}/products/search?page_size=100`, {
    headers: { "x-api-key": KEY },
  });
  if (!res.ok) {
    bad(
      "key rejected by Creem",
      `HTTP ${res.status} ${(await res.text()).slice(0, 160)}`
    );
    todo.push(
      "Check the key was copied from the right environment: the Test Mode " +
        "toggle at the bottom of the Creem sidebar switches which key is shown."
    );
    return false;
  }
  const data = await json(res);
  const items = data.items ?? data.data ?? [];
  ok("key accepted", `${items.length} product(s) already on the account`);
  return true;
}

/**
 * Step 2: make the deployed server build every product upstream.
 *
 * Driving the real endpoints (rather than calling Creem directly) is the point:
 * it proves the deployed instance has a working key, and it creates each
 * product with exactly the name, price and tax category the server will use at
 * a customer's first checkout.
 */
async function warmProducts() {
  console.log(`\n[2] Products, via ${BASE}`);

  const optionsRes = await fetch(`${BASE}/api/checkout/options`);
  const options = await json(optionsRes);
  const packs = options.packs ?? [];
  if (!optionsRes.ok || packs.length === 0) {
    bad("could not read the credit pack catalog", `HTTP ${optionsRes.status}`);
    return { checkoutUrl: null, orderId: null };
  }
  ok("catalog readable", `${packs.length} credit packs`);

  if (!(options.rails ?? []).includes("creem")) {
    bad(
      "the deployed site has no Creem rail",
      `rails=${JSON.stringify(options.rails ?? [])}`
    );
    todo.push(
      "Write CREEM_API_KEY and CREEM_WEBHOOK_SECRET into Vercel (Production) " +
        "and redeploy. The key is valid, the deployment just does not have it."
    );
    return { checkoutUrl: null, orderId: null };
  }
  ok("deployed site reports the Creem rail as live");

  // The document product is guest checkout, so it needs no account at all.
  const email = `creem-activate-${randomUUID().slice(0, 8)}@tokshop-test.xyz`;
  const dlRes = await fetch(`${BASE}/api/checkout/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sku: "handbook_v1", email, rail: "creem" }),
  });
  const dl = await json(dlRes);
  if (!dlRes.ok || !dl.checkoutUrl) {
    bad(
      "document checkout could not be created",
      `HTTP ${dlRes.status} ${JSON.stringify(dl).slice(0, 200)}`
    );
    return { checkoutUrl: null, orderId: dl.orderId ?? null };
  }
  ok("document product built and checkout created (tax category: ebook)");

  // Environment mismatch is silent and expensive: a test key with
  // CREEM_TEST_MODE=false means every real payment fails. The hosted checkout
  // URL is the only outside signal of which environment the server used.
  const urlLooksTest = /\/test\//.test(dl.checkoutUrl);
  if (urlLooksTest !== IS_TEST) {
    bad(
      "environment mismatch between your key and the deployment",
      `local key=${IS_TEST ? "test" : "live"}, checkout url=${
        urlLooksTest ? "test" : "live"
      }`
    );
    todo.push(
      "Align CREEM_TEST_MODE with the key: unset or true for a creem_test_ " +
        "key, exactly false for a live key."
    );
  } else {
    ok("environment consistent", IS_TEST ? "test" : "live");
  }

  // Credit packs need a session, so use a throwaway account. Warming every
  // tier now means no customer is ever the first to create a product.
  const jar = new Map();
  const absorb = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1));
    }
  };
  const cookie = () =>
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: `Act-${randomUUID()}` }),
  });
  absorb(regRes);
  if (regRes.status !== 201) {
    bad("could not create a throwaway account to warm credit packs",
      `HTTP ${regRes.status}`);
    return { checkoutUrl: dl.checkoutUrl, orderId: dl.orderId };
  }

  let built = 0;
  for (const pack of packs) {
    const res = await fetch(`${BASE}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie() },
      body: JSON.stringify({ sku: pack.sku, rail: "creem" }),
    });
    const body = await json(res);
    if (res.ok && body.checkoutUrl) built++;
    else
      console.log(
        `        ${pack.sku}: HTTP ${res.status} ${JSON.stringify(body).slice(0, 120)}`
      );
  }
  if (built === packs.length)
    ok("every credit pack built upstream (tax category: saas)", `${built} tiers`);
  else bad("some credit packs failed", `${built}/${packs.length} built`);

  console.log(`\n  Open this to pay the 1 USD document by hand:\n  ${dl.checkoutUrl}`);
  return { checkoutUrl: dl.checkoutUrl, orderId: dl.orderId };
}

/** Step 3: does the deployed webhook secret match the one Creem will sign with? */
async function probeWebhook(orderId) {
  console.log(`\n[3] Webhook ${BASE}/api/webhooks/creem`);

  const forged = await fetch(`${BASE}/api/webhooks/creem`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "creem-signature": "0".repeat(64) },
    body: JSON.stringify({ id: `evt_${randomUUID()}`, eventType: "checkout.completed" }),
  });
  if (forged.status === 401) ok("reachable, and a forged signature is rejected");
  else bad("a forged signature was not rejected", `HTTP ${forged.status}`);

  if (!WEBHOOK_SECRET) {
    skip("signed settlement", "CREEM_WEBHOOK_SECRET not set locally");
    todo.push(
      "To verify the secret end to end, re-run with CREEM_WEBHOOK_SECRET set " +
        "to the value shown when you created the webhook."
    );
    return;
  }
  if (!IS_TEST) {
    skip(
      "signed settlement",
      "live mode: simulating one would record a paid order nobody paid for"
    );
    todo.push(
      "In live mode, prove settlement by buying the 1 USD document yourself " +
        "with a real card, then confirm the order shows as paid."
    );
    return;
  }
  if (!orderId) {
    skip("signed settlement", "no test order was created above");
    return;
  }

  const send = () => {
    const raw = JSON.stringify({
      id: `evt_activate_${randomUUID().slice(0, 12)}`,
      eventType: "checkout.completed",
      object: {
        id: `ch_activate_${randomUUID().slice(0, 12)}`,
        request_id: orderId,
        metadata: { orderId },
      },
    });
    return fetch(`${BASE}/api/webhooks/creem`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "creem-signature": createHmac("sha256", WEBHOOK_SECRET)
          .update(raw)
          .digest("hex"),
      },
      body: raw,
    });
  };

  const first = await json(await send());
  if (first.settled === true) ok("signed event accepted and order settled");
  else bad("signed event did not settle the order", JSON.stringify(first));

  // A second event with a different id must not credit the same order twice.
  const second = await json(await send());
  if (second.settled === false)
    ok("replay is idempotent", "already-paid order not settled twice");
  else bad("replay was not idempotent", JSON.stringify(second));
}

async function main() {
  console.log(`Creem activation - ${BASE} - ${new Date().toISOString()}`);
  const keyOk = await probeKey();
  const { orderId } = keyOk
    ? await warmProducts()
    : { checkoutUrl: null, orderId: null };
  if (keyOk) await probeWebhook(orderId);

  console.log(
    `\n===== ${failures === 0 ? "READY" : `${failures} check(s) failed`} =====`
  );
  if (todo.length) {
    console.log("\nNext:");
    for (const t of todo) console.log(` - ${t}`);
  }
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error("activation crashed:", e);
  process.exit(1);
});
