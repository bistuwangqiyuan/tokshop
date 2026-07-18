import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { hashPassword, setSessionCookie } from "@/lib/auth";

const bodySchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid email or password (min 8 chars)" },
      { status: 400 }
    );
  }
  const email = parsed.data.email.toLowerCase().trim();

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "Email already registered" },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(schema.users)
    .values({ email, passwordHash })
    .returning({ id: schema.users.id, email: schema.users.email });

  await setSessionCookie(user.id);
  return NextResponse.json({ user }, { status: 201 });
}
