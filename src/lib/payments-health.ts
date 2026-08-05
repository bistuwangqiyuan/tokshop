/**
 * Shared payment-rail health report used by /api/engine/payments-health
 * and folded into the daily /api/engine/health cron (no extra workflow step).
 */

import { availableRails } from "@/lib/checkout";
import { creemConfigured } from "@/lib/creem";
import type { Sql } from "@/lib/engine/db";
import { mailConfigured } from "@/lib/mail";
import { availableChannels, xunhupayConfigured } from "@/lib/xunhupay";

export type PaymentsHealthReport = {
  rails: string[];
  creem: {
    configured: boolean;
    mode: string;
    webhook_secret_set: boolean;
  };
  xunhupay: {
    configured: boolean;
    channels: string[];
  };
  mail: {
    configured: boolean;
    inbox: string;
    webhook_secret_set: boolean;
  };
  recent_webhooks_24h: {
    provider: string;
    event_type: string;
    count: number;
  }[];
  pending_orders: number;
  paid_orders_24h: number;
  ts: number;
};

export async function collectPaymentsHealth(
  sql: Sql
): Promise<{ status: "ok" | "warn"; report: PaymentsHealthReport }> {
  const rails = availableRails();
  const creemKey = process.env.CREEM_API_KEY ?? "";
  const creemMode =
    process.env.CREEM_TEST_MODE === "false"
      ? "live"
      : creemKey.startsWith("creem_test_")
        ? "test"
        : creemConfigured()
          ? "test-or-unknown"
          : "off";

  let recentWebhooks: PaymentsHealthReport["recent_webhooks_24h"] = [];
  try {
    const rows = await sql`
      SELECT provider, event_type, COUNT(*)::int AS count
      FROM webhook_events
      WHERE processed_at > now() - interval '24 hours'
      GROUP BY provider, event_type
      ORDER BY provider, event_type`;
    recentWebhooks = rows.map((r) => ({
      provider: String(r.provider),
      event_type: String(r.event_type),
      count: Number(r.count),
    }));
  } catch {
    /* still report rail config */
  }

  let pendingOrders = 0;
  let paid24h = 0;
  try {
    const [pending] = await sql`
      SELECT COUNT(*)::int AS n FROM orders WHERE status = 'pending'`;
    const [paid] = await sql`
      SELECT COUNT(*)::int AS n FROM orders
      WHERE status = 'paid' AND paid_at > now() - interval '24 hours'`;
    pendingOrders = Number(pending?.n ?? 0);
    paid24h = Number(paid?.n ?? 0);
  } catch {
    /* ignore */
  }

  const report: PaymentsHealthReport = {
    rails,
    creem: {
      configured: creemConfigured(),
      mode: creemMode,
      webhook_secret_set: Boolean(process.env.CREEM_WEBHOOK_SECRET),
    },
    xunhupay: {
      configured: xunhupayConfigured(),
      channels: availableChannels(),
    },
    mail: {
      configured: mailConfigured(),
      inbox: process.env.AGENTMAIL_INBOX_ID || "mingxinai@agentmail.to",
      webhook_secret_set: Boolean(process.env.AGENTMAIL_WEBHOOK_SECRET),
    },
    recent_webhooks_24h: recentWebhooks,
    pending_orders: pendingOrders,
    paid_orders_24h: paid24h,
    ts: Date.now(),
  };

  const status: "ok" | "warn" = rails.length === 0 ? "warn" : "ok";
  return { status, report };
}
