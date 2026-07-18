import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true, db: "up", ts: Date.now() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, db: "down", error: String(e) },
      { status: 503 }
    );
  }
}
