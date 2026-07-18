import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/creem";

type CreemEvent = {
  id: string;
  eventType: string;
  object?: {
    id?: string;
    request_id?: string | null;
    metadata?: Record<string, string> | null;
    order?: { amount?: number; currency?: string } | null;
  };
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("creem-signature");
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: CreemEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!event.id || !event.eventType) {
    return NextResponse.json({ error: "Malformed event" }, { status: 400 });
  }

  // Idempotency layer 1: each event id is processed at most once.
  const inserted = await db
    .insert(schema.webhookEvents)
    .values({
      provider: "creem",
      eventId: event.id,
      eventType: event.eventType,
      payload: rawBody,
    })
    .onConflictDoNothing()
    .returning({ id: schema.webhookEvents.id });
  if (inserted.length === 0) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (event.eventType === "checkout.completed") {
    const orderId =
      event.object?.request_id ?? event.object?.metadata?.orderId ?? null;
    if (!orderId) {
      return NextResponse.json({ error: "Missing order id" }, { status: 400 });
    }

    // Idempotency layer 2: only a pending order can transition to paid.
    const updated = await db
      .update(schema.orders)
      .set({
        status: "paid",
        paidAt: new Date(),
        providerOrderId: event.object?.id ?? null,
      })
      .where(
        and(eq(schema.orders.id, orderId), eq(schema.orders.status, "pending"))
      )
      .returning({
        userId: schema.orders.userId,
        credits: schema.orders.credits,
      });

    if (updated.length > 0) {
      const { userId, credits } = updated[0];
      await db
        .update(schema.users)
        .set({ balance: sql`${schema.users.balance} + ${credits}` })
        .where(eq(schema.users.id, userId));
    }
  }

  return NextResponse.json({ ok: true });
}
