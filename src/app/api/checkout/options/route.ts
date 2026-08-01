import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { availableRails } from "@/lib/checkout";
import { CREDIT_PACKS, usdToCny } from "@/lib/products";
import { availableChannels } from "@/lib/xunhupay";

/**
 * What the dashboard needs to render a top-up: which rails are live, the CNY
 * equivalents, and whether the one-per-account starter pack is still available.
 *
 * Served from the server so the exchange rate and the rail configuration stay
 * out of the client bundle.
 */
export async function GET() {
  const userId = await getSessionUserId();

  const limitedSkus = CREDIT_PACKS.filter((p) => p.oncePerAccount).map(
    (p) => p.sku
  );
  let usedSkus: string[] = [];
  if (userId && limitedSkus.length > 0) {
    const rows = await db
      .select({ sku: schema.orders.sku })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.userId, userId),
          eq(schema.orders.status, "paid"),
          inArray(schema.orders.sku, limitedSkus)
        )
      );
    usedSkus = rows.map((r) => r.sku).filter((s): s is string => s !== null);
  }

  return NextResponse.json({
    rails: availableRails(),
    channels: availableChannels(),
    packs: CREDIT_PACKS.map((pack) => ({
      sku: pack.sku,
      usd: pack.usd,
      cny: usdToCny(pack.usd),
      oncePerAccount: Boolean(pack.oncePerAccount),
      used: usedSkus.includes(pack.sku),
    })),
  });
}
