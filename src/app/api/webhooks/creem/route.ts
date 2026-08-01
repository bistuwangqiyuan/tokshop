import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/creem";
import { reverseOrder, settleOrder } from "@/lib/orders";

type CreemEvent = {
  id: string;
  eventType: string;
  object?: {
    id?: string;
    request_id?: string | null;
    metadata?: Record<string, string> | null;
    order?: {
      id?: string;
      request_id?: string | null;
      metadata?: Record<string, string> | null;
      amount?: number;
      currency?: string;
    } | null;
  };
};

/** Grants access or credits. */
const PAID_EVENTS = new Set(["checkout.completed"]);

/** Takes it back. Creem also fires dispute events, which we treat the same. */
const REVERSAL_EVENTS = new Set([
  "refund.created",
  "dispute.created",
  "dispute.lost",
]);

/**
 * Creem does not put the order reference in the same place for every event, so
 * look through the shapes we know about rather than assuming one.
 */
function extractOrderId(event: CreemEvent): string | null {
  const o = event.object;
  return (
    o?.request_id ??
    o?.metadata?.orderId ??
    o?.order?.request_id ??
    o?.order?.metadata?.orderId ??
    null
  );
}

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

  if (PAID_EVENTS.has(event.eventType)) {
    const orderId = extractOrderId(event);
    if (!orderId) {
      return NextResponse.json({ error: "Missing order id" }, { status: 400 });
    }
    // Idempotency layer 2: settleOrder only acts on a pending order, and does
    // the status flip and the balance credit in one atomic statement.
    const settled = await settleOrder({
      orderId,
      providerOrderId: event.object?.id ?? null,
    });
    return NextResponse.json({ ok: true, settled: settled !== null });
  }

  if (REVERSAL_EVENTS.has(event.eventType)) {
    const orderId = extractOrderId(event);
    if (!orderId) {
      return NextResponse.json({ error: "Missing order id" }, { status: 400 });
    }
    const reversed = await reverseOrder(orderId);
    return NextResponse.json({ ok: true, reversed });
  }

  return NextResponse.json({ ok: true, ignored: event.eventType });
}
