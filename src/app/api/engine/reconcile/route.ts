import { NextResponse } from "next/server";
import { verifyCron } from "@/lib/engine/cron";
import { ensureEngineSchema, getEngineSql } from "@/lib/engine/db";

export const runtime = "nodejs";

/**
 * Daily reconciliation (cron). Ledger invariant of the sales system:
 *   sum(users.balance) = sum(paid order credits) - sum(usage_logs.cost)
 * Any nonzero diff is logged as 'mismatch' in engine.ops_log (alert signal).
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
  const sql = getEngineSql();
  if (!sql)
    return NextResponse.json({ error: "database not configured" }, { status: 503 });
  await ensureEngineSchema(sql);

  const [bal] = await sql`
    SELECT COALESCE(SUM(balance), 0)::numeric(20,8) AS total FROM users`;
  const [credited] = await sql`
    SELECT COALESCE(SUM(credits), 0)::numeric(20,8) AS total
    FROM orders WHERE status = 'paid'`;
  const [used] = await sql`
    SELECT COALESCE(SUM(cost), 0)::numeric(20,8) AS total FROM usage_logs`;

  // exact decimal arithmetic in SQL to avoid float drift
  const [diffRow] = await sql`
    SELECT (
      (SELECT COALESCE(SUM(credits), 0) FROM orders WHERE status = 'paid')
      - (SELECT COALESCE(SUM(cost), 0) FROM usage_logs)
      - (SELECT COALESCE(SUM(balance), 0) FROM users)
    )::numeric(20,8) AS diff`;

  const report = {
    balances_usd: String(bal.total),
    paid_credits_usd: String(credited.total),
    usage_cost_usd: String(used.total),
    diff_usd: String(diffRow.diff),
  };
  const ok = Number(diffRow.diff) === 0;
  await sql`
    INSERT INTO engine.ops_log (task, status, detail)
    VALUES ('reconcile', ${ok ? "ok" : "mismatch"}, ${JSON.stringify(report)}::jsonb)`;
  return NextResponse.json({ ok, report });
}
