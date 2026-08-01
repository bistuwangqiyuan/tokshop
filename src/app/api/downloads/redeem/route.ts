import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { lookupRedeemCode, setAccessCookie } from "@/lib/entitlement";

const bodySchema = z.object({ code: z.string().min(4).max(64) });

/**
 * Exchange a redeem code for a signed access cookie, so a returning guest only
 * has to enter the code once per browser.
 */
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your redeem code" }, { status: 400 });
  }

  const found = await lookupRedeemCode(parsed.data.code);
  if (!found) {
    return NextResponse.json(
      {
        error: "invalid_code",
        message:
          "That code was not recognised. Check for typos, or email support with your order id.",
      },
      { status: 404 }
    );
  }

  await setAccessCookie(found.orderId);
  return NextResponse.json({ ok: true, sku: found.sku });
}
