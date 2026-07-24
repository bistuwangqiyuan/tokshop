import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const PRIVATE_PATHS = ["/api/", "/dashboard", "/login", "/register"];

/**
 * AI/LLM crawlers explicitly allowed (GEO): being explicit removes any
 * ambiguity for engines that check for their own UA group before crawling.
 * Sources: OpenAI (GPTBot/OAI-SearchBot), Anthropic (ClaudeBot), Perplexity
 * (PerplexityBot), Google (Google-Extended), Common Crawl (CCBot), Meta,
 * Amazon, Apple (Applebot-Extended).
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "CCBot",
  "meta-externalagent",
  "Amazonbot",
  "Applebot-Extended",
  "Bytespider",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: PRIVATE_PATHS,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
