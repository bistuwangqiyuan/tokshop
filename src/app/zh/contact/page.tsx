import type { Metadata } from "next";
import ContactContent from "@/components/pages/ContactContent";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "联系我们",
  description:
    "联系 TokShop：客服邮箱、经营者身份与经营地址。退款、计费、数据删除与滥用举报均在一个工作日内回复。",
  alternates: {
    canonical: `${SITE_URL}/zh/contact`,
    languages: {
      en: `${SITE_URL}/contact`,
      "zh-CN": `${SITE_URL}/zh/contact`,
      "x-default": `${SITE_URL}/contact`,
    },
  },
};

export default function ZhContactPage() {
  return <ContactContent locale="zh" />;
}
