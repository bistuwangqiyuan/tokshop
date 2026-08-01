import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import BuyDownloadForm from "@/components/BuyDownloadForm";
import { availableRails } from "@/lib/checkout";
import { resolveEntitlement } from "@/lib/entitlement";
import { dict, localePath, type Locale } from "@/lib/i18n";
import {
  DOWNLOAD_PRODUCTS,
  formatCny,
  formatUsd,
  usdToCny,
} from "@/lib/products";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { availableChannels } from "@/lib/xunhupay";

function downloadsJsonLd(locale: Locale) {
  const base = locale === "zh" ? `${SITE_URL}/zh/downloads` : `${SITE_URL}/downloads`;
  return {
    "@context": "https://schema.org",
    "@graph": DOWNLOAD_PRODUCTS.map((product) => ({
      "@type": "Product",
      name: product.i18n[locale].title,
      description: product.i18n[locale].summary,
      url: base,
      brand: { "@type": "Organization", name: SITE_NAME },
      isFamilyFriendly: true,
      offers: {
        "@type": "Offer",
        price: product.usd,
        priceCurrency: "USD",
        url: base,
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
      },
    })),
  };
}

export default async function DownloadsContent({ locale }: { locale: Locale }) {
  const t = dict[locale].downloads;
  const p = (path: string) => localePath(locale, path);
  const rails = availableRails();
  const walletChannels = availableChannels();

  const products = await Promise.all(
    DOWNLOAD_PRODUCTS.map(async (product) => ({
      product,
      owned: (await resolveEntitlement(product.sku)) !== null,
    }))
  );

  return (
    <div
      className="flex min-h-screen flex-col"
      lang={locale === "zh" ? "zh-CN" : "en"}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(downloadsJsonLd(locale)),
        }}
      />
      <Nav locale={locale} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">{t.sub}</p>
        <p className="mt-4 text-sm text-zinc-500">
          {t.restorePrompt}{" "}
          <Link
            href={p("/downloads/restore")}
            className="text-emerald-400 underline hover:text-emerald-300"
          >
            {t.restoreLink}
          </Link>
        </p>

        {products.map(({ product, owned }) => {
          const info = product.i18n[locale];
          return (
            <article
              key={product.sku}
              className="mt-12 grid gap-8 border-t border-zinc-800 pt-10 md:grid-cols-[1fr_20rem]"
            >
              <div>
                <h2 className="text-xl font-semibold">{info.title}</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {t.version} {product.version} · {info.pages}
                </p>
                {/* Price lives here rather than only on the buy button, so it is
                    still stated when no payment rail is configured. */}
                <p className="mt-4 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-emerald-400">
                    {formatUsd(product.usd)}
                  </span>
                  {rails.includes("xunhupay") && (
                    <span className="text-sm text-zinc-400">
                      / {formatCny(usdToCny(product.usd))}
                    </span>
                  )}
                  <span className="text-xs text-zinc-500">{t.oneTime}</span>
                </p>
                <p className="mt-4 text-sm leading-relaxed text-zinc-300">
                  {info.summary}
                </p>
                <h3 className="mt-6 text-sm font-medium text-zinc-200">
                  {t.includes}
                </h3>
                <ul className="mt-2 space-y-2">
                  {info.bullets.map((b) => (
                    <li key={b} className="flex gap-2 text-sm text-zinc-400">
                      <span aria-hidden className="text-emerald-500">
                        ·
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                {owned ? (
                  <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-6">
                    <p className="text-sm font-medium text-emerald-300">
                      {t.owned}
                    </p>
                    <div className="mt-4 grid gap-2">
                      <Link
                        href={p(`/downloads/${product.sku}/read`)}
                        className="rounded-md bg-emerald-500 px-4 py-2 text-center text-sm font-medium text-zinc-950 hover:bg-emerald-400"
                      >
                        {t.readOnline}
                      </Link>
                      <a
                        href={`/api/downloads/${product.sku}?lang=${locale}`}
                        className="rounded-md border border-zinc-700 px-4 py-2 text-center text-sm text-zinc-200 hover:border-zinc-500"
                      >
                        {t.downloadMd} · {locale === "zh" ? t.langZh : t.langEn}
                      </a>
                      <a
                        href={`/api/downloads/${product.sku}?lang=${locale === "zh" ? "en" : "zh"}`}
                        className="rounded-md border border-zinc-700 px-4 py-2 text-center text-sm text-zinc-200 hover:border-zinc-500"
                      >
                        {t.downloadMd} ·{" "}
                        {locale === "zh" ? t.langEn : t.langZh}
                      </a>
                    </div>
                  </div>
                ) : (
                  <BuyDownloadForm
                    sku={product.sku}
                    locale={locale}
                    rails={rails}
                    walletChannels={walletChannels}
                    usdAmount={product.usd}
                    cnyAmount={usdToCny(product.usd)}
                  />
                )}
              </div>
            </article>
          );
        })}

        <p className="mt-14 border-t border-zinc-800 pt-6 text-xs text-zinc-500">
          <Link href={p("/refund")} className="underline hover:text-zinc-300">
            {dict[locale].footer.refund}
          </Link>{" "}
          ·{" "}
          <Link href={p("/terms")} className="underline hover:text-zinc-300">
            {dict[locale].footer.terms}
          </Link>
        </p>
      </main>
      <Footer locale={locale} />
    </div>
  );
}
