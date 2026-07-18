import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const updated = await db
    .update(schema.apiKeys)
    .set({ status: "revoked" })
    .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.userId, userId)))
    .returning({ id: schema.apiKeys.id });
  if (updated.length === 0) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
