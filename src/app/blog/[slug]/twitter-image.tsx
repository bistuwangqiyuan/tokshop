import { getArticle, getEngineSql } from "@/lib/engine/db";
import { brandImage, OG_SIZE } from "@/lib/og";

export const alt = "TokShop article";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sql = getEngineSql();
  const a = sql ? await getArticle(sql, slug) : null;
  return brandImage(
    a?.title ?? "TokShop Blog",
    "tokshop.xyz/blog - open-source LLM APIs, pricing and cost engineering"
  );
}
