/**
 * Access control for paid downloads.
 *
 * A guest has no account, so the paid order itself is the entitlement. Three
 * credentials can prove it, checked in this order:
 *
 *   1. a signed session, where the account owns a paid order for the product
 *   2. a signed access cookie issued by the delivery page
 *   3. a redeem code, which is what a guest keeps as their long-term receipt
 *
 * The delivery link handed back by the payment provider carries a separate
 * short-lived token. That token proves only "this visitor started this
 * checkout"; proof of payment always comes from the order row being paid.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

export const ACCESS_COOKIE = "tok_dl";
const ACCESS_DAYS = 30;

/** Refuse to hand out downloads forever if a redeem code gets passed around. */
export const MAX_DOWNLOADS_PER_ORDER = 50;

function secret(): string {
  const value = process.env.DOWNLOAD_TOKEN_SECRET ?? process.env.AUTH_SECRET;
  if (!value) throw new Error("DOWNLOAD_TOKEN_SECRET or AUTH_SECRET must be set");
  return value;
}

function hmac(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Sign `<payload>.<mac>`. Used both for the delivery link returned from the
 * payment provider and for the download access cookie.
 */
export function signToken(payload: string): string {
  return `${payload}.${hmac(payload)}`;
}

export function verifyToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const cut = token.lastIndexOf(".");
  if (cut <= 0) return null;
  const payload = token.slice(0, cut);
  const mac = token.slice(cut + 1);
  return safeEqual(hmac(payload), mac) ? payload : null;
}

export async function setAccessCookie(orderId: string) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, signToken(orderId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_DAYS * 24 * 60 * 60,
  });
}

export type PaidDownload = {
  orderId: string;
  sku: string;
  redeemCode: string | null;
  downloadCount: number;
};

async function paidDownloadById(
  orderId: string,
  sku?: string
): Promise<PaidDownload | null> {
  const rows = await db
    .select({
      orderId: schema.orders.id,
      sku: schema.orders.sku,
      redeemCode: schema.orders.redeemCode,
      downloadCount: schema.orders.downloadCount,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.id, orderId),
        eq(schema.orders.kind, "download"),
        eq(schema.orders.status, "paid")
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row || !row.sku) return null;
  if (sku && row.sku !== sku) return null;
  return { ...row, sku: row.sku };
}

/**
 * Resolve whether the current request may read `sku`. Pass a redeem code when
 * the caller supplied one explicitly (restore page or download URL).
 */
export async function resolveEntitlement(
  sku: string,
  redeemCode?: string | null
): Promise<PaidDownload | null> {
  const userId = await getSessionUserId();
  if (userId) {
    const rows = await db
      .select({
        orderId: schema.orders.id,
        sku: schema.orders.sku,
        redeemCode: schema.orders.redeemCode,
        downloadCount: schema.orders.downloadCount,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.userId, userId),
          eq(schema.orders.sku, sku),
          eq(schema.orders.status, "paid")
        )
      )
      .orderBy(desc(schema.orders.paidAt))
      .limit(1);
    const row = rows[0];
    if (row?.sku) return { ...row, sku: row.sku };
  }

  const store = await cookies();
  const cookieOrderId = verifyToken(store.get(ACCESS_COOKIE)?.value);
  if (cookieOrderId) {
    const found = await paidDownloadById(cookieOrderId, sku);
    if (found) return found;
  }

  if (redeemCode) {
    const found = await lookupRedeemCode(redeemCode);
    if (found && found.sku === sku) return found;
  }

  return null;
}

export async function lookupRedeemCode(
  code: string
): Promise<PaidDownload | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const rows = await db
    .select({
      orderId: schema.orders.id,
      sku: schema.orders.sku,
      redeemCode: schema.orders.redeemCode,
      downloadCount: schema.orders.downloadCount,
    })
    .from(schema.orders)
    .where(
      and(
        eq(sql`upper(${schema.orders.redeemCode})`, normalized),
        eq(schema.orders.status, "paid")
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row?.sku) return null;
  return { ...row, sku: row.sku };
}

/**
 * Count a delivery. Returns false once the cap is hit, which is the signal to
 * refuse the download rather than keep serving a leaked code.
 */
export async function countDownload(orderId: string): Promise<boolean> {
  const updated = await db
    .update(schema.orders)
    .set({ downloadCount: sql`${schema.orders.downloadCount} + 1` })
    .where(
      and(
        eq(schema.orders.id, orderId),
        sql`${schema.orders.downloadCount} < ${MAX_DOWNLOADS_PER_ORDER}`
      )
    )
    .returning({ id: schema.orders.id });
  return updated.length > 0;
}
