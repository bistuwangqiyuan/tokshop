import type { Metadata } from "next";
import HomeContent from "@/components/pages/HomeContent";

export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: "TokShop - 开源大模型 Token,按量付费" },
  description:
    "OpenAI 兼容的按量付费 API,直连 DeepSeek、GLM、Qwen、Kimi 等顶级开源模型。按 token 透明计价(美元),即时自助发放 API Key,预付余额。",
  alternates: {
    canonical: "/zh",
    languages: { en: "/", "zh-CN": "/zh", "x-default": "/" },
  },
};

export default function HomeZh() {
  return <HomeContent locale="zh" />;
}
