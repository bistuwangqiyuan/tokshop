import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { dict, localePath, type Locale } from "@/lib/i18n";
import { resolveEntitlement } from "@/lib/entitlement";
import { findDownloadProduct } from "@/lib/products";
import { renderPaidDoc } from "@/content/paid";

/**
 * Print-friendly reader for a purchased document. Readers who want a PDF use
 * their browser's print dialog: generating real PDFs would mean shipping a
 * headless browser into a serverless function, which is not worth it for a
 * one-dollar product.
 */
export default async function ReaderContent({
  locale,
  sku,
  code,
}: {
  locale: Locale;
  sku: string;
  code?: string;
}) {
  const product = findDownloadProduct(sku);
  if (!product) notFound();

  const t = dict[locale].downloads;
  const p = (path: string) => localePath(locale, path);

  const entitlement = await resolveEntitlement(sku, code);
  if (!entitlement) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-20">
        <h1 className="text-2xl font-bold">{t.restoreTitle}</h1>
        <p className="mt-4 text-sm text-zinc-400">{t.badLink}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={p("/downloads/restore")}
            className="rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
          >
            {t.restoreLink}
          </Link>
          <Link
            href={p("/downloads")}
            className="rounded-md border border-zinc-700 px-5 py-2.5 text-sm text-zinc-200 hover:border-zinc-500"
          >
            {t.browseDownloads}
          </Link>
        </div>
      </main>
    );
  }

  const markdown = await renderPaidDoc(sku, locale);
  if (!markdown) notFound();
  const html = await marked.parse(markdown);

  return (
    <main
      className="mx-auto w-full max-w-3xl px-6 py-12"
      lang={locale === "zh" ? "zh-CN" : "en"}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-6 print:hidden">
        <Link
          href={p("/downloads")}
          className="text-sm text-emerald-400 hover:underline"
        >
          ← {t.title}
        </Link>
        <div className="flex flex-wrap gap-3 text-sm">
          <a
            href={`/api/downloads/${sku}?lang=${locale}`}
            className="rounded-md border border-zinc-700 px-4 py-2 text-zinc-200 hover:border-zinc-500"
          >
            {t.downloadMd}
          </a>
          <Link
            href={
              locale === "zh" ? `/downloads/${sku}/read` : `/zh/downloads/${sku}/read`
            }
            className="rounded-md border border-zinc-700 px-4 py-2 text-zinc-200 hover:border-zinc-500"
          >
            {locale === "zh" ? t.langEn : t.langZh}
          </Link>
        </div>
      </div>
      <p className="mt-4 text-xs text-zinc-500 print:hidden">{t.printHint}</p>

      <article
        className="prose prose-invert prose-zinc mt-8 max-w-none
                   prose-headings:font-semibold prose-a:text-emerald-400
                   prose-code:text-emerald-300 prose-pre:bg-zinc-900
                   print:prose-neutral print:max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </main>
  );
}
