import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { getEngineSql, listArticles } from "@/lib/engine/db";
import { SITE_URL } from "@/lib/site";

export const revalidate = 60;

export const metadata = {
  title: "Blog",
  description:
    "Guides and analysis on open-source LLM APIs: DeepSeek, GLM, Qwen pricing, benchmarks, migration and cost engineering.",
  alternates: { canonical: `${SITE_URL}/blog` },
};

export default async function BlogPage() {
  const sql = getEngineSql();
  const articles = sql ? await listArticles(sql, 200) : [];
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <h1 className="text-3xl font-bold">Blog</h1>
        <p className="mt-3 mb-8 text-sm text-zinc-400">
          Guides on open-source model APIs, pricing and cost engineering.
          Articles are AI-generated from live trend signals, fact-checked
          against our real catalog, and reviewed by automated QC.
        </p>
        <div className="space-y-5">
          {articles.map((a) => (
            <Link
              key={a.slug}
              href={`/blog/${a.slug}`}
              className="block rounded-lg border border-zinc-800 p-5 hover:border-zinc-600"
            >
              <div className="font-semibold">{a.title}</div>
              <div className="mt-1 text-sm text-zinc-400">{a.description}</div>
              <div className="mt-2 text-xs text-zinc-500">
                {new Date(a.published_at || a.created_at).toISOString().slice(0, 10)}
                {a.keywords?.length ? ` · ${a.keywords.slice(0, 4).join(" · ")}` : ""}
              </div>
            </Link>
          ))}
          {!articles.length && (
            <p className="text-sm text-zinc-500">
              First articles are being generated — check back shortly.
            </p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
