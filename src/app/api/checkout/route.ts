import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import {
  abandonOrder,
  appUrl,
  availableRails,
  defaultRail,
  railAvailable,
  startPayment,
} from "@/lib/checkout";
import { hasUsedPack } from "@/lib/orders";
import { CREDIT_PACKS, findCreditPack, usdToCny } from "@/lib/products";

const bodySchema = z
  .object({
    sku: z.string().optional(),
    // Legacy field: the dashboard used to post a bare dollar amount.
    amount: z.number().optional(),
    rail: z.enum(["creem", "xunhupay"]).optional(),
    channel: z.enum(["alipay", "wechat"]).optional(),
    locale: z.enum(["en", "zh"]).optional(),
  })
  .refine((v) => v.sku !== undefined || v.amount !== undefined, {
    message: "sku or amount is required",
  });

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "sku or amount is required" },
      { status: 400 }
    );
  }

  const pack = parsed.data.sku
    ? findCreditPack(parsed.data.sku)
    : CREDIT_PACKS.find((p) => p.usd === parsed.data.amount);
  if (!pack) {
    return NextResponse.json(
      {
        error:
          "Unknown pack; allowed amounts: " +
          CREDIT_PACKS.map((p) => p.usd).join(", "),
      },
      { status: 400 }
    );
  }

  if (pack.oncePerAccount && (await hasUsedPack(userId, pack.sku))) {
    return NextResponse.json(
      {
        error: "starter_pack_used",
        message:
          "The one-time starter pack has already been used on this account. Pick another amount.",
      },
      { status: 409 }
    );
  }

  const [user] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  const rail = parsed.data.rail ?? defaultRail();
  const usesCny = rail === "xunhupay";

  const [order] = await db
    .insert(schema.orders)
    .values({
      userId,
      email: user?.email ?? null,
      provider: rail ?? "creem",
      kind: "credits",
      sku: pack.sku,
      amount: pack.usd.toFixed(2),
      credits: pack.usd.toFixed(2),
      payCurrency: usesCny ? "CNY" : "USD",
      payAmount: (usesCny ? usdToCny(pack.usd) : pack.usd).toFixed(2),
      status: "pending",
    })
    .returning({ id: schema.orders.id });

  // No rail configured yet: the order stays pending and can be settled by hand
  // once an account is live, so the rest of the flow stays testable.
  if (!rail || !railAvailable(rail)) {
    return NextResponse.json({
      orderId: order.id,
      checkoutId: null,
      checkoutUrl: null,
      rails: availableRails(),
      note: "Payment provider not configured; order created as pending.",
    });
  }

  const base = parsed.data.locale === "zh" ? "/zh/dashboard" : "/dashboard";
  try {
    const started = await startPayment({
      orderId: order.id,
      rail,
      channel: parsed.data.channel,
      usd: pack.usd,
      productName: `Credits $${pack.usd}`,
      productDescription: `${pack.usd} USD of prepaid API credits on tokshop.xyz. Credits are applied to your account balance immediately after payment.`,
      taxCategory: "saas",
      email: user?.email,
      successUrl: `${appUrl()}${base}?topup=success&order=${order.id}`,
      cancelUrl: `${appUrl()}${base}`,
      metadata: { userId, orderId: order.id, sku: pack.sku },
    });

    await db
      .update(schema.orders)
      .set({
        checkoutId: started.checkoutId,
        providerOrderId: started.providerOrderId,
      })
      .where(eq(schema.orders.id, order.id));

    return NextResponse.json({
      orderId: order.id,
      checkoutId: started.checkoutId,
      checkoutUrl: started.redirectUrl,
      rail,
    });
  } catch (err) {
    // Never leave a pending order behind a provider that refused the request.
    await abandonOrder(order.id);
    console.error("checkout failed", err);
    return NextResponse.json(
      { error: "Payment provider unavailable, please try again" },
      { status: 502 }
    );
  }
}
