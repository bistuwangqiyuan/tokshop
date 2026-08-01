import type { Metadata } from "next";
import LegalContent from "@/components/pages/LegalContent";
import { legal } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: legal.en.refund.title,
  description: legal.en.refund.metaDescription,
  alternates: {
    canonical: `${SITE_URL}/refund`,
    languages: {
      en: `${SITE_URL}/refund`,
      "zh-CN": `${SITE_URL}/zh/refund`,
      "x-default": `${SITE_URL}/refund`,
    },
  },
};

export default function RefundPage() {
  return <LegalContent locale="en" slug="refund" />;
}
