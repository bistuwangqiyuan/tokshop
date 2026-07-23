import type { Metadata } from "next";
import PricingContent from "@/components/pages/PricingContent";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "价格与 API Key",
  description:
    "DeepSeek、GLM、Qwen、Kimi API 按量付费价格表。注册即可获取 API Key,预付余额充值,按 token 透明计价(美元)。",
  alternates: {
    canonical: `${SITE_URL}/zh/pricing`,
    languages: {
      en: `${SITE_URL}/pricing`,
      "zh-CN": `${SITE_URL}/zh/pricing`,
      "x-default": `${SITE_URL}/pricing`,
    },
  },
};

export default function PricingPageZh() {
  return <PricingContent locale="zh" />;
}
