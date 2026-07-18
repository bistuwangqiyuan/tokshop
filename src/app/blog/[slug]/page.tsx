import { marked } from "marked";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import { getArticle, getEngineSql, listArticles } from "@/lib/engine/db";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const revalidate = 900;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sql = getEngineSql();
  const a = sql ? await getArticle(sql, slug) : null;
  if (!a) return { title: "Not found" };
  return {
    // no brand suffix on article titles: keep <65 chars (SERP truncation line)
    title: { absolute: a.title },
    description: a.description,
    alternates: { canonical: `${SITE_URL}/blog/${a.slug}` },
    openGraph: {
      title: a.title,
      description: a.description,
      type: "article",
      url: `${SITE_URL}/blog/${a.slug}`,
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

  const html = await marked.parse(a.body_md);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.description,
    datePublished: a.published_at || a.created_at,
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}/blog/${a.slug}`,
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <article className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <p className="mb-2 text-xs text-zinc-500">
          <Link href="/blog" className="text-emerald-400">← Blog</Link>
          {" · "}
          {new Date(a.published_at || a.created_at).toISOString().slice(0, 10)}
          {" · AI-generated, automated fact-check against live catalog"}
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
    </div>
  );
}
