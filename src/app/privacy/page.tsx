import type { Metadata } from "next";
import LegalContent from "@/components/pages/LegalContent";
import { legal } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: legal.en.privacy.title,
  description: legal.en.privacy.metaDescription,
  alternates: {
    canonical: `${SITE_URL}/privacy`,
    languages: {
      en: `${SITE_URL}/privacy`,
      "zh-CN": `${SITE_URL}/zh/privacy`,
      "x-default": `${SITE_URL}/privacy`,
    },
  },
};

export default function PrivacyPage() {
  return <LegalContent locale="en" slug="privacy" />;
}
