import type { Metadata } from "next";
import LegalContent from "@/components/pages/LegalContent";
import { legal } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: legal.en.terms.title,
  description: legal.en.terms.metaDescription,
  alternates: {
    canonical: `${SITE_URL}/terms`,
    languages: {
      en: `${SITE_URL}/terms`,
      "zh-CN": `${SITE_URL}/zh/terms`,
      "x-default": `${SITE_URL}/terms`,
    },
  },
};

export default function TermsPage() {
  return <LegalContent locale="en" slug="terms" />;
}
