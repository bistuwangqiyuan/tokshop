/**
 * Rail-agnostic checkout: create the order first, then hand the customer to the
 * chosen provider's hosted payment page. We never render a payment form
 * ourselves, so no card or wallet credential passes through this codebase.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createCheckout, creemConfigured, getOrCreateProduct } from "@/lib/creem";
import { signToken } from "@/lib/entitlement";
import { SITE_NAME } from "@/lib/site";
import { type Rail, type XunhuChannel, usdToCny } from "@/lib/products";
import { createPayment, xunhupayConfigured } from "@/lib/xunhupay";

export function appUrl(): string {
  return (process.env.APP_URL ?? "https://tokshop.xyz").replace(/\/$/, "");
}

export function railAvailable(rail: Rail): boolean {
  return rail === "creem" ? creemConfigured() : xunhupayConfigured();
}

export function availableRails(): Rail[] {
  return (["creem", "xunhupay"] as Rail[]).filter(railAvailable);
}

/** Pick a working rail when the client did not ask for one. */
export function defaultRail(): Rail | null {
  return availableRails()[0] ?? null;
}

/**
 * Where a provider sends the buyer after payment.
 *
 * It points at a route handler rather than straight at the delivery page,
 * because the handler can set the signed access cookie before anything renders
 * (cookies cannot be written during a server component render).
 *
 * The `t` signature proves the visitor came from a checkout we created, so the
 * page can render before the webhook lands. It is never proof of payment - that
 * is always the order row itself.
 */
export function deliveryUrl(orderId: string, locale: "en" | "zh"): string {
  const token = signToken(orderId);
  return (
    `${appUrl()}/api/downloads/claim` +
    `?order=${orderId}&t=${encodeURIComponent(token)}&lang=${locale}`
  );
}

export type StartedPayment = {
  redirectUrl: string;
  checkoutId: string | null;
  providerOrderId: string | null;
};

export async function startPayment(params: {
  orderId: string;
  rail: Rail;
  channel?: XunhuChannel;
  usd: number;
  productName: string;
  productDescription: string;
  taxCategory: "saas" | "ebook";
  email?: string | null;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<StartedPayment> {
  if (params.rail === "creem") {
    const productId = await getOrCreateProduct({
      name: params.productName,
      description: params.productDescription,
      usd: params.usd,
      taxCategory: params.taxCategory,
    });
    const checkout = await createCheckout({
      productId,
      requestId: params.orderId,
      successUrl: params.successUrl,
      email: params.email ?? undefined,
      metadata: params.metadata,
    });
    return {
      redirectUrl: checkout.checkout_url,
      checkoutId: checkout.id,
      providerOrderId: null,
    };
  }

  const payment = await createPayment({
    orderId: params.orderId,
    cnyAmount: usdToCny(params.usd),
    title: `${SITE_NAME} ${params.productName}`,
    channel: params.channel ?? "alipay",
    notifyUrl: `${appUrl()}/api/webhooks/xunhupay`,
    returnUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
  });
  return {
    redirectUrl: payment.redirectUrl,
    checkoutId: null,
    providerOrderId: payment.openOrderId,
  };
}

/** Mark an order failed when the provider could not be reached at all. */
export async function abandonOrder(orderId: string) {
  await db
    .update(schema.orders)
    .set({ status: "failed" })
    .where(eq(schema.orders.id, orderId));
}
