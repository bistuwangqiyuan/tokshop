import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { generateApiKey } from "@/lib/apikey";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const keys = await db
    .select({
      id: schema.apiKeys.id,
      keyPrefix: schema.apiKeys.keyPrefix,
      name: schema.apiKeys.name,
      status: schema.apiKeys.status,
      createdAt: schema.apiKeys.createdAt,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.userId, userId))
    .orderBy(desc(schema.apiKeys.createdAt));
  return NextResponse.json({ keys });
}

const createSchema = z.object({ name: z.string().min(1).max(64).optional() });

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { key, keyHash, keyPrefix } = generateApiKey();
  const [row] = await db
    .insert(schema.apiKeys)
    .values({ userId, keyHash, keyPrefix, name: parsed.data.name ?? "default" })
    .returning({ id: schema.apiKeys.id });

  // The full key is returned exactly once and never stored in plaintext.
  return NextResponse.json({ id: row.id, key, keyPrefix }, { status: 201 });
}
