import { marked } from "marked";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { getArticle, getEngineSql, listArticles } from "@/lib/engine/db";
import { extractFaq } from "@/lib/engine/extract";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const revalidate = 900;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sql = getEngineSql();
  const a = sql ? await getArticle(sql, slug) : null;
  if (!a?.zh_title || !a.zh_body_md) return { title: "Not found" };
  const canonical = `${SITE_URL}/zh/blog/${a.slug}`;
  return {
    title: { absolute: a.zh_title },
    description: a.zh_description || a.description,
    keywords: a.keywords?.length ? a.keywords : undefined,
    alternates: {
      canonical,
      languages: {
        en: `${SITE_URL}/blog/${a.slug}`,
        "zh-CN": canonical,
        "x-default": `${SITE_URL}/blog/${a.slug}`,
      },
    },
    openGraph: {
      title: a.zh_title,
      description: a.zh_description || a.description,
      type: "article",
      url: canonical,
      publishedTime: a.published_at || a.created_at,
      modifiedTime: a.updated_at || a.published_at || a.created_at,
    },
  };
}

export default async function ArticlePageZh({ params }: Props) {
  const { slug } = await params;
  const sql = getEngineSql();
  if (!sql) notFound();
  const a = await getArticle(sql, slug);
  if (!a) notFound();
  // Translation not ready yet: send readers to the English original
  if (!a.zh_title || !a.zh_body_md) redirect(`/blog/${slug}`);

  const all = (await listArticles(sql, 50)).filter(
    (x) => x.zh_title && x.zh_body_md
  );
  const related = all
    .filter((x) => x.slug !== a.slug)
    .sort((x, y) => {
      const xi = x.keywords?.some((k) => a.keywords?.includes(k)) ? 1 : 0;
      const yi = y.keywords?.some((k) => a.keywords?.includes(k)) ? 1 : 0;
      return yi - xi;
    })
    .slice(0, 4);

  const html = await marked.parse(a.zh_body_md);
  const canonical = `${SITE_URL}/zh/blog/${a.slug}`;
  const published = a.published_at || a.created_at;
  const modified = a.updated_at || published;
  const faq = extractFaq(a.zh_body_md);

  const graph: object[] = [
    {
      "@type": "Article",
      "@id": `${canonical}#article`,
      headline: a.zh_title,
      description: a.zh_description || a.description,
      datePublished: published,
      dateModified: modified,
      inLanguage: "zh-CN",
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
        { "@type": "ListItem", position: 1, name: "首页", item: `${SITE_URL}/zh` },
        { "@type": "ListItem", position: 2, name: "博客", item: `${SITE_URL}/zh/blog` },
        { "@type": "ListItem", position: 3, name: a.zh_title, item: canonical },
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
    <div className="flex min-h-screen flex-col" lang="zh-CN">
      <Nav locale="zh" />
      <article className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <nav aria-label="面包屑" className="mb-2 text-xs text-zinc-500">
          <Link href="/zh" className="text-emerald-400 hover:underline">
            首页
          </Link>
          {" / "}
          <Link href="/zh/blog" className="text-emerald-400 hover:underline">
            博客
          </Link>
          {" / "}
          <span className="text-zinc-400">{a.zh_title}</span>
        </nav>
        <p className="mb-2 text-xs text-zinc-500">
          发布于{" "}
          <time dateTime={new Date(published).toISOString()}>
            {new Date(published).toISOString().slice(0, 10)}
          </time>
          {modified !== published && (
            <>
              {" · 更新于 "}
              <time dateTime={new Date(modified).toISOString()}>
                {new Date(modified).toISOString().slice(0, 10)}
              </time>
            </>
          )}
          {" · AI 生成,已对照实时价目自动事实核查 · "}
          <Link
            href={`/blog/${a.slug}`}
            className="text-emerald-400 hover:underline"
          >
            English
          </Link>
        </p>
        <h1 className="mb-6 text-3xl font-bold">{a.zh_title}</h1>
        <div
          className="prose prose-invert prose-zinc max-w-none
                     prose-headings:font-semibold prose-a:text-emerald-400
                     prose-code:text-emerald-300 prose-pre:bg-zinc-900"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <div className="mt-10 rounded-lg border border-zinc-800 p-5 text-sm">
          <div className="mb-1 font-semibold">立即体验</div>
          <p className="text-zinc-400">
            文中提到的模型都已上线我们的 OpenAI 兼容 API,按 token 透明计价。{" "}
            <Link href="/zh/pricing" className="text-emerald-400 underline">
              查看价格并获取 API Key →
            </Link>
          </p>
        </div>
        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 font-semibold">相关文章</h2>
            <ul className="space-y-2 text-sm">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/zh/blog/${r.slug}`}
                    className="text-emerald-400 hover:underline"
                  >
                    {r.zh_title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
      <Footer locale="zh" />
    </div>
  );
}
