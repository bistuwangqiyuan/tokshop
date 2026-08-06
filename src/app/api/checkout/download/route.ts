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
  deliveryUrl,
  railAvailable,
  startPayment,
} from "@/lib/checkout";
import { findDownloadProduct, usdToCny } from "@/lib/products";

/**
 * Guest checkout for paid documents. Unlike credits (which need an account to
 * hold a balance), a document only needs somewhere to send the receipt, so an
 * email address is enough. If the buyer later registers with that address the
 * order is bound to their account automatically.
 */
const bodySchema = z.object({
  sku: z.string(),
  email: z.string().email().max(255),
  rail: z.enum(["creem", "xunhupay"]).optional(),
  channel: z.enum(["alipay", "wechat"]).optional(),
  locale: z.enum(["en", "zh"]).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid email address and product are required" },
      { status: 400 }
    );
  }

  const product = findDownloadProduct(parsed.data.sku);
  if (!product) {
    return NextResponse.json({ error: "Unknown product" }, { status: 400 });
  }

  const locale = parsed.data.locale ?? "en";
  const userId = await getSessionUserId();
  let email = parsed.data.email.toLowerCase().trim();
  if (userId) {
    const [user] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (user?.email) email = user.email;
  }

  const rail = parsed.data.rail ?? defaultRail();
  const usesCny = rail === "xunhupay";

  const [order] = await db
    .insert(schema.orders)
    .values({
      userId: userId ?? null,
      email,
      provider: rail ?? "creem",
      kind: "download",
      sku: product.sku,
      amount: product.usd.toFixed(2),
      // Documents grant access, not balance.
      credits: "0.00",
      payCurrency: usesCny ? "CNY" : "USD",
      payAmount: (usesCny ? usdToCny(product.usd) : product.usd).toFixed(2),
      status: "pending",
    })
    .returning({ id: schema.orders.id });

  if (!rail || !railAvailable(rail)) {
    return NextResponse.json({
      orderId: order.id,
      checkoutUrl: null,
      rails: availableRails(),
      note: "Payment provider not configured; order created as pending.",
    });
  }

  const cancelBase = locale === "zh" ? "/zh/downloads" : "/downloads";

  try {
    const started = await startPayment({
      orderId: order.id,
      rail,
      channel: parsed.data.channel,
      usd: product.usd,
      productName: product.i18n.en.title,
      productDescription:
        `${product.i18n.en.title} (v${product.version}). Digital document, ` +
        "delivered instantly as a Markdown download plus an online reader. " +
        "Bilingual English and Chinese. Sold by tokshop.xyz.",
      taxCategory: "ebooks",
      email,
      successUrl: deliveryUrl(order.id, locale),
      cancelUrl: `${appUrl()}${cancelBase}`,
      metadata: {
        orderId: order.id,
        sku: product.sku,
        ...(userId ? { userId } : {}),
      },
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
      checkoutUrl: started.redirectUrl,
      rail,
    });
  } catch (err) {
    await abandonOrder(order.id);
    console.error("download checkout failed", err);
    return NextResponse.json(
      { error: "Payment provider unavailable, please try again" },
      { status: 502 }
    );
  }
}
