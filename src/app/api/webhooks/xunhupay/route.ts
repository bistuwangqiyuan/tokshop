import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { scheduleSettlementNotice } from "@/lib/notify";
import { settleOrder } from "@/lib/orders";
import { fromTradeOrderId, queryOrder, verifyNotify } from "@/lib/xunhupay";

/**
 * XunhuPay notify callback.
 *
 * XunhuPay expects the literal body `success`, otherwise it retries six times.
 * Anything else - including our own failures - is therefore an implicit "retry
 * me", which is what we want for transient errors.
 *
 * The callback is only MD5-signed with a shared secret, so signature checking
 * alone is weaker than Creem's HMAC. Before crediting anything we therefore
 * re-query the order from XunhuPay and compare the amount against what we
 * recorded, which neutralises both replay and amount tampering.
 */

const OK = new Response("success", {
  headers: { "Content-Type": "text/plain; charset=utf-8" },
});

function reject(reason: string, status: number) {
  return new Response(reason, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function readParams(req: NextRequest): Promise<Record<string, string>> {
  const raw = await req.text();
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const json = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(json).map(([k, v]) => [k, String(v)])
      );
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

export async function POST(req: NextRequest) {
  const params = await readParams(req);

  const { valid, channel } = verifyNotify(params);
  if (!valid || !channel) {
    return reject("invalid sign", 401);
  }

  const orderId = params.trade_order_id
    ? fromTradeOrderId(params.trade_order_id)
    : null;
  if (!orderId) {
    return reject("missing order id", 400);
  }

  const [order] = await db
    .select({
      id: schema.orders.id,
      status: schema.orders.status,
      payAmount: schema.orders.payAmount,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.id, orderId),
        eq(schema.orders.provider, "xunhupay")
      )
    )
    .limit(1);
  if (!order) {
    return reject("unknown order", 404);
  }

  // Already settled by an earlier delivery of this callback.
  if (order.status !== "pending") {
    return OK;
  }

  const remote = await queryOrder(orderId, channel);
  if (!remote) {
    return reject("could not verify order upstream", 502);
  }
  if (remote.status !== "OD") {
    // Not paid (WP) or cancelled (CD). Acknowledge so XunhuPay stops retrying.
    return OK;
  }

  const expected = Number(order.payAmount ?? 0);
  if (
    remote.totalFee !== null &&
    expected > 0 &&
    Math.abs(remote.totalFee - expected) > 0.01
  ) {
    console.error(
      `xunhupay amount mismatch on order ${orderId}: expected ${expected}, upstream ${remote.totalFee}`
    );
    return reject("amount mismatch", 409);
  }

  const providerOrderId =
    remote.openOrderId ?? params.open_order_id ?? params.oderid ?? null;

  const settled = await settleOrder({ orderId, providerOrderId });
  scheduleSettlementNotice(settled);

  // Audit trail. Recorded after settlement so a retry following a transient
  // failure is still able to settle - settleOrder is itself idempotent.
  await db
    .insert(schema.webhookEvents)
    .values({
      provider: "xunhupay",
      eventId: providerOrderId ?? params.trade_order_id,
      eventType: `${channel}.paid`,
      payload: JSON.stringify(params),
    })
    .onConflictDoNothing();

  return OK;
}
