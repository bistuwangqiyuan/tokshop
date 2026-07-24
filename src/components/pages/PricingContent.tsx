import Link from "next/link";
import { eq } from "drizzle-orm";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { db, schema } from "@/lib/db";
import { dict, localePath, type Locale } from "@/lib/i18n";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * Product (prepaid credits) + OfferCatalog with live per-model USD prices
 * per 1M tokens, generated from the sales database so structured data can
 * never drift from the visible price table.
 */
function pricingJsonLd(models: (typeof schema.models.$inferSelect)[]) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: `${SITE_NAME} prepaid API credits`,
        description:
          "Prepaid credits for an OpenAI-compatible API serving open-source models (DeepSeek, GLM, Qwen, Kimi) with per-token billing.",
        brand: { "@type": "Organization", name: SITE_NAME },
        offers: [5, 20, 100].map((usd) => ({
          "@type": "Offer",
          price: usd,
          priceCurrency: "USD",
          url: `${SITE_URL}/pricing`,
          availability: "https://schema.org/InStock",
        })),
      },
      {
        "@type": "OfferCatalog",
        name: `${SITE_NAME} model pricing (USD per 1M tokens)`,
        url: `${SITE_URL}/pricing`,
        itemListElement: models.map((m) => ({
          "@type": "Offer",
          name: `${m.displayName} (${m.slug})`,
          url: `${SITE_URL}/pricing`,
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          priceSpecification: [
            {
              "@type": "UnitPriceSpecification",
              price: Number(m.inputPricePerM),
              priceCurrency: "USD",
              unitText: "1M input tokens",
            },
            {
              "@type": "UnitPriceSpecification",
              price: Number(m.outputPricePerM),
              priceCurrency: "USD",
              unitText: "1M output tokens",
            },
          ],
        })),
      },
    ],
  };
}

export default async function PricingContent({ locale }: { locale: Locale }) {
  const t = dict[locale].pricing;
  const th = dict[locale].home;
  const p = (path: string) => localePath(locale, path);

  let models: (typeof schema.models.$inferSelect)[] = [];
  try {
    models = await db
      .select()
      .from(schema.models)
      .where(eq(schema.models.active, true));
  } catch {
    // DB not ready yet; render page without table
  }

  return (
    <div
      className="flex min-h-screen flex-col"
      lang={locale === "zh" ? "zh-CN" : "en"}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd(models)) }}
      />
      <Nav locale={locale} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="mt-3 text-zinc-400">{t.sub}</p>

        <div className="mt-10 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400">
                <th className="py-3 pr-4 font-medium">{th.thModel}</th>
                <th className="py-3 pr-4 font-medium">{th.thContext}</th>
                <th className="py-3 pr-4 font-medium">{th.thInput}</th>
                <th className="py-3 font-medium">{th.thOutput}</th>
              </tr>
            </thead>
            <tbody>
              {models.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-zinc-500">
                    {th.catalogEmpty}
                  </td>
                </tr>
              ) : (
                models.map((m) => (
                  <tr key={m.id} className="border-b border-zinc-800">
                    <td className="py-3 pr-4">
                      <span className="font-mono text-emerald-400">{m.slug}</span>
                      <span className="ml-2 text-zinc-500">{m.displayName}</span>
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">
                      {Math.round(m.contextLength / 1000)}K
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">
                      ${Number(m.inputPricePerM).toFixed(2)}
                    </td>
                    <td className="py-3 text-zinc-300">
                      ${Number(m.outputPricePerM).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <section className="mt-12 grid gap-6 sm:grid-cols-3">
          {[5, 20, 100].map((usd) => (
            <div
              key={usd}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-center"
            >
              <div className="text-2xl font-bold">${usd}</div>
              <div className="mt-1 text-sm text-zinc-400">{t.prepaid}</div>
            </div>
          ))}
        </section>

        <div className="mt-12 flex items-center gap-4">
          <Link
            href={p("/register")}
            className="rounded-md bg-emerald-500 px-6 py-3 font-medium text-zinc-950 hover:bg-emerald-400"
          >
            {t.ctaKey}
          </Link>
          <Link
            href={p("/docs")}
            className="rounded-md border border-zinc-700 px-6 py-3 font-medium text-zinc-200 hover:border-zinc-500"
          >
            {t.ctaDocs}
          </Link>
        </div>
      </main>
      <Footer locale={locale} />
    </div>
  );
}
