import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [logs, [totals]] = await Promise.all([
    db
      .select({
        id: schema.usageLogs.id,
        modelSlug: schema.usageLogs.modelSlug,
        inputTokens: schema.usageLogs.inputTokens,
        outputTokens: schema.usageLogs.outputTokens,
        cost: schema.usageLogs.cost,
        stream: schema.usageLogs.stream,
        createdAt: schema.usageLogs.createdAt,
      })
      .from(schema.usageLogs)
      .where(eq(schema.usageLogs.userId, userId))
      .orderBy(desc(schema.usageLogs.createdAt))
      .limit(100),
    db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        totalInput: sql<number>`coalesce(sum(${schema.usageLogs.inputTokens}),0)::int`,
        totalOutput: sql<number>`coalesce(sum(${schema.usageLogs.outputTokens}),0)::int`,
        totalCost: sql<string>`coalesce(sum(${schema.usageLogs.cost}),0)::text`,
      })
      .from(schema.usageLogs)
      .where(eq(schema.usageLogs.userId, userId)),
  ]);

  return NextResponse.json({ logs, totals });
}
