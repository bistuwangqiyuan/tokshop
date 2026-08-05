/**
 * One-command go-live after human KYC keys are in the environment.
 *
 * Usage:
 *   CREEM_API_KEY=... CREEM_WEBHOOK_SECRET=... node scripts/payments-golive.mjs
 *   # optional: BASE_URL=https://tokshop.xyz AGENTMAIL_API_KEY=...
 *
 * Steps:
 *   1. Detect test vs live from key prefix / CREEM_TEST_MODE
 *   2. Probe production /api/checkout/options for visible rails
 *   3. Run creem:activate (product upsert + webhook self-test in test mode)
 *   4. Probe /api/health payments block
 *   5. Print the remaining human self-purchase checklist for live
 *
 * Exit codes: 0 ok, 2 missing keys, 3 rail not live on BASE_URL, 4 activate failed
 */
import { spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "https://tokshop.xyz").replace(/\/$/, "");
const KEY = process.env.CREEM_API_KEY ?? "";
const SECRET = process.env.CREEM_WEBHOOK_SECRET ?? "";

function die(code, msg) {
  console.error(msg);
  process.exit(code);
}

async function main() {
  console.log(`# payments-golive — ${BASE} — ${new Date().toISOString()}\n`);

  if (!KEY || !SECRET) {
    die(
      2,
      [
        "Missing CREEM_API_KEY and/or CREEM_WEBHOOK_SECRET.",
        "Human gate (phase 0): finish Creem KYC / Test Mode, then set Vercel env and redeploy.",
        "See PAYMENTS_SETUP.md.",
      ].join("\n")
    );
  }

  const isTest =
    process.env.CREEM_TEST_MODE !== "false" || KEY.startsWith("creem_test_");
  console.log(`Creem mode guess: ${isTest ? "test" : "live"}`);
  if (KEY.startsWith("creem_test_") && process.env.CREEM_TEST_MODE === "false") {
    die(2, "Inconsistent: test key with CREEM_TEST_MODE=false");
  }
  if (!KEY.startsWith("creem_test_") && process.env.CREEM_TEST_MODE !== "false") {
    console.warn(
      "WARN: live-looking key but CREEM_TEST_MODE is not false — production may still hit test-api."
    );
  }

  const options = await (
    await fetch(`${BASE}/api/checkout/options`)
  ).json();
  console.log("Production availableRails:", options.rails ?? []);
  if (!Array.isArray(options.rails) || !options.rails.includes("creem")) {
    die(
      3,
      [
        "Creem rail is not visible on production yet.",
        "Write CREEM_* to Vercel Production, redeploy, then re-run this script.",
        `Got rails=${JSON.stringify(options.rails)}`,
      ].join("\n")
    );
  }

  const health = await (await fetch(`${BASE}/api/health`)).json();
  console.log("Health payments:", health.payments ?? health);

  console.log("\n== creem:activate ==");
  const act = spawnSync(
    process.execPath,
    ["scripts/creem-activate.mjs"],
    {
      stdio: "inherit",
      env: process.env,
      shell: false,
    }
  );
  if (act.status !== 0) {
    die(4, `creem:activate exited ${act.status}`);
  }

  if (isTest && SECRET && !SECRET.includes("SENSITIVE")) {
    console.log("\n== local signed webhook smoke (test only) ==");
    const jarEmail = `golive-${randomUUID().slice(0, 8)}@tokshop-test.xyz`;
    const reg = await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: jarEmail,
        password: `Go-${randomUUID()}`,
      }),
    });
    const cookie = (reg.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(";")[0])
      .join("; ");
    const checkout = await fetch(`${BASE}/api/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ sku: "credits_5", rail: "creem" }),
    });
    const co = await checkout.json().catch(() => ({}));
    if (co.orderId) {
      const event = {
        id: `golive_${randomUUID()}`,
        eventType: "checkout.completed",
        object: { id: `chk_${randomUUID()}`, request_id: co.orderId },
      };
      const body = JSON.stringify(event);
      const sig = createHmac("sha256", SECRET).update(body).digest("hex");
      const wh = await fetch(`${BASE}/api/webhooks/creem`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "creem-signature": sig,
        },
        body,
      });
      console.log("Webhook settle status", wh.status, await wh.text());
    } else {
      console.log("Skip webhook smoke — checkout did not return orderId", co);
    }
  }

  console.log("\n== next human steps ==");
  if (isTest) {
    console.log(
      [
        "1. Pay with a Creem test card on the printed checkout URL from activate.",
        "2. Confirm dashboard balance / download redeem code / receipt email.",
        "3. After Creem live approval: set live key, CREEM_TEST_MODE=false, redeploy, re-run.",
      ].join("\n")
    );
  } else {
    console.log(
      [
        "1. Self-purchase $1 handbook + $1 credits with a real card.",
        "2. Confirm Creem dashboard, TokShop order paid, email receipt.",
        "3. Optional: open XunhuPay and set XUNHU_* for Alipay/WeChat.",
        "4. Tick the checklist in PAYMENTS_SETUP.md.",
      ].join("\n")
    );
  }

  if (!process.env.AGENTMAIL_API_KEY) {
    console.log(
      "\nNOTE: AGENTMAIL_API_KEY unset — receipts degrade to on-site delivery only."
    );
  }

  console.log("\npayments-golive: done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
