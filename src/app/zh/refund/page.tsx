import type { Metadata } from "next";
import LegalContent from "@/components/pages/LegalContent";
import { legal } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: legal.zh.refund.title,
  description: legal.zh.refund.metaDescription,
  alternates: {
    canonical: `${SITE_URL}/zh/refund`,
    languages: {
      en: `${SITE_URL}/refund`,
      "zh-CN": `${SITE_URL}/zh/refund`,
      "x-default": `${SITE_URL}/refund`,
    },
  },
};

export default function ZhRefundPage() {
  return <LegalContent locale="zh" slug="refund" />;
}
