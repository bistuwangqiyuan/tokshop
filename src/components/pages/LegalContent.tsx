import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { dict, localePath, type Locale } from "@/lib/i18n";
import { legal, type LegalSlug } from "@/lib/legal";

const SIBLINGS: LegalSlug[] = ["terms", "refund", "privacy"];

export default function LegalContent({
  locale,
  slug,
}: {
  locale: Locale;
  slug: LegalSlug;
}) {
  const doc = legal[locale][slug];
  const t = dict[locale].legal;
  const p = (path: string) => localePath(locale, path);

  return (
    <div
      className="flex min-h-screen flex-col"
      lang={locale === "zh" ? "zh-CN" : "en"}
    >
      <Nav locale={locale} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <h1 className="text-3xl font-bold">{doc.title}</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {t.updated}: {doc.updated}
        </p>
        <p className="mt-6 text-zinc-300">{doc.intro}</p>

        {doc.sections.map((s) => (
          <section key={s.h} className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-100">{s.h}</h2>
            {s.body.map((para, i) => (
              <p key={i} className="mt-3 text-sm leading-relaxed text-zinc-400">
                {para}
              </p>
            ))}
          </section>
        ))}

        <nav className="mt-14 flex flex-wrap gap-x-4 gap-y-2 border-t border-zinc-800 pt-6 text-sm">
          {SIBLINGS.filter((s) => s !== slug).map((s) => (
            <Link
              key={s}
              href={p(`/${s}`)}
              className="text-emerald-400 underline hover:text-emerald-300"
            >
              {legal[locale][s].title}
            </Link>
          ))}
        </nav>
      </main>
      <Footer locale={locale} />
    </div>
  );
}
