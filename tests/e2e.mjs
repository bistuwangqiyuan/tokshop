// End-to-end test suite against a live deployment.
// Usage: BASE_URL=https://tokshop.xyz CREEM_WEBHOOK_SECRET=... node tests/e2e.mjs
import { createHmac, randomUUID } from "crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const WEBHOOK_SECRET = process.env.CREEM_WEBHOOK_SECRET ?? "";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push({ name, detail });
    console.log(`  FAIL  ${name}  ${detail}`);
  }
}

function cookieJar() {
  const jar = new Map();
  return {
    absorb(res) {
      const setCookies = res.headers.getSetCookie?.() ?? [];
      for (const c of setCookies) {
        const [pair] = c.split(";");
        const idx = pair.indexOf("=");
        jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1));
      }
    },
    header() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

async function api(jar, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(jar ? { Cookie: jar.header() } : {}),
      ...(opts.headers ?? {}),
    },
  });
  jar?.absorb(res);
  return res;
}

async function main() {
  console.log(`E2E against ${BASE}\n`);
  const email = `e2e-${randomUUID().slice(0, 8)}@tokshop-test.xyz`;
  const password = "Str0ngPass!123";
  const jar = cookieJar();

  // T10: production HTTPS reachable + health
  {
    const res = await fetch(`${BASE}/api/health`);
    const data = await res.json().catch(() => ({}));
    check("T10 health endpoint (db up)", res.ok && data.db === "up", JSON.stringify(data));
    const home = await fetch(BASE);
    check("T10 homepage 200", home.status === 200, `status=${home.status}`);
  }

  // T1: register / login / session
  {
    const reg = await api(jar, "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    check("T1 register 201", reg.status === 201, `status=${reg.status}`);
    const me1 = await api(jar, "/api/auth/me");
    const me1data = await me1.json().catch(() => ({}));
    check(
      "T1 session persists (me)",
      me1.status === 200 && me1data.user?.email === email,
      JSON.stringify(me1data)
    );
    const badLogin = await api(cookieJar(), "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: "wrong-password" }),
    });
    check("T1 wrong password rejected", badLogin.status === 401, `status=${badLogin.status}`);
    const jar2 = cookieJar();
    const login = await api(jar2, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    check("T1 login 200", login.status === 200, `status=${login.status}`);
  }

  // T2: API key create / list / revoke (revoke tested later after use)
  let apiKey = "";
  let apiKeyId = "";
  {
    const create = await api(jar, "/api/keys", {
      method: "POST",
      body: JSON.stringify({ name: "e2e" }),
    });
    const data = await create.json().catch(() => ({}));
    apiKey = data.key ?? "";
    apiKeyId = data.id ?? "";
    check(
      "T2 create key returns sk-tok-",
      create.status === 201 && apiKey.startsWith("sk-tok-"),
      JSON.stringify(data)
    );
    const list = await api(jar, "/api/keys");
    const listData = await list.json().catch(() => ({}));
    check(
      "T2 key listed",
      list.status === 200 && (listData.keys ?? []).some((k) => k.id === apiKeyId),
      JSON.stringify(listData)
    );
  }

  // T3: /v1/models public with pricing
  let models = [];
  {
    const res = await fetch(`${BASE}/v1/models`);
    const data = await res.json().catch(() => ({}));
    models = data.data ?? [];
    check(
      "T3 /v1/models returns priced models",
      res.status === 200 &&
        models.length > 0 &&
        models.every(
          (m) =>
            m.pricing?.input_per_million_tokens > 0 &&
            m.pricing?.output_per_million_tokens > 0
        ),
      `count=${models.length}`
    );
  }
  const model = models[0];

  // T6: insufficient balance -> 402
  {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model?.id ?? "deepseek-v3.2",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    check(
      "T6 zero balance rejected 402",
      res.status === 402 && data.error?.code === "insufficient_balance",
      `status=${res.status}`
    );
  }

  // T7: invalid key -> 401
  {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-tok-invalid0000000000000000000000000000000000000000",
      },
      body: JSON.stringify({
        model: model?.id ?? "deepseek-v3.2",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    check("T7 invalid key rejected 401", res.status === 401, `status=${res.status}`);
    const noKey = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "x", messages: [] }),
    });
    check("T7 missing key rejected 401", noKey.status === 401, `status=${noKey.status}`);
  }

  // T8: simulated Creem webhook -> balance credited, idempotent on replay
  let creditedBalance = 0;
  {
    if (!WEBHOOK_SECRET) {
      check("T8 webhook secret provided to test runner", false, "CREEM_WEBHOOK_SECRET missing");
    } else {
      const checkoutRes = await api(jar, "/api/checkout", {
        method: "POST",
        body: JSON.stringify({ amount: 5 }),
      });
      // Without a Creem account the checkout endpoint returns 503; create the
      // order directly through the webhook path in that case is impossible, so
      // we accept either flow: if 503, we simulate the full webhook with a
      // pre-created pending order via the register+checkout API being down.
      let orderId = null;
      if (checkoutRes.status === 200) {
        orderId = (await checkoutRes.json()).orderId;
      }

      if (!orderId) {
        // fall back: webhook with metadata-only path requires a real order; mark expected failure
        check(
          "T8 checkout order created",
          false,
          `checkout status=${checkoutRes.status} (Creem not configured)`
        );
      } else {
        check("T8 checkout order created", true);
        const event = {
          id: `evt_e2e_${randomUUID().slice(0, 12)}`,
          eventType: "checkout.completed",
          object: {
            id: `ch_e2e_${randomUUID().slice(0, 12)}`,
            request_id: orderId,
            order: { amount: 500, currency: "USD" },
            metadata: { orderId },
          },
        };
        const raw = JSON.stringify(event);
        const sig = createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");

        const badSig = await fetch(`${BASE}/api/webhooks/creem`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "creem-signature": "deadbeef" },
          body: raw,
        });
        check("T8 invalid signature rejected 401", badSig.status === 401, `status=${badSig.status}`);

        const hook = await fetch(`${BASE}/api/webhooks/creem`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "creem-signature": sig },
          body: raw,
        });
        check("T8 webhook accepted", hook.status === 200, `status=${hook.status}`);

        const me = await (await api(jar, "/api/auth/me")).json();
        creditedBalance = Number(me.user?.balance ?? 0);
        check("T8 balance credited $5", Math.abs(creditedBalance - 5) < 1e-9, `balance=${creditedBalance}`);

        const replay = await fetch(`${BASE}/api/webhooks/creem`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "creem-signature": sig },
          body: raw,
        });
        const replayData = await replay.json().catch(() => ({}));
        const me2 = await (await api(jar, "/api/auth/me")).json();
        check(
          "T8 replay is idempotent",
          replay.status === 200 &&
            replayData.duplicate === true &&
            Math.abs(Number(me2.user.balance) - creditedBalance) < 1e-9,
          `balance=${me2.user?.balance}`
        );

        // second event id for the same (now paid) order must also not credit
        const event2 = { ...event, id: `evt_e2e_${randomUUID().slice(0, 12)}` };
        const raw2 = JSON.stringify(event2);
        const sig2 = createHmac("sha256", WEBHOOK_SECRET).update(raw2).digest("hex");
        await fetch(`${BASE}/api/webhooks/creem`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "creem-signature": sig2 },
          body: raw2,
        });
        const me3 = await (await api(jar, "/api/auth/me")).json();
        check(
          "T8 paid order cannot be re-credited",
          Math.abs(Number(me3.user.balance) - creditedBalance) < 1e-9,
          `balance=${me3.user?.balance}`
        );
      }
    }
  }

  // T4: non-streaming chat completion with real upstream, verifiable billing
  let expectedSpend = 0;
  let callCount = 0;
  {
    const before = Number((await (await api(jar, "/api/auth/me")).json()).user.balance);
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: "user", content: "Reply with exactly: pong" }],
        max_tokens: 30,
      }),
    });
    const data = await res.json().catch(() => ({}));
    const usage = data.usage;
    check(
      "T4 non-stream 200 with usage",
      res.status === 200 && usage?.prompt_tokens > 0 && usage?.completion_tokens > 0,
      `status=${res.status} usage=${JSON.stringify(usage)}`
    );
    check("T4 model id rewritten to public slug", data.model === model.id, `model=${data.model}`);
    if (res.status === 200) {
      callCount++;
      const cost =
        (usage.prompt_tokens * model.pricing.input_per_million_tokens +
          usage.completion_tokens * model.pricing.output_per_million_tokens) /
        1e6;
      expectedSpend += cost;
      const after = Number((await (await api(jar, "/api/auth/me")).json()).user.balance);
      check(
        "T4 balance deducted exactly per price sheet",
        Math.abs(before - after - cost) < 1e-6,
        `before=${before} after=${after} expectedCost=${cost.toFixed(8)}`
      );
    }
  }

  // T5: streaming chat completion, SSE + billing settle
  {
    const before = Number((await (await api(jar, "/api/auth/me")).json()).user.balance);
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: "user", content: "Count from 1 to 5, digits only." }],
        max_tokens: 50,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
    check(
      "T5 stream 200 SSE content-type",
      res.status === 200 && (res.headers.get("content-type") ?? "").includes("text/event-stream"),
      `status=${res.status} ct=${res.headers.get("content-type")}`
    );
    let sawChunk = false;
    let sawDone = false;
    let streamUsage = null;
    const text = await res.text();
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        sawDone = true;
        continue;
      }
      try {
        const obj = JSON.parse(payload);
        if (obj.choices?.[0]?.delta) sawChunk = true;
        if (obj.usage) streamUsage = obj.usage;
      } catch {}
    }
    check("T5 received delta chunks and [DONE]", sawChunk && sawDone, `chunk=${sawChunk} done=${sawDone}`);
    check(
      "T5 usage chunk present (stream_options)",
      streamUsage?.prompt_tokens > 0 && streamUsage?.completion_tokens > 0,
      JSON.stringify(streamUsage)
    );
    if (streamUsage) {
      callCount++;
      const cost =
        (streamUsage.prompt_tokens * model.pricing.input_per_million_tokens +
          streamUsage.completion_tokens * model.pricing.output_per_million_tokens) /
        1e6;
      expectedSpend += cost;
      // settle happens in stream flush; poll briefly
      let after = before;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        after = Number((await (await api(jar, "/api/auth/me")).json()).user.balance);
        if (Math.abs(before - after - cost) < 1e-6) break;
      }
      check(
        "T5 stream billed correctly",
        Math.abs(before - after - cost) < 1e-6,
        `before=${before} after=${after} expectedCost=${cost.toFixed(8)}`
      );
    }
  }

  // T9: usage logs match reality
  {
    const res = await api(jar, "/api/usage");
    const data = await res.json().catch(() => ({}));
    const totals = data.totals ?? {};
    check(
      "T9 usage log count matches calls",
      res.status === 200 && totals.totalCalls === callCount,
      `logged=${totals.totalCalls} actual=${callCount}`
    );
    check(
      "T9 total cost matches expected spend",
      Math.abs(Number(totals.totalCost) - expectedSpend) < 1e-6,
      `logged=${totals.totalCost} expected=${expectedSpend.toFixed(8)}`
    );
  }

  // T2b: revoke key then rejected
  {
    const del = await api(jar, `/api/keys/${apiKeyId}`, { method: "DELETE" });
    check("T2 revoke key", del.status === 200, `status=${del.status}`);
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    check("T2 revoked key rejected 401", res.status === 401, `status=${res.status}`);
  }

  // ---------------------------------------------------------------------------
  // Payments: starter pack cap, guest downloads, entitlements, reversals.
  // Deliberately after T9 so the exact-balance assertions above are untouched.
  // ---------------------------------------------------------------------------

  const signEvent = (event) => {
    const raw = JSON.stringify(event);
    return {
      raw,
      sig: createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex"),
    };
  };
  const settleViaCreem = async (orderId) => {
    const { raw, sig } = signEvent({
      id: `evt_e2e_${randomUUID().slice(0, 12)}`,
      eventType: "checkout.completed",
      object: {
        id: `ch_e2e_${randomUUID().slice(0, 12)}`,
        request_id: orderId,
        metadata: { orderId },
      },
    });
    return fetch(`${BASE}/api/webhooks/creem`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "creem-signature": sig },
      body: raw,
    });
  };

  // T11: the $1 starter pack is one per account
  {
    const first = await api(jar, "/api/checkout", {
      method: "POST",
      body: JSON.stringify({ sku: "credits_1" }),
    });
    const firstData = await first.json().catch(() => ({}));
    check(
      "T11 starter pack order created",
      first.status === 200 && Boolean(firstData.orderId),
      `status=${first.status} ${JSON.stringify(firstData)}`
    );

    if (firstData.orderId && WEBHOOK_SECRET) {
      const before = Number((await (await api(jar, "/api/auth/me")).json()).user.balance);
      const hook = await settleViaCreem(firstData.orderId);
      check("T11 starter pack settles", hook.status === 200, `status=${hook.status}`);
      const after = Number((await (await api(jar, "/api/auth/me")).json()).user.balance);
      check(
        "T11 starter pack credits exactly $1",
        Math.abs(after - before - 1) < 1e-9,
        `before=${before} after=${after}`
      );

      const second = await api(jar, "/api/checkout", {
        method: "POST",
        body: JSON.stringify({ sku: "credits_1" }),
      });
      const secondData = await second.json().catch(() => ({}));
      check(
        "T11 second starter pack refused 409",
        second.status === 409 && secondData.error === "starter_pack_used",
        `status=${second.status} ${JSON.stringify(secondData)}`
      );

      const other = await api(jar, "/api/checkout", {
        method: "POST",
        body: JSON.stringify({ sku: "credits_5" }),
      });
      check(
        "T11 other packs still available after starter used",
        other.status === 200,
        `status=${other.status}`
      );
    }

    const badSku = await api(jar, "/api/checkout", {
      method: "POST",
      body: JSON.stringify({ sku: "credits_999" }),
    });
    check("T11 unknown sku rejected 400", badSku.status === 400, `status=${badSku.status}`);
  }

  // T12: guest download checkout needs no account
  const guestEmail = `e2e-guest-${randomUUID().slice(0, 8)}@tokshop-test.xyz`;
  let guestOrderId = null;
  {
    const res = await fetch(`${BASE}/api/checkout/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: "handbook_v1", email: guestEmail }),
    });
    const data = await res.json().catch(() => ({}));
    guestOrderId = data.orderId ?? null;
    check(
      "T12 guest download order created without a session",
      res.status === 200 && Boolean(guestOrderId),
      `status=${res.status} ${JSON.stringify(data)}`
    );

    const noEmail = await fetch(`${BASE}/api/checkout/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: "handbook_v1", email: "not-an-email" }),
    });
    check("T12 invalid email rejected 400", noEmail.status === 400, `status=${noEmail.status}`);

    const badProduct = await fetch(`${BASE}/api/checkout/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: "no_such_doc", email: guestEmail }),
    });
    check("T12 unknown product rejected 400", badProduct.status === 400, `status=${badProduct.status}`);
  }

  // T13: an unpaid or absent purchase cannot read the document
  {
    const anon = await fetch(`${BASE}/api/downloads/handbook_v1`);
    check("T13 download without entitlement 401", anon.status === 401, `status=${anon.status}`);

    const badCode = await fetch(`${BASE}/api/downloads/handbook_v1?code=TSK-ZZZZ-ZZZZ-ZZZZ`);
    check("T13 bogus redeem code 401", badCode.status === 401, `status=${badCode.status}`);

    // Paid for, but by a different account: the logged-in buyer of credits only.
    const asCreditsUser = await api(jar, "/api/downloads/handbook_v1");
    check(
      "T13 credits-only account cannot read a document",
      asCreditsUser.status === 401,
      `status=${asCreditsUser.status}`
    );

    const redeemBad = await fetch(`${BASE}/api/downloads/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "TSK-ZZZZ-ZZZZ-ZZZZ" }),
    });
    check("T13 unknown redeem code 404", redeemBad.status === 404, `status=${redeemBad.status}`);
  }

  // T14: settle the guest order, claim it by registering, then read the document
  if (guestOrderId && WEBHOOK_SECRET) {
    const hook = await settleViaCreem(guestOrderId);
    check("T14 guest download settles", hook.status === 200, `status=${hook.status}`);

    const guestJar = cookieJar();
    const reg = await api(guestJar, "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: guestEmail, password: "Str0ngPass!123" }),
    });
    const regData = await reg.json().catch(() => ({}));
    check(
      "T14 registering with the buyer email claims the guest order",
      reg.status === 201 && regData.claimedOrders >= 1,
      `status=${reg.status} claimed=${regData.claimedOrders}`
    );

    const mine = await api(guestJar, "/api/downloads/mine");
    const mineData = await mine.json().catch(() => ({}));
    const owned = (mineData.downloads ?? [])[0];
    check(
      "T14 claimed download appears in the dashboard",
      mine.status === 200 && owned?.sku === "handbook_v1",
      JSON.stringify(mineData)
    );
    check(
      "T14 redeem code issued on settlement",
      typeof owned?.redeemCode === "string" && owned.redeemCode.startsWith("TSK-"),
      `code=${owned?.redeemCode}`
    );

    const asOwner = await api(guestJar, "/api/downloads/handbook_v1");
    const body = await asOwner.text();
    check(
      "T14 owner downloads the document",
      asOwner.status === 200 &&
        (asOwner.headers.get("content-disposition") ?? "").includes("attachment") &&
        body.includes("# The Open-Model API Handbook"),
      `status=${asOwner.status} bytes=${body.length}`
    );
    check(
      "T14 live price appendix substituted",
      !body.includes("{{PRICE_TABLE}}"),
      "placeholder left in delivered file"
    );

    const zh = await api(guestJar, "/api/downloads/handbook_v1?lang=zh");
    const zhBody = await zh.text();
    check(
      "T14 Chinese edition delivered",
      zh.status === 200 && zhBody.includes("开源大模型 API 选型与成本优化实战手册"),
      `status=${zh.status} bytes=${zhBody.length}`
    );

    if (owned?.redeemCode) {
      const codeJar = cookieJar();
      const redeem = await api(codeJar, "/api/downloads/redeem", {
        method: "POST",
        body: JSON.stringify({ code: owned.redeemCode }),
      });
      check("T14 redeem code unlocks access", redeem.status === 200, `status=${redeem.status}`);
      const viaCookie = await api(codeJar, "/api/downloads/handbook_v1");
      check(
        "T14 access cookie grants download without a session",
        viaCookie.status === 200,
        `status=${viaCookie.status}`
      );
      const viaCodeOnly = await fetch(
        `${BASE}/api/downloads/handbook_v1?code=${encodeURIComponent(owned.redeemCode)}`
      );
      check(
        "T14 redeem code alone grants download",
        viaCodeOnly.status === 200,
        `status=${viaCodeOnly.status}`
      );
    }
  }

  // T15: XunhuPay notify rejects anything it cannot verify
  {
    const res = await fetch(`${BASE}/api/webhooks/xunhupay`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        trade_order_id: randomUUID().replace(/-/g, ""),
        total_fee: "7.30",
        status: "OD",
        hash: "0".repeat(32),
      }),
    });
    const text = await res.text();
    check(
      "T15 xunhupay bad signature rejected 401",
      res.status === 401 && text !== "success",
      `status=${res.status} body=${text}`
    );

    const noOrder = await fetch(`${BASE}/api/webhooks/xunhupay`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ total_fee: "7.30" }),
    });
    check(
      "T15 xunhupay unsigned callback never returns success",
      noOrder.status !== 200,
      `status=${noOrder.status}`
    );
  }

  // T16: a refund takes the credits back
  if (WEBHOOK_SECRET) {
    const order = await api(jar, "/api/checkout", {
      method: "POST",
      body: JSON.stringify({ sku: "credits_5" }),
    });
    const orderData = await order.json().catch(() => ({}));
    if (orderData.orderId) {
      await settleViaCreem(orderData.orderId);
      const credited = Number((await (await api(jar, "/api/auth/me")).json()).user.balance);

      const { raw, sig } = signEvent({
        id: `evt_e2e_${randomUUID().slice(0, 12)}`,
        eventType: "refund.created",
        object: {
          id: `rf_e2e_${randomUUID().slice(0, 12)}`,
          request_id: orderData.orderId,
          metadata: { orderId: orderData.orderId },
        },
      });
      const refund = await fetch(`${BASE}/api/webhooks/creem`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "creem-signature": sig },
        body: raw,
      });
      const refundData = await refund.json().catch(() => ({}));
      check(
        "T16 refund event reverses the order",
        refund.status === 200 && refundData.reversed === true,
        `status=${refund.status} ${JSON.stringify(refundData)}`
      );
      const afterRefund = Number((await (await api(jar, "/api/auth/me")).json()).user.balance);
      check(
        "T16 refunded credits removed from balance",
        Math.abs(credited - afterRefund - 5) < 1e-9,
        `credited=${credited} afterRefund=${afterRefund}`
      );
    }
  }

  // T17: public health exposes payment rail booleans (no secrets)
  {
    const res = await fetch(`${BASE}/api/health`);
    const data = await res.json().catch(() => ({}));
    check(
      "T17 health exposes payments.rails array",
      res.ok && Array.isArray(data.payments?.rails),
      JSON.stringify(data.payments)
    );
    check(
      "T17 health exposes payments.mail boolean",
      typeof data.payments?.mail === "boolean",
      JSON.stringify(data.payments)
    );
    const opts = await (await fetch(`${BASE}/api/checkout/options`)).json();
    check(
      "T17 checkout options rails matches health",
      Array.isArray(opts.rails) &&
        JSON.stringify([...opts.rails].sort()) ===
          JSON.stringify([...data.payments.rails].sort()),
      `opts=${JSON.stringify(opts.rails)} health=${JSON.stringify(data.payments.rails)}`
    );
  }

  // T18: AgentMail webhook rejects forged signatures (same posture as Creem)
  {
    const forged = await fetch(`${BASE}/api/webhooks/agentmail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": "msg_forged",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,not-a-real-signature",
      },
      body: JSON.stringify({
        event_type: "message.received",
        event_id: `e2e_${randomUUID()}`,
        message: { message_id: "m1", subject: "hi", text: "hello" },
      }),
    });
    check(
      "T18 agentmail forged signature rejected",
      forged.status === 401,
      `status=${forged.status}`
    );
  }

  console.log(`\n===== ${passed} passed, ${failed} failed =====`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(` - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
