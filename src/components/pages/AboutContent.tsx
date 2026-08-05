import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import {
  CONTACT_EMAIL,
  dict,
  localePath,
  type Locale,
} from "@/lib/i18n";
import { OPERATOR } from "@/lib/site";

export default function AboutContent({ locale }: { locale: Locale }) {
  const t = dict[locale].aboutPage;
  const operator = OPERATOR[locale];
  const p = (path: string) => localePath(locale, path);

  return (
    <div
      className="flex min-h-screen flex-col"
      lang={locale === "zh" ? "zh-CN" : "en"}
    >
      <Nav locale={locale} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="mt-4 max-w-2xl text-zinc-400">{t.sub}</p>

        <section className="mt-10 space-y-4 text-sm leading-relaxed text-zinc-300">
          {t.paragraphs.map((para) => (
            <p key={para.slice(0, 40)}>{para}</p>
          ))}
        </section>

        <section className="mt-10 rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="text-sm font-semibold text-zinc-100">{t.sellerTitle}</h2>
          <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="text-zinc-500">{t.operator}</dt>
            <dd className="text-zinc-300">
              {operator.name} · {operator.role}
            </dd>
            <dt className="text-zinc-500">{t.address}</dt>
            <dd className="text-zinc-300">{operator.address}</dd>
            <dt className="text-zinc-500">{t.contact}</dt>
            <dd className="text-zinc-300">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-emerald-400 underline"
              >
                {CONTACT_EMAIL}
              </a>
            </dd>
          </dl>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t.paymentsTitle}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-400">
            {t.payments.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <nav className="mt-12 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href={p("/pricing")} className="text-emerald-400 underline">
            {t.linkPricing}
          </Link>
          <Link href={p("/downloads")} className="text-emerald-400 underline">
            {t.linkDownloads}
          </Link>
          <Link href={p("/contact")} className="text-emerald-400 underline">
            {t.linkContact}
          </Link>
          <Link href={p("/terms")} className="text-emerald-400 underline">
            {t.linkTerms}
          </Link>
        </nav>
      </main>
      <Footer locale={locale} />
    </div>
  );
}
