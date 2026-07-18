import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { creemConfigured, createCheckout, getOrCreateProduct } from "@/lib/creem";

const PACKS = [5, 10, 20, 50, 100];

const bodySchema = z.object({
  amount: z
    .number()
    .refine((v) => PACKS.includes(v), { message: "Invalid pack amount" }),
});

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid amount; allowed packs: " + PACKS.join(", ") },
      { status: 400 }
    );
  }
  const amount = parsed.data.amount;

  const [user] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  const [order] = await db
    .insert(schema.orders)
    .values({
      userId,
      amount: amount.toFixed(2),
      credits: amount.toFixed(2),
      status: "pending",
    })
    .returning({ id: schema.orders.id });

  // Creem not configured yet: order stays pending and is settled by webhook
  // once the payment provider account is live. Keeps the flow fully testable.
  if (!creemConfigured()) {
    return NextResponse.json({
      orderId: order.id,
      checkoutId: null,
      checkoutUrl: null,
      note: "Payment provider not configured; order created as pending.",
    });
  }

  const productId = await getOrCreateProduct(amount);
  const appUrl = process.env.APP_URL ?? "https://tokshop.xyz";
  const checkout = await createCheckout({
    productId,
    requestId: order.id,
    successUrl: `${appUrl}/dashboard?topup=success`,
    email: user?.email,
    metadata: { userId, orderId: order.id },
  });

  await db
    .update(schema.orders)
    .set({ checkoutId: checkout.id })
    .where(eq(schema.orders.id, order.id));

  return NextResponse.json({
    orderId: order.id,
    checkoutId: checkout.id,
    checkoutUrl: checkout.checkout_url,
  });
}
