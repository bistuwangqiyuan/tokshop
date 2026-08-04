import type { Metadata } from "next";
import LegalContent from "@/components/pages/LegalContent";
import { legal } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: legal.en.aup.title,
  description: legal.en.aup.metaDescription,
  alternates: {
    canonical: `${SITE_URL}/aup`,
    languages: {
      en: `${SITE_URL}/aup`,
      "zh-CN": `${SITE_URL}/zh/aup`,
      "x-default": `${SITE_URL}/aup`,
    },
  },
};

export default function AupPage() {
  return <LegalContent locale="en" slug="aup" />;
}
