import type { Metadata } from "next";
import Nav from "@/components/Nav";
import AuthForm from "@/components/AuthForm";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "注册账号",
  description:
    "免费注册 TokShop 账号:几分钟内获取 OpenAI 兼容 API Key,调用 DeepSeek、GLM、Qwen、Kimi。",
  alternates: {
    canonical: `${SITE_URL}/zh/register`,
    languages: {
      en: `${SITE_URL}/register`,
      "zh-CN": `${SITE_URL}/zh/register`,
      "x-default": `${SITE_URL}/register`,
    },
  },
};

export default function RegisterPageZh() {
  return (
    <div className="flex min-h-screen flex-col" lang="zh-CN">
      <Nav locale="zh" />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <AuthForm mode="register" locale="zh" />
      </main>
    </div>
  );
}
