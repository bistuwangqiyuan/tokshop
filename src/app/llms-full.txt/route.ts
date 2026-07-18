import { getEngineSql, listArticles } from "@/lib/engine/db";
import { catalogModels } from "@/lib/engine/content";
import { SITE_URL } from "@/lib/site";

export const revalidate = 0;

/** llms-full.txt: full Markdown concatenation of all published articles. */
export async function GET() {
  const sql = getEngineSql();
  const [articles, models] = sql
    ? await Promise.all([listArticles(sql, 200), catalogModels(sql)])
    : [[], []];

  const head = `# TokShop — full context

> OpenAI-compatible pay-as-you-go API for open-source models. This file
> concatenates the model catalog and all published articles in Markdown.

## Model catalog

${models
  .map(
    (m) =>
      `- ${m.display_name} (\`${m.slug}\`): input $${Number(m.input_price_per_m)}/M tok, ` +
      `output $${Number(m.output_price_per_m)}/M tok, context ${m.context_length}`
  )
  .join("\n")}

## API quickstart

Base URL: ${SITE_URL}/v1 — works with any OpenAI SDK.
Sign up: ${SITE_URL}/register → create a key in the dashboard.

---
`;
  const body = articles
    .map(
      (a) => `
# ${a.title}

> ${a.description}
> Published: ${a.published_at || a.created_at} · ${SITE_URL}/blog/${a.slug}

${a.body_md}

---
`
    )
    .join("\n");
  return new Response(head + body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
