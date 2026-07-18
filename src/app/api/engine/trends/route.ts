import { NextResponse } from "next/server";
import { verifyCron } from "@/lib/engine/cron";
import { ensureEngineSchema, getEngineSql } from "@/lib/engine/db";
import { fetchTrendsRss, scoreNewTrends, TREND_GEOS, upsertTrends } from "@/lib/engine/trends";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Trend tracking (30-minute schedule): multi-geo Trends RSS → dedupe upsert
 * → AI relevance scoring. Only relevance>=0.7 keywords enter the topic queue;
 * irrelevant keywords are marked and never used.
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

  const perGeo: Record<string, number | string> = {};
  let fetched = 0;
  let inserted = 0;
  for (const geo of TREND_GEOS) {
    try {
      const items = await fetchTrendsRss(geo);
      fetched += items.length;
      const r = await upsertTrends(sql, items);
      inserted += r.inserted;
      perGeo[geo] = items.length;
    } catch (e) {
      perGeo[geo] = `error: ${String(e).slice(0, 80)}`;
    }
  }

  // small scoring batches (15 keywords x up to 4 rounds, avoids truncation)
  const scoring = { scored: 0, relevant: 0 };
  let scoringError = "";
  for (let i = 0; i < 4; i++) {
    try {
      const r = await scoreNewTrends(sql);
      scoring.scored += r.scored;
      scoring.relevant += r.relevant;
      if (r.scored === 0) break;
    } catch (e) {
      scoringError = String(e).slice(0, 200);
      break;
    }
  }

  const detail = {
    fetched,
    inserted,
    per_geo: perGeo,
    scored: scoring.scored,
    relevant: scoring.relevant,
    ...(scoringError ? { scoring_error: scoringError } : {}),
  };
  const ok = fetched > 0 && !scoringError;
  await sql`
    INSERT INTO engine.ops_log (task, status, detail)
    VALUES ('trends', ${ok ? "ok" : "partial"}, ${JSON.stringify(detail)}::jsonb)`;
  return NextResponse.json({ ok, ...detail });
}
