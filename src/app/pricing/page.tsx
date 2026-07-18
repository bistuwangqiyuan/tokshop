import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import Nav from "@/components/Nav";
import { db, schema } from "@/lib/db";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Pricing & API keys",
  description:
    "Pay-as-you-go pricing for DeepSeek, GLM, Qwen and Kimi APIs. Register for an API key, top up prepaid credits, transparent USD per-token rates.",
  alternates: { canonical: `${SITE_URL}/pricing` },
};

const PRODUCT_JSONLD = {
  "@context": "https://schema.org",
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
};

export default async function PricingPage() {
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
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PRODUCT_JSONLD) }}
      />
      <Nav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
        <h1 className="text-3xl font-bold">Pricing</h1>
        <p className="mt-3 text-zinc-400">
          USD per 1M tokens, billed per request down to the token. Prepaid
          credits, no subscription, no minimum spend.
        </p>

        <div className="mt-10 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400">
                <th className="py-3 pr-4 font-medium">Model</th>
                <th className="py-3 pr-4 font-medium">Context</th>
                <th className="py-3 pr-4 font-medium">Input / 1M</th>
                <th className="py-3 font-medium">Output / 1M</th>
              </tr>
            </thead>
            <tbody>
              {models.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-zinc-500">
                    Model catalog is being provisioned. Check back shortly.
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
              <div className="mt-1 text-sm text-zinc-400">prepaid credits</div>
            </div>
          ))}
        </section>

        <div className="mt-12 flex items-center gap-4">
          <Link
            href="/register"
            className="rounded-md bg-emerald-500 px-6 py-3 font-medium text-zinc-950 hover:bg-emerald-400"
          >
            Get your API key
          </Link>
          <Link
            href="/docs"
            className="rounded-md border border-zinc-700 px-6 py-3 font-medium text-zinc-200 hover:border-zinc-500"
          >
            Read the docs
          </Link>
        </div>
      </main>
    </div>
  );
}
