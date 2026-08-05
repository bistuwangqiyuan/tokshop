import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { availableRails } from "@/lib/checkout";
import { db } from "@/lib/db";
import { mailConfigured } from "@/lib/mail";
import { availableChannels } from "@/lib/xunhupay";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    const rails = availableRails();
    return NextResponse.json({
      ok: true,
      db: "up",
      payments: {
        rails,
        channels: availableChannels(),
        mail: mailConfigured(),
      },
      ts: Date.now(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, db: "down", error: String(e) },
      { status: 503 }
    );
  }
}
