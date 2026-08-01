import { NextRequest, NextResponse } from "next/server";
import {
  MAX_DOWNLOADS_PER_ORDER,
  countDownload,
  resolveEntitlement,
} from "@/lib/entitlement";
import { findDownloadProduct } from "@/lib/products";
import { renderPaidDoc } from "@/content/paid";
import type { Locale } from "@/lib/i18n";

/**
 * Gated delivery of a purchased document.
 *
 * The file is never reachable without a paid order: it lives in a bundled
 * module rather than in public/, so there is no URL that bypasses this check.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ sku: string }> }
) {
  const { sku } = await ctx.params;
  const product = findDownloadProduct(sku);
  if (!product) {
    return NextResponse.json({ error: "Unknown product" }, { status: 404 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const locale: Locale = url.searchParams.get("lang") === "zh" ? "zh" : "en";

  const entitlement = await resolveEntitlement(sku, code);
  if (!entitlement) {
    return NextResponse.json(
      {
        error: "not_entitled",
        message:
          "This document requires a purchase. Sign in, or enter your redeem code at /downloads/restore.",
      },
      { status: 401 }
    );
  }

  // A redeem code is a bearer token, so cap how many times one order can pull
  // the file. Generous enough that a real buyer never notices.
  if (!(await countDownload(entitlement.orderId))) {
    return NextResponse.json(
      {
        error: "download_limit_reached",
        message: `This order has reached its limit of ${MAX_DOWNLOADS_PER_ORDER} downloads. Email support and we will reset it.`,
      },
      { status: 429 }
    );
  }

  const body = await renderPaidDoc(sku, locale);
  if (!body) {
    return NextResponse.json({ error: "Unknown product" }, { status: 404 });
  }

  const filename = `${product.fileBase}-v${product.version}.${locale}.md`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
