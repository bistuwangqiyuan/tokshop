import { NextResponse } from "next/server";
import { availableRails } from "@/lib/checkout";
import { creemConfigured } from "@/lib/creem";
import { verifyCron } from "@/lib/engine/cron";
import { ensureEngineSchema, getEngineSql } from "@/lib/engine/db";
import { mailConfigured } from "@/lib/mail";
import { availableChannels, xunhupayConfigured } from "@/lib/xunhupay";

export const runtime = "nodejs";

/**
 * Payment-rail health (cron). Reports which rails are configured, Creem
 * test/live mode, recent webhook activity, and whether mail is ready.
 * Logs to engine.ops_log — status "warn" when zero rails are live.
 */
export async function POST(req: Request) {
  if (!verifyCron(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run();
}

export async function GET(req: Request) {
  if (!verifyCron(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run();
}

async function run() {
  const engineSql = getEngineSql();
  if (!engineSql)
    return NextResponse.json(
      { error: "database not configured" },
      { status: 503 }
    );
  await ensureEngineSchema(engineSql);

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

  let recentWebhooks: {
    provider: string;
    event_type: string;
    count: number;
  }[] = [];
  try {
    const rows = await engineSql`
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
    // Table may be empty or unreachable; still report rail config.
  }

  let pendingOrders = 0;
  let paid24h = 0;
  try {
    const [pending] = await engineSql`
      SELECT COUNT(*)::int AS n FROM orders WHERE status = 'pending'`;
    const [paid] = await engineSql`
      SELECT COUNT(*)::int AS n FROM orders
      WHERE status = 'paid' AND paid_at > now() - interval '24 hours'`;
    pendingOrders = Number(pending?.n ?? 0);
    paid24h = Number(paid?.n ?? 0);
  } catch {
    /* ignore */
  }

  const report = {
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

  const status =
    rails.length === 0 ? "warn" : rails.includes("creem") || rails.includes("xunhupay")
      ? "ok"
      : "warn";

  await engineSql`
    INSERT INTO engine.ops_log (task, status, detail)
    VALUES (
      'payments-health',
      ${status},
      ${JSON.stringify(report)}::jsonb
    )`;

  return NextResponse.json({
    ok: status === "ok",
    status,
    report,
  });
}
