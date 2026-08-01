import type { Metadata } from "next";
import DownloadsContent from "@/components/pages/DownloadsContent";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "资料下载",
  description:
    "来自真实运营的大模型 API 业务的一美元实战文档：单位经济模型、流式中断也不丢账的按 token 计费、支付幂等设计与游客结账。支持信用卡、Apple Pay、Google Pay、支付宝与微信支付，无需注册。",
  alternates: {
    canonical: `${SITE_URL}/zh/downloads`,
    languages: {
      en: `${SITE_URL}/downloads`,
      "zh-CN": `${SITE_URL}/zh/downloads`,
      "x-default": `${SITE_URL}/downloads`,
    },
  },
};

export default function ZhDownloadsPage() {
  return <DownloadsContent locale="zh" />;
}
