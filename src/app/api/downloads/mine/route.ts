import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { findDownloadProduct } from "@/lib/products";
import type { Locale } from "@/lib/i18n";

/** Paid documents belonging to the signed-in account, for the dashboard. */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const locale: Locale =
    new URL(req.url).searchParams.get("lang") === "zh" ? "zh" : "en";

  const rows = await db
    .select({
      id: schema.orders.id,
      sku: schema.orders.sku,
      redeemCode: schema.orders.redeemCode,
      paidAt: schema.orders.paidAt,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.userId, userId),
        eq(schema.orders.kind, "download"),
        eq(schema.orders.status, "paid")
      )
    )
    .orderBy(desc(schema.orders.paidAt));

  return NextResponse.json({
    downloads: rows.flatMap((row) => {
      const product = row.sku ? findDownloadProduct(row.sku) : undefined;
      if (!product) return [];
      return [
        {
          orderId: row.id,
          sku: product.sku,
          title: product.i18n[locale].title,
          version: product.version,
          redeemCode: row.redeemCode,
          paidAt: row.paidAt,
        },
      ];
    }),
  });
}
