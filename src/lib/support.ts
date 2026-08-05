/**
 * Unattended support replies for order-status questions.
 * Looks up order id (UUID) or redeem code (TSK-…) from the inbound body.
 * Anything else gets a short handoff that a human still reads the inbox.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { CONTACT_EMAIL } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const REDEEM_RE = /\bTSK-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}\b/i;

export type SupportLookup = {
  matched: "order" | "redeem" | "none";
  orderId?: string;
  status?: string;
  kind?: string;
  sku?: string | null;
  credits?: string;
  redeemCode?: string | null;
  replyText: string;
};

function handoffText(): string {
  return [
    `Thanks for writing to TokShop.`,
    ``,
    `This is an automated first reply. To look up a payment, include either:`,
    `- your order id (a UUID from the success page), or`,
    `- your redeem code (starts with TSK-).`,
    ``,
    `A person still reads this inbox and answers within one business day for`,
    `refunds, account deletion, abuse reports and anything the auto-lookup`,
    `cannot resolve.`,
    ``,
    `Dashboard: ${SITE_URL}/dashboard`,
    `Restore a download: ${SITE_URL}/downloads/restore`,
    `Contact: ${CONTACT_EMAIL}`,
  ].join("\n");
}

function statusText(row: {
  id: string;
  status: string;
  kind: string;
  sku: string | null;
  credits: string;
  redeemCode: string | null;
  email: string | null;
}): string {
  const lines = [
    `TokShop order lookup (automated)`,
    ``,
    `Order: ${row.id}`,
    `Status: ${row.status}`,
    `Kind: ${row.kind}`,
    row.sku ? `SKU: ${row.sku}` : null,
    row.kind === "credits" ? `Credits: $${Number(row.credits).toFixed(2)} USD` : null,
    row.kind === "download" && row.redeemCode
      ? `Redeem code: ${row.redeemCode}`
      : null,
    row.kind === "download"
      ? `Restore: ${SITE_URL}/downloads/restore`
      : `Dashboard: ${SITE_URL}/dashboard`,
    ``,
    `If this does not match what you expect, reply to this thread — a person`,
    `will continue. Do not send card numbers or passwords.`,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export async function lookupSupportMessage(
  subject: string,
  body: string
): Promise<SupportLookup> {
  const haystack = `${subject}\n${body}`;
  const orderMatch = haystack.match(UUID_RE);
  const redeemMatch = haystack.match(REDEEM_RE);

  if (orderMatch) {
    const orderId = orderMatch[0].toLowerCase();
    const [row] = await db
      .select({
        id: schema.orders.id,
        status: schema.orders.status,
        kind: schema.orders.kind,
        sku: schema.orders.sku,
        credits: schema.orders.credits,
        redeemCode: schema.orders.redeemCode,
        email: schema.orders.email,
      })
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId))
      .limit(1);
    if (row) {
      return {
        matched: "order",
        orderId: row.id,
        status: row.status,
        kind: row.kind,
        sku: row.sku,
        credits: row.credits,
        redeemCode: row.redeemCode,
        replyText: statusText(row),
      };
    }
  }

  if (redeemMatch) {
    const code = redeemMatch[0].toUpperCase();
    const [row] = await db
      .select({
        id: schema.orders.id,
        status: schema.orders.status,
        kind: schema.orders.kind,
        sku: schema.orders.sku,
        credits: schema.orders.credits,
        redeemCode: schema.orders.redeemCode,
        email: schema.orders.email,
      })
      .from(schema.orders)
      .where(eq(schema.orders.redeemCode, code))
      .limit(1);
    if (row) {
      return {
        matched: "redeem",
        orderId: row.id,
        status: row.status,
        kind: row.kind,
        sku: row.sku,
        credits: row.credits,
        redeemCode: row.redeemCode,
        replyText: statusText(row),
      };
    }
  }

  return { matched: "none", replyText: handoffText() };
}
