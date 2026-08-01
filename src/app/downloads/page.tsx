import type { Metadata } from "next";
import DownloadsContent from "@/components/pages/DownloadsContent";
import { SITE_URL } from "@/lib/site";

// Ownership is per-visitor, so this page must not be cached across visitors.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paid downloads",
  description:
    "One-dollar practical documents from a live LLM API business: unit economics, per-token billing that survives aborted streams, payment idempotency and guest checkout. Pay by card, Apple Pay, Google Pay, Alipay or WeChat Pay - no account needed.",
  alternates: {
    canonical: `${SITE_URL}/downloads`,
    languages: {
      en: `${SITE_URL}/downloads`,
      "zh-CN": `${SITE_URL}/zh/downloads`,
      "x-default": `${SITE_URL}/downloads`,
    },
  },
};

export default function DownloadsPage() {
  return <DownloadsContent locale="en" />;
}
