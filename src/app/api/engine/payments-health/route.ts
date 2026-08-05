import { NextResponse } from "next/server";
import { verifyCron } from "@/lib/engine/cron";
import { ensureEngineSchema, getEngineSql } from "@/lib/engine/db";
import { collectPaymentsHealth } from "@/lib/payments-health";

export const runtime = "nodejs";

/**
 * Payment-rail health (cron). Also invoked from /api/engine/health daily.
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

  const { status, report } = await collectPaymentsHealth(engineSql);
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
