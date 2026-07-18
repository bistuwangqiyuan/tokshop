// Produces a reproducible billing evidence sample against the live deployment.
// Usage: BASE_URL=https://tokshop.xyz CREEM_WEBHOOK_SECRET=... node scripts/evidence.mjs
import { createHmac, randomUUID } from "crypto";

const BASE = (process.env.BASE_URL ?? "https://tokshop.xyz").replace(/\/$/, "");
const SECRET = process.env.CREEM_WEBHOOK_SECRET;

const jar = new Map();
async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
      ...(opts.headers ?? {}),
    },
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1));
  }
  return res;
}

const email = `evidence-${randomUUID().slice(0, 8)}@tokshop-test.xyz`;
await api("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ email, password: "Evidence!Pass123" }),
});
const { key } = await (
  await api("/api/keys", { method: "POST", body: JSON.stringify({ name: "evidence" }) })
).json();

const { orderId } = await (
  await api("/api/checkout", { method: "POST", body: JSON.stringify({ amount: 5 }) })
).json();
const event = {
  id: `evt_evidence_${randomUUID().slice(0, 10)}`,
  eventType: "checkout.completed",
  object: { id: `ch_evidence`, request_id: orderId, metadata: { orderId } },
};
const raw = JSON.stringify(event);
await fetch(`${BASE}/api/webhooks/creem`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "creem-signature": createHmac("sha256", SECRET).update(raw).digest("hex"),
  },
  body: raw,
});

const models = (await (await fetch(`${BASE}/v1/models`)).json()).data;
const model = models[0];
const before = Number((await (await api("/api/auth/me")).json()).user.balance);

const chat = await fetch(`${BASE}/v1/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
  body: JSON.stringify({
    model: model.id,
    messages: [{ role: "user", content: "Reply with exactly: pong" }],
    max_tokens: 20,
  }),
});
const data = await chat.json();
const after = Number((await (await api("/api/auth/me")).json()).user.balance);

const cost =
  (data.usage.prompt_tokens * model.pricing.input_per_million_tokens +
    data.usage.completion_tokens * model.pricing.output_per_million_tokens) /
  1e6;

console.log(
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      base_url: BASE,
      account: email,
      model: model.id,
      pricing_usd_per_1m: model.pricing,
      response_status: chat.status,
      response_content: data.choices?.[0]?.message?.content,
      usage: data.usage,
      balance_before_usd: before,
      balance_after_usd: after,
      deducted_usd: Number((before - after).toFixed(8)),
      recomputed_cost_usd: Number(cost.toFixed(8)),
      billing_exact_match: Math.abs(before - after - cost) < 1e-6,
    },
    null,
    2
  )
);
