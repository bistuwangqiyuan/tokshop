import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import RestoreForm from "@/components/RestoreForm";
import { CONTACT_EMAIL, dict, localePath, type Locale } from "@/lib/i18n";

export default function RestoreContent({ locale }: { locale: Locale }) {
  const t = dict[locale].downloads;
  const p = (path: string) => localePath(locale, path);

  return (
    <div
      className="flex min-h-screen flex-col"
      lang={locale === "zh" ? "zh-CN" : "en"}
    >
      <Nav locale={locale} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-14">
        <h1 className="text-2xl font-bold">{t.restoreTitle}</h1>
        <p className="mt-3 text-sm text-zinc-400">{t.restoreSub}</p>
        <RestoreForm locale={locale} />
        <p className="mt-10 text-xs text-zinc-500">
          <Link href={p("/downloads")} className="underline hover:text-zinc-300">
            {t.browseDownloads}
          </Link>{" "}
          ·{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="underline hover:text-zinc-300"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </main>
      <Footer locale={locale} />
    </div>
  );
}
