import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { setAccessCookie, verifyToken } from "@/lib/entitlement";
import { scheduleSettlementNotice } from "@/lib/notify";
import { settleOrder } from "@/lib/orders";
import { queryOrder } from "@/lib/xunhupay";

/**
 * Landing point for the provider's post-payment redirect.
 *
 * Exists as a route handler rather than a page so it can set the signed access
 * cookie, which a server component render cannot do. It then forwards to the
 * human-readable delivery page.
 *
 * For the domestic rail it also queries the order upstream. That makes a lost
 * notify callback self-healing: the buyer's own return trip settles the order.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("order") ?? "";
  const token = url.searchParams.get("t");
  const locale = url.searchParams.get("lang") === "zh" ? "zh" : "en";
  const base = locale === "zh" ? "/zh/downloads/success" : "/downloads/success";

  const target = new URL(base, url.origin);
  if (orderId) target.searchParams.set("order", orderId);
  if (token) target.searchParams.set("t", token);

  // A forged link gets no cookie; the delivery page will refuse it too.
  if (verifyToken(token) !== orderId || !orderId) {
    return NextResponse.redirect(target);
  }

  const [order] = await db
    .select({
      status: schema.orders.status,
      provider: schema.orders.provider,
      kind: schema.orders.kind,
    })
    .from(schema.orders)
    .where(
      and(eq(schema.orders.id, orderId), eq(schema.orders.kind, "download"))
    )
    .limit(1);
  if (!order) return NextResponse.redirect(target);

  if (order.status === "pending" && order.provider === "xunhupay") {
    for (const channel of ["alipay", "wechat"] as const) {
      const remote = await queryOrder(orderId, channel).catch(() => null);
      if (remote?.status === "OD") {
        const settled = await settleOrder({
          orderId,
          providerOrderId: remote.openOrderId,
        });
        scheduleSettlementNotice(settled);
        break;
      }
    }
  }

  const [fresh] = await db
    .select({ status: schema.orders.status })
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);

  if (fresh?.status === "paid") {
    await setAccessCookie(orderId);
  }

  return NextResponse.redirect(target);
}
