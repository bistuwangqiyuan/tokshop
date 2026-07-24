import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { getEngineSql, listArticles } from "@/lib/engine/db";
import { dict } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "博客",
  description:
    "开源大模型 API 指南与分析:DeepSeek、GLM、Qwen 价格、评测、迁移与成本工程。",
  alternates: {
    canonical: `${SITE_URL}/zh/blog`,
    languages: {
      en: `${SITE_URL}/blog`,
      "zh-CN": `${SITE_URL}/zh/blog`,
      "x-default": `${SITE_URL}/blog`,
    },
  },
};

export default async function BlogPageZh() {
  const t = dict.zh.blog;
  const sql = getEngineSql();
  const articles = (sql ? await listArticles(sql, 200) : []).filter(
    (a) => a.zh_title && a.zh_body_md
  );
  return (
    <div className="flex min-h-screen flex-col" lang="zh-CN">
      <Nav locale="zh" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="mt-3 mb-8 text-sm text-zinc-400">{t.sub}</p>
        <div className="space-y-5">
          {articles.map((a) => (
            <Link
              key={a.slug}
              href={`/zh/blog/${a.slug}`}
              className="block rounded-lg border border-zinc-800 p-5 hover:border-zinc-600"
            >
              <div className="font-semibold">{a.zh_title}</div>
              <div className="mt-1 text-sm text-zinc-400">
                {a.zh_description || a.description}
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                {new Date(a.published_at || a.created_at).toISOString().slice(0, 10)}
                {a.keywords?.length ? ` · ${a.keywords.slice(0, 4).join(" · ")}` : ""}
              </div>
            </Link>
          ))}
          {!articles.length && (
            <p className="text-sm text-zinc-500">{t.empty}</p>
          )}
        </div>
      </main>
      <Footer locale="zh" />
    </div>
  );
}
