import { NextResponse } from "next/server";
import { verifyCron } from "@/lib/engine/cron";
import { ensureEngineSchema, getEngineSql } from "@/lib/engine/db";
import { GATEWAY_BASE_URL, getGatewayToken } from "@/lib/gateway";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Health check (cron): DB round-trip + AI Gateway probe, logged to engine.ops_log. */
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

  const checks: Record<string, boolean | string> = {};
  // 1. DB round-trip
  try {
    const r = await sql`SELECT 1 AS ok`;
    checks.db = r[0].ok === 1;
  } catch (e) {
    checks.db = `error: ${String(e).slice(0, 120)}`;
  }
  // 2. upstream probe (minimal cost: max_tokens=8)
  try {
    const t0 = Date.now();
    const token = await getGatewayToken();
    const r = await fetch(`${GATEWAY_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-v3.2",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
      }),
    });
    checks.upstream = r.ok;
    checks.upstream_latency_ms = String(Date.now() - t0);
    if (!r.ok) checks.upstream_detail = (await r.text()).slice(0, 160);
  } catch (e) {
    checks.upstream = `error: ${String(e).slice(0, 120)}`;
  }

  const ok = checks.db === true && checks.upstream === true;
  await sql`
    INSERT INTO engine.ops_log (task, status, detail)
    VALUES ('health', ${ok ? "ok" : "fail"}, ${JSON.stringify(checks)}::jsonb)`;
  return NextResponse.json({ ok, checks });
}
