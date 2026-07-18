import { createHmac, timingSafeEqual } from "crypto";

export function creemBaseUrl(): string {
  return process.env.CREEM_TEST_MODE === "false"
    ? "https://api.creem.io/v1"
    : "https://test-api.creem.io/v1";
}

export function creemConfigured(): boolean {
  return Boolean(process.env.CREEM_API_KEY);
}

async function creemFetch(path: string, init?: RequestInit) {
  const apiKey = process.env.CREEM_API_KEY;
  if (!apiKey) throw new Error("CREEM_API_KEY is not set");
  const res = await fetch(`${creemBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Creem API ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

const productCache = new Map<number, string>();

/**
 * Find or create a one-time "credits pack" product for the given USD amount.
 * Products are cached per serverless instance; duplicates across instances are
 * harmless (checkout still resolves to a valid product).
 */
export async function getOrCreateProduct(amountUsd: number): Promise<string> {
  const cached = productCache.get(amountUsd);
  if (cached) return cached;

  const name = `TokShop Credits $${amountUsd}`;

  const search = await creemFetch(`/products/search?page_size=100`).catch(
    () => null
  );
  const items: Array<{ id: string; name: string }> =
    search?.items ?? search?.data ?? [];
  const found = items.find((p) => p.name === name);
  if (found) {
    productCache.set(amountUsd, found.id);
    return found.id;
  }

  const product = await creemFetch(`/products`, {
    method: "POST",
    body: JSON.stringify({
      name,
      description: `${amountUsd} USD of prepaid API credits on tokshop.xyz. Credits are applied to your account balance immediately after payment.`,
      price: Math.round(amountUsd * 100),
      currency: "USD",
      billing_type: "onetime",
      tax_mode: "inclusive",
      tax_category: "saas",
    }),
  });
  productCache.set(amountUsd, product.id);
  return product.id;
}

export async function createCheckout(params: {
  productId: string;
  requestId: string;
  successUrl: string;
  email?: string;
  metadata: Record<string, string>;
}): Promise<{ id: string; checkout_url: string }> {
  return creemFetch(`/checkouts`, {
    method: "POST",
    body: JSON.stringify({
      product_id: params.productId,
      request_id: params.requestId,
      success_url: params.successUrl,
      ...(params.email ? { customer: { email: params.email } } : {}),
      metadata: params.metadata,
    }),
  });
}

/** HMAC-SHA256 hex digest of the raw body, per Creem webhook docs. */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null
): boolean {
  const secret = process.env.CREEM_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
