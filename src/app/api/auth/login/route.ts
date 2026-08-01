import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { claimGuestOrders } from "@/lib/orders";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  // Picks up any download bought as a guest between sessions.
  const claimed = await claimGuestOrders(user.id, email);

  await setSessionCookie(user.id);
  return NextResponse.json({
    user: { id: user.id, email: user.email },
    claimedOrders: claimed,
  });
}
