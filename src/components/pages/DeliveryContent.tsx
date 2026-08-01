import Link from "next/link";
import { and, eq } from "drizzle-orm";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import AutoRefresh from "@/components/AutoRefresh";
import { db, schema } from "@/lib/db";
import { verifyToken } from "@/lib/entitlement";
import { dict, localePath, type Locale } from "@/lib/i18n";
import { findDownloadProduct } from "@/lib/products";

export default async function DeliveryContent({
  locale,
  orderId,
  token,
}: {
  locale: Locale;
  orderId?: string;
  token?: string;
}) {
  const t = dict[locale].downloads;
  const p = (path: string) => localePath(locale, path);

  const tokenOk = Boolean(orderId) && verifyToken(token) === orderId;

  const [order] = tokenOk
    ? await db
        .select({
          id: schema.orders.id,
          status: schema.orders.status,
          sku: schema.orders.sku,
          redeemCode: schema.orders.redeemCode,
        })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.id, orderId!),
            eq(schema.orders.kind, "download")
          )
        )
        .limit(1)
    : [];

  const product = order?.sku ? findDownloadProduct(order.sku) : undefined;
  const paid = order?.status === "paid" && product !== undefined;

  return (
    <div
      className="flex min-h-screen flex-col"
      lang={locale === "zh" ? "zh-CN" : "en"}
    >
      <Nav locale={locale} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-14">
        {!tokenOk || !order ? (
          <>
            <h1 className="text-2xl font-bold">{t.restoreTitle}</h1>
            <p className="mt-4 text-sm text-zinc-400">{t.badLink}</p>
            <Link
              href={p("/downloads/restore")}
              className="mt-6 inline-block rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
            >
              {t.restoreLink}
            </Link>
          </>
        ) : paid ? (
          <>
            <h1 className="text-2xl font-bold text-emerald-400">
              {t.successTitle}
            </h1>
            <p className="mt-3 text-sm text-zinc-400">{t.successSub}</p>
            <h2 className="mt-8 text-lg font-semibold">
              {product.i18n[locale].title}
            </h2>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link
                href={p(`/downloads/${product.sku}/read`)}
                className="rounded-md bg-emerald-500 px-4 py-3 text-center text-sm font-medium text-zinc-950 hover:bg-emerald-400"
              >
                {t.readOnline}
              </Link>
              <a
                href={`/api/downloads/${product.sku}?lang=${locale}`}
                className="rounded-md border border-zinc-700 px-4 py-3 text-center text-sm text-zinc-200 hover:border-zinc-500"
              >
                {t.downloadMd} · {locale === "zh" ? t.langZh : t.langEn}
              </a>
              <a
                href={`/api/downloads/${product.sku}?lang=${locale === "zh" ? "en" : "zh"}`}
                className="rounded-md border border-zinc-700 px-4 py-3 text-center text-sm text-zinc-200 hover:border-zinc-500 sm:col-span-2"
              >
                {t.downloadMd} · {locale === "zh" ? t.langEn : t.langZh}
              </a>
            </div>

            {order.redeemCode && (
              <div className="mt-10 rounded-lg border border-emerald-800 bg-emerald-950/30 p-6">
                <p className="text-sm font-medium text-emerald-300">
                  {t.redeemCode}
                </p>
                <p className="mt-2 select-all font-mono text-xl tracking-wider text-emerald-100">
                  {order.redeemCode}
                </p>
                <p className="mt-3 text-xs text-emerald-200/70">
                  {t.redeemCodeWarn}
                </p>
              </div>
            )}

            <p className="mt-8 text-xs text-zinc-500">
              {t.orderId}: <span className="font-mono">{order.id}</span>
            </p>
          </>
        ) : (
          <>
            <AutoRefresh seconds={5} />
            <h1 className="text-2xl font-bold">{t.pendingTitle}</h1>
            <p className="mt-4 text-sm text-zinc-400">{t.pendingSub}</p>
            <p className="mt-6 text-xs text-zinc-500">
              {t.orderId}: <span className="font-mono">{order.id}</span>
            </p>
          </>
        )}
      </main>
      <Footer locale={locale} />
    </div>
  );
}
