import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { db, schema } from "@/lib/db";
import { replyMail, verifyAgentMailSignature } from "@/lib/mail";
import { lookupSupportMessage } from "@/lib/support";

type AgentMailEvent = {
  event_type?: string;
  event_id?: string;
  message?: {
    message_id?: string;
    subject?: string;
    text?: string;
    preview?: string;
    from?: string;
  };
};

/**
 * Inbound support mail → automatic order-status reply when an order id or
 * redeem code is present; otherwise a short handoff that a human still reads.
 *
 * Configure in AgentMail console:
 *   URL: https://tokshop.xyz/api/webhooks/agentmail
 *   Events: message.received
 *   Secret → AGENTMAIL_WEBHOOK_SECRET
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const valid = verifyAgentMailSignature(rawBody, {
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
  });
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: AgentMailEvent;
  try {
    event = JSON.parse(rawBody) as AgentMailEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = event.event_id ?? req.headers.get("svix-id");
  if (!eventId) {
    return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  }

  const inserted = await db
    .insert(schema.webhookEvents)
    .values({
      provider: "agentmail",
      eventId,
      eventType: event.event_type ?? "unknown",
      payload: rawBody,
    })
    .onConflictDoNothing()
    .returning({ id: schema.webhookEvents.id });
  if (inserted.length === 0) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (event.event_type !== "message.received") {
    return NextResponse.json({ ok: true, ignored: event.event_type });
  }

  const messageId = event.message?.message_id;
  if (!messageId) {
    return NextResponse.json({ ok: true, ignored: "no message_id" });
  }

  const subject = event.message?.subject ?? "";
  const body = event.message?.text ?? event.message?.preview ?? "";

  waitUntil(
    (async () => {
      const lookup = await lookupSupportMessage(subject, body);
      const result = await replyMail({
        messageId,
        text: lookup.replyText,
      });
      if (!result.ok) {
        console.error("support auto-reply failed", result.error);
      }
    })()
  );

  return NextResponse.json({ ok: true });
}
