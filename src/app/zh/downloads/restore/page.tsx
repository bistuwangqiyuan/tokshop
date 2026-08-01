import type { Metadata } from "next";
import RestoreContent from "@/components/pages/RestoreContent";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "找回你的下载",
  description:
    "输入购买 TokShop 付费文档时获得的兑换码，即可在本浏览器中重新解锁该文档。",
  alternates: {
    canonical: `${SITE_URL}/zh/downloads/restore`,
    languages: {
      en: `${SITE_URL}/downloads/restore`,
      "zh-CN": `${SITE_URL}/zh/downloads/restore`,
      "x-default": `${SITE_URL}/downloads/restore`,
    },
  },
  robots: { index: false, follow: true },
};

export default function ZhRestorePage() {
  return <RestoreContent locale="zh" />;
}
