import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { getArticle, getEngineSql, listArticles } from "@/lib/engine/db";
import { extractFaq } from "@/lib/engine/extract";
import { renderArticleHtml } from "@/lib/markdown";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const revalidate = 900;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sql = getEngineSql();
  const a = sql ? await getArticle(sql, slug) : null;
  if (!a) return { title: "Not found" };
  const canonical = `${SITE_URL}/blog/${a.slug}`;
  return {
    // no brand suffix on article titles: keep <65 chars (SERP truncation line)
    title: { absolute: a.title },
    description: a.description,
    keywords: a.keywords?.length ? a.keywords : undefined,
    alternates: {
      canonical,
      ...(a.zh_body_md
        ? {
            languages: {
              en: canonical,
              "zh-CN": `${SITE_URL}/zh/blog/${a.slug}`,
              "x-default": canonical,
            },
          }
        : {}),
    },
    openGraph: {
      title: a.title,
      description: a.description,
      type: "article",
      url: canonical,
      publishedTime: a.published_at || a.created_at,
      modifiedTime: a.updated_at || a.published_at || a.created_at,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const sql = getEngineSql();
  if (!sql) notFound();
  const a = await getArticle(sql, slug);
  if (!a) notFound();

  const all = await listArticles(sql, 50);
  const related = all
    .filter((x) => x.slug !== a.slug)
    .sort((x, y) => {
      const xi = x.keywords?.some((k) => a.keywords?.includes(k)) ? 1 : 0;
      const yi = y.keywords?.some((k) => a.keywords?.includes(k)) ? 1 : 0;
      return yi - xi;
    })
    .slice(0, 4);

  const html = renderArticleHtml(a.body_md);
  const canonical = `${SITE_URL}/blog/${a.slug}`;
  const published = a.published_at || a.created_at;
  const modified = a.updated_at || published;
  const faq = extractFaq(a.body_md);

  const graph: object[] = [
    {
      "@type": "Article",
      "@id": `${canonical}#article`,
      headline: a.title,
      description: a.description,
      datePublished: published,
      dateModified: modified,
      inLanguage: "en",
      keywords: a.keywords?.join(", ") || undefined,
      image: `${SITE_URL}/blog/${a.slug}/opengraph-image`,
      author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      publisher: {
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
        logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.svg` },
      },
      mainEntityOfPage: canonical,
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${canonical}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
        { "@type": "ListItem", position: 3, name: a.title, item: canonical },
      ],
    },
  ];
  if (faq.length >= 2) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${canonical}#faq`,
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }
  const jsonLd = { "@context": "https://schema.org", "@graph": graph };

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <article className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <nav aria-label="Breadcrumb" className="mb-2 text-xs text-zinc-500">
          <Link href="/" className="text-emerald-400 hover:underline">
            Home
          </Link>
          {" / "}
          <Link href="/blog" className="text-emerald-400 hover:underline">
            Blog
          </Link>
          {" / "}
          <span className="text-zinc-400">{a.title}</span>
        </nav>
        <p className="mb-2 text-xs text-zinc-500">
          Published{" "}
          <time dateTime={new Date(published).toISOString()}>
            {new Date(published).toISOString().slice(0, 10)}
          </time>
          {modified !== published && (
            <>
              {" · Updated "}
              <time dateTime={new Date(modified).toISOString()}>
                {new Date(modified).toISOString().slice(0, 10)}
              </time>
            </>
          )}
          {" · AI-generated, automated fact-check against live catalog"}
          {a.zh_body_md && (
            <>
              {" · "}
              <Link
                href={`/zh/blog/${a.slug}`}
                className="text-emerald-400 hover:underline"
              >
                中文版
              </Link>
            </>
          )}
        </p>
        <h1 className="mb-6 text-3xl font-bold">{a.title}</h1>
        <div
          className="prose prose-invert prose-zinc max-w-none
                     prose-headings:font-semibold prose-a:text-emerald-400
                     prose-code:text-emerald-300 prose-pre:bg-zinc-900"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <div className="mt-10 rounded-lg border border-zinc-800 p-5 text-sm">
          <div className="mb-1 font-semibold">Try it now</div>
          <p className="text-zinc-400">
            All models discussed are live on our OpenAI-compatible API with
            transparent per-token pricing.{" "}
            <Link href="/pricing" className="text-emerald-400 underline">
              See pricing and get a key →
            </Link>
          </p>
        </div>
        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 font-semibold">Related articles</h2>
            <ul className="space-y-2 text-sm">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={`/blog/${r.slug}`} className="text-emerald-400 hover:underline">
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
      <Footer />
    </div>
  );
}
