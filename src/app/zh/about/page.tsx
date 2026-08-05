import type { Metadata } from "next";
import AboutContent from "@/components/pages/AboutContent";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "关于",
  description:
    "TokShop 由王启源在北京个人经营。出售预付开源大模型 API 额度与数字文档；全球卡支付由 Creem（记录商户）处理，国内可选支付宝/微信。",
  alternates: {
    canonical: `${SITE_URL}/zh/about`,
    languages: {
      en: `${SITE_URL}/about`,
      "zh-CN": `${SITE_URL}/zh/about`,
      "x-default": `${SITE_URL}/about`,
    },
  },
};

export default function ZhAboutPage() {
  return <AboutContent locale="zh" />;
}
