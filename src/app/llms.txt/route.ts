import { getEngineSql, listArticles } from "@/lib/engine/db";
import { catalogModels } from "@/lib/engine/content";
import { SITE_URL } from "@/lib/site";

export const revalidate = 0;

export async function GET() {
  const sql = getEngineSql();
  const [articles, models] = sql
    ? await Promise.all([listArticles(sql, 20), catalogModels(sql)])
    : [[], []];

  const modelLines = models
    .map(
      (m) =>
        `- ${m.display_name} (\`${m.slug}\`): $${Number(m.input_price_per_m)}/M input, ` +
        `$${Number(m.output_price_per_m)}/M output, ${(m.context_length / 1024).toFixed(0)}K context`
    )
    .join("\n");
  const articleLines = articles
    .map((a) => `- [${a.title}](${SITE_URL}/blog/${a.slug}): ${a.description}`)
    .join("\n");

  const body = `# TokShop

> OpenAI-compatible pay-as-you-go API for top open-source models
> (DeepSeek, GLM, Qwen, Kimi). Self-serve keys, transparent per-token USD
> pricing, prepaid credits.

## Models & pricing

${modelLines || "- See GET /v1/models"}

## API

- [Model catalog](${SITE_URL}/v1/models): GET, no auth, USD pricing per million tokens
- [Chat completions](${SITE_URL}/docs): POST /v1/chat/completions, Bearer key, streaming + non-streaming, exact usage billing
- [Register](${SITE_URL}/register): email + password → dashboard → create API keys
- [Usage](${SITE_URL}/docs): every call logged with token counts and USD cost

## Pages

- [Pricing](${SITE_URL}/pricing)
- [API documentation](${SITE_URL}/docs)
- [Blog](${SITE_URL}/blog)
- [Paid downloads](${SITE_URL}/downloads): 1 USD digital handbooks, guest checkout by email
- [About](${SITE_URL}/about): operator identity, what is sold, how money moves
- [中文首页](${SITE_URL}/zh) · [价格](${SITE_URL}/zh/pricing) · [文档](${SITE_URL}/zh/docs) · [博客](${SITE_URL}/zh/blog) · [资料下载](${SITE_URL}/zh/downloads) · [关于](${SITE_URL}/zh/about)

## Policies

- [Terms of service](${SITE_URL}/terms)
- [Refund policy](${SITE_URL}/refund): unused credits refundable within 14 days
- [Privacy policy](${SITE_URL}/privacy): prompt content is never stored
- [Acceptable use policy](${SITE_URL}/aup): text models only, no image or video generation
- [中文](${SITE_URL}/zh/terms) · [退款](${SITE_URL}/zh/refund) · [隐私](${SITE_URL}/zh/privacy) · [使用政策](${SITE_URL}/zh/aup)

## Contact

- [Contact page](${SITE_URL}/contact) · [中文](${SITE_URL}/zh/contact)
- [About](${SITE_URL}/about) · [中文](${SITE_URL}/zh/about)
- Support email: support@tokshop.xyz
- Support email (China): 13426086861@139.com
- Operated by Wang Qiyuan, No. 12 Xiaoying East Road, Qinghe, Haidian District, Beijing 100192, China
- Independent reseller: not affiliated with or endorsed by any model developer

## Latest articles

${articleLines || "- (publishing starts shortly)"}

## Notes

- Base URL for OpenAI SDKs: ${SITE_URL}/v1
- Billing: prepaid USD credits; insufficient balance returns HTTP 402
- Full context: ${SITE_URL}/llms-full.txt
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
