import type { Metadata } from "next";
import DocsContent from "@/components/pages/DocsContent";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "API 文档",
  description:
    "TokShop OpenAI 兼容 API 使用指南:获取 API Key、查询模型列表、对话补全、流式输出与按 token 计费说明。",
  alternates: {
    canonical: `${SITE_URL}/zh/docs`,
    languages: {
      en: `${SITE_URL}/docs`,
      "zh-CN": `${SITE_URL}/zh/docs`,
      "x-default": `${SITE_URL}/docs`,
    },
  },
};

export default function DocsPageZh() {
  return <DocsContent locale="zh" />;
}
