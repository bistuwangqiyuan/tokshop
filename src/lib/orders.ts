/**
 * Order settlement, shared by both payment rails.
 *
 * The money-moving statements are single SQL statements on purpose. The
 * neon-http driver has no interactive transactions, so splitting "mark the
 * order paid" and "credit the balance" into two round-trips leaves a window
 * where a crash marks an order paid without ever crediting it. A CTE keeps
 * both halves in one atomic statement.
 */

import { randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** Unambiguous alphabet: no 0/O/1/I/L so codes survive being read aloud. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRedeemCode(): string {
  const group = () =>
    Array.from(
      { length: 4 },
      () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
    ).join("");
  return `TSK-${group()}-${group()}-${group()}`;
}

export type SettledOrder = {
  id: string;
  userId: string | null;
  email: string | null;
  kind: "credits" | "download";
  sku: string | null;
  credits: string;
  redeemCode: string | null;
};

/**
 * Move a pending order to paid and apply its effect, atomically and
 * idempotently. Returns null when the order was not pending, which is the
 * normal outcome for a duplicated provider callback.
 */
export async function settleOrder(params: {
  orderId: string;
  providerOrderId?: string | null;
}): Promise<SettledOrder | null> {
  const { orderId, providerOrderId = null } = params;
  const candidateCode = generateRedeemCode();

  const result = await db.execute(sql`
    WITH paid AS (
      UPDATE orders
         SET status = 'paid',
             paid_at = now(),
             provider_order_id = COALESCE(${providerOrderId}, provider_order_id),
             redeem_code = CASE
               WHEN kind = 'download' THEN COALESCE(redeem_code, ${candidateCode})
               ELSE redeem_code
             END
       WHERE id = ${orderId}
         AND status = 'pending'
      RETURNING id, user_id, email, kind, sku, credits, redeem_code
    ),
    credited AS (
      UPDATE users u
         SET balance = u.balance + p.credits
        FROM paid p
       WHERE u.id = p.user_id
         AND p.kind = 'credits'
      RETURNING u.id
    )
    SELECT id, user_id, email, kind, sku, credits, redeem_code FROM paid
  `);

  const row = (result.rows as Record<string, unknown>[])[0];
  if (!row) return null;
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : null,
    email: row.email ? String(row.email) : null,
    kind: row.kind as "credits" | "download",
    sku: row.sku ? String(row.sku) : null,
    credits: String(row.credits),
    redeemCode: row.redeem_code ? String(row.redeem_code) : null,
  };
}

/**
 * Reverse a paid order after a refund or a lost dispute. Credit balances floor
 * at zero: if the customer already spent what they are being refunded we
 * absorb the difference rather than pushing them negative. Download orders need
 * no extra work - every entitlement check requires status = 'paid'.
 */
export async function reverseOrder(orderId: string): Promise<boolean> {
  const result = await db.execute(sql`
    WITH reversed AS (
      UPDATE orders
         SET status = 'refunded'
       WHERE id = ${orderId}
         AND status = 'paid'
      RETURNING id, user_id, credits, kind
    ),
    debited AS (
      UPDATE users u
         SET balance = GREATEST(u.balance - r.credits, 0)
        FROM reversed r
       WHERE u.id = r.user_id
         AND r.kind = 'credits'
      RETURNING u.id
    )
    SELECT id FROM reversed
  `);
  return (result.rows as unknown[]).length > 0;
}

/**
 * Bind guest orders to an account on register or sign-in, so a visitor who
 * bought a download before having an account finds it in their dashboard.
 * Only download orders can be guest orders, so nothing needs crediting here.
 */
export async function claimGuestOrders(
  userId: string,
  email: string
): Promise<number> {
  const claimed = await db
    .update(schema.orders)
    .set({ userId })
    .where(
      and(
        isNull(schema.orders.userId),
        eq(sql`lower(${schema.orders.email})`, email.trim().toLowerCase())
      )
    )
    .returning({ id: schema.orders.id });
  return claimed.length;
}

/** True when this account has already used the one-per-account entry price. */
export async function hasUsedPack(
  userId: string,
  sku: string
): Promise<boolean> {
  const rows = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.userId, userId),
        eq(schema.orders.sku, sku),
        eq(schema.orders.status, "paid")
      )
    )
    .limit(1);
  return rows.length > 0;
}
