import type { Metadata } from "next";
import RestoreContent from "@/components/pages/RestoreContent";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Restore your download",
  description:
    "Enter the redeem code from your TokShop purchase to unlock your document again in this browser.",
  alternates: {
    canonical: `${SITE_URL}/downloads/restore`,
    languages: {
      en: `${SITE_URL}/downloads/restore`,
      "zh-CN": `${SITE_URL}/zh/downloads/restore`,
      "x-default": `${SITE_URL}/downloads/restore`,
    },
  },
  robots: { index: false, follow: true },
};

export default function RestorePage() {
  return <RestoreContent locale="en" />;
}
