import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import {
  CONTACT_EMAIL,
  CONTACT_EMAIL_CN,
  dict,
  localePath,
  type Locale,
} from "@/lib/i18n";
import { legal } from "@/lib/legal";
import { OPERATOR } from "@/lib/site";

export default function ContactContent({ locale }: { locale: Locale }) {
  const t = dict[locale].contactPage;
  const l = dict[locale].legal;
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

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 hover:border-emerald-500"
          >
            <span className="block text-xs text-zinc-500">{t.emailIntl}</span>
            <span className="mt-1 block break-all text-sm font-medium text-emerald-400">
              {CONTACT_EMAIL}
            </span>
          </a>
          <a
            href={`mailto:${CONTACT_EMAIL_CN}`}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 hover:border-emerald-500"
          >
            <span className="block text-xs text-zinc-500">{t.emailCn}</span>
            <span className="mt-1 block break-all text-sm font-medium text-emerald-400">
              {CONTACT_EMAIL_CN}
            </span>
          </a>
        </div>

        <section className="mt-10 rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="text-sm font-semibold text-zinc-100">
            {l.sellerTitle}
          </h2>
          <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="text-zinc-500">{l.operator}</dt>
            <dd className="text-zinc-300">
              {operator.name} · {operator.role}
            </dd>
            <dt className="text-zinc-500">{l.address}</dt>
            <dd className="text-zinc-300">{operator.address}</dd>
          </dl>
        </section>

        <h2 className="mt-12 text-lg font-semibold">{t.topicsTitle}</h2>
        <ul className="mt-3 space-y-2">
          {t.topics.map((topic) => (
            <li key={topic} className="flex gap-2 text-sm text-zinc-400">
              <span aria-hidden className="text-emerald-500">
                ·
              </span>
              <span>{topic}</span>
            </li>
          ))}
        </ul>

        <h2 className="mt-12 text-lg font-semibold">{t.policiesTitle}</h2>
        <p className="mt-3 text-sm text-zinc-400">{t.policiesBody}</p>
        <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {(["refund", "terms", "privacy", "aup"] as const).map((slug) => (
            <Link
              key={slug}
              href={p(`/${slug}`)}
              className="text-emerald-400 underline hover:text-emerald-300"
            >
              {legal[locale][slug].title}
            </Link>
          ))}
        </nav>
      </main>
      <Footer locale={locale} />
    </div>
  );
}
