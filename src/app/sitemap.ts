import type { MetadataRoute } from "next";
import { getEngineSql, listArticles } from "@/lib/engine/db";
import { SITE_URL } from "@/lib/site";

// Dynamic rendering: new articles appear in the sitemap immediately
export const revalidate = 0;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/pricing`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/docs`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/blog`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/downloads`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/refund`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    // Chinese versions
    { url: `${SITE_URL}/zh`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/zh/pricing`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/zh/docs`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/zh/blog`, changeFrequency: "hourly", priority: 0.7 },
    {
      url: `${SITE_URL}/zh/downloads`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    { url: `${SITE_URL}/zh/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/zh/refund`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/zh/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
  const sql = getEngineSql();
  if (!sql) return statics;
  const articles = await listArticles(sql, 5000);
  return [
    ...statics,
    ...articles.map((a) => ({
      url: `${SITE_URL}/blog/${a.slug}`,
      lastModified: a.updated_at
        ? new Date(a.updated_at)
        : a.published_at
          ? new Date(a.published_at)
          : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...articles
      .filter((a) => a.zh_title && a.zh_body_md)
      .map((a) => ({
        url: `${SITE_URL}/zh/blog/${a.slug}`,
        lastModified: a.updated_at
          ? new Date(a.updated_at)
          : a.published_at
            ? new Date(a.published_at)
            : undefined,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
  ];
}
