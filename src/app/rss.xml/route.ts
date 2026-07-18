import { getEngineSql, listArticles } from "@/lib/engine/db";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export const revalidate = 0;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET() {
  const sql = getEngineSql();
  const articles = sql ? await listArticles(sql, 50) : [];
  const items = articles
    .map(
      (a) => `  <item>
    <title>${esc(a.title)}</title>
    <link>${SITE_URL}/blog/${a.slug}</link>
    <guid>${SITE_URL}/blog/${a.slug}</guid>
    <description>${esc(a.description)}</description>
    <pubDate>${new Date(a.published_at || a.created_at).toUTCString()}</pubDate>
  </item>`
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(SITE_NAME)} Blog</title>
  <link>${SITE_URL}</link>
  <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
  <description>${esc(SITE_DESCRIPTION)}</description>
  <language>en</language>
${items}
</channel>
</rss>`;
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
