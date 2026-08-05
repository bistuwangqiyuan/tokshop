import type { Metadata } from "next";
import AboutContent from "@/components/pages/AboutContent";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "TokShop is operated by Wang Qiyuan in Beijing. Prepaid open-model API credits and digital handbooks, sold with Creem (merchant of record) and optional mainland China wallets.",
  alternates: {
    canonical: `${SITE_URL}/about`,
    languages: {
      en: `${SITE_URL}/about`,
      "zh-CN": `${SITE_URL}/zh/about`,
      "x-default": `${SITE_URL}/about`,
    },
  },
};

export default function AboutPage() {
  return <AboutContent locale="en" />;
}
