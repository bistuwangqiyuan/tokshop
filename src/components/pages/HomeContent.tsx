import Link from "next/link";
import { eq } from "drizzle-orm";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { db, schema } from "@/lib/db";
import { dict, localePath, type Locale } from "@/lib/i18n";

export default async function HomeContent({ locale }: { locale: Locale }) {
  const t = dict[locale].home;
  const p = (path: string) => localePath(locale, path);

  let models: (typeof schema.models.$inferSelect)[] = [];
  try {
    models = await db
      .select()
      .from(schema.models)
      .where(eq(schema.models.active, true));
  } catch {
    // DB not ready yet (first deploy before migration); render page without table
  }

  return (
    <div
      className="flex min-h-screen flex-col"
      lang={locale === "zh" ? "zh-CN" : "en"}
    >
      <Nav locale={locale} />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-24 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            {t.heroLine1}
            <br />
            <span className="text-emerald-400">{t.heroLine2}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            {t.heroSub}
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
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
          <div className="mx-auto mt-16 max-w-2xl rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-left font-mono text-sm text-zinc-300">
            <p className="text-zinc-500">{t.codeComment}</p>
            <p className="mt-2">
              curl https://tokshop.xyz/v1/chat/completions \
            </p>
            <p className="pl-4">-H &quot;Authorization: Bearer sk-tok-...&quot; \</p>
            <p className="pl-4">
              -d &apos;{"{"}&quot;model&quot;:&quot;deepseek-v3.2&quot;,
              &quot;messages&quot;:[...]{"}"}&apos;
            </p>
          </div>
        </section>

        <section id="pricing" className="border-t border-zinc-800 bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-center text-3xl font-bold">{t.pricingTitle}</h2>
            <p className="mt-3 text-center text-zinc-400">{t.pricingSub}</p>
            <div className="mt-10 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-zinc-400">
                    <th className="py-3 pr-4 font-medium">{t.thModel}</th>
                    <th className="py-3 pr-4 font-medium">{t.thContext}</th>
                    <th className="py-3 pr-4 font-medium">{t.thInput}</th>
                    <th className="py-3 font-medium">{t.thOutput}</th>
                  </tr>
                </thead>
                <tbody>
                  {models.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-zinc-500">
                        {t.catalogEmpty}
                      </td>
                    </tr>
                  ) : (
                    models.map((m) => (
                      <tr key={m.id} className="border-b border-zinc-800">
                        <td className="py-3 pr-4">
                          <span className="font-mono text-emerald-400">
                            {m.slug}
                          </span>
                          <span className="ml-2 text-zinc-500">
                            {m.displayName}
                          </span>
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
          </div>
        </section>

        <section className="border-t border-zinc-800">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 py-20 sm:grid-cols-3">
            {t.features.map((f) => (
              <div
                key={f.title}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-6"
              >
                <h3 className="font-semibold text-emerald-400">{f.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer locale={locale} />
    </div>
  );
}
