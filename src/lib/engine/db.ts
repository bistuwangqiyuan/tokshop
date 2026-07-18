import { neon } from "@neondatabase/serverless";

/**
 * Raw SQL access for the SEO/GEO engine. Engine tables live in the
 * dedicated `engine` schema, isolated from the Drizzle-managed sales
 * tables in `public`.
 */
export function getEngineSql() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) return null;
  return neon(url);
}

export type Sql = NonNullable<ReturnType<typeof getEngineSql>>;

let schemaReady = false;

export async function ensureEngineSchema(sql: Sql) {
  if (schemaReady) return;
  await sql`CREATE SCHEMA IF NOT EXISTS engine`;
  await sql`
    CREATE TABLE IF NOT EXISTS engine.trends (
      id SERIAL PRIMARY KEY,
      keyword TEXT NOT NULL,
      geo TEXT NOT NULL,
      approx_traffic TEXT NOT NULL DEFAULT '',
      news_context JSONB,
      relevance REAL,                     -- AI relevance 0-1 (NULL = unscored)
      relevance_reason TEXT,
      status TEXT NOT NULL DEFAULT 'new', -- new/relevant/irrelevant/used
      first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (keyword, geo)
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS engine.articles (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      body_md TEXT NOT NULL,
      keywords TEXT[] DEFAULT '{}',
      source TEXT NOT NULL DEFAULT 'evergreen',  -- trend/evergreen
      trend_id INTEGER,
      status TEXT NOT NULL DEFAULT 'published',
      qc_report JSONB,
      model TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_at TIMESTAMPTZ DEFAULT now()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS engine.topics (
      id SERIAL PRIMARY KEY,
      topic TEXT UNIQUE NOT NULL,
      keywords TEXT[] DEFAULT '{}',
      used_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TIMESTAMPTZ
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS engine.seo_scores (
      id SERIAL PRIMARY KEY,
      audit_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
      score REAL NOT NULL,
      pages_audited INTEGER NOT NULL DEFAULT 0,
      pages_with_issues INTEGER NOT NULL DEFAULT 0,
      detail JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS engine.ops_log (
      id SERIAL PRIMARY KEY,
      task TEXT NOT NULL,
      status TEXT NOT NULL,
      detail JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  schemaReady = true;
}

export type Article = {
  id: number;
  slug: string;
  title: string;
  description: string;
  body_md: string;
  keywords: string[];
  source: string;
  model: string | null;
  created_at: string;
  published_at: string | null;
};

export async function listArticles(sql: Sql, limit = 100): Promise<Article[]> {
  try {
    await ensureEngineSchema(sql);
    const rows = await sql`
      SELECT id, slug, title, description, body_md, keywords, source, model,
             created_at, published_at
      FROM engine.articles WHERE status = 'published'
      ORDER BY published_at DESC NULLS LAST, id DESC LIMIT ${limit}`;
    return rows as Article[];
  } catch {
    return [];
  }
}

export async function getArticle(sql: Sql, slug: string): Promise<Article | null> {
  try {
    await ensureEngineSchema(sql);
    const rows = await sql`
      SELECT id, slug, title, description, body_md, keywords, source, model,
             created_at, published_at
      FROM engine.articles
      WHERE slug = ${slug} AND status = 'published' LIMIT 1`;
    return (rows[0] as Article) ?? null;
  } catch {
    return null;
  }
}
