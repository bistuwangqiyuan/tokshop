import type { Metadata } from "next";
import ContactContent from "@/components/pages/ContactContent";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact TokShop: support email, operator identity and business address. Refunds, billing, data deletion and abuse reports are answered within one business day.",
  alternates: {
    canonical: `${SITE_URL}/contact`,
    languages: {
      en: `${SITE_URL}/contact`,
      "zh-CN": `${SITE_URL}/zh/contact`,
      "x-default": `${SITE_URL}/contact`,
    },
  },
};

export default function ContactPage() {
  return <ContactContent locale="en" />;
}
