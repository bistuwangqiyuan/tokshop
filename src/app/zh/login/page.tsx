import type { Metadata } from "next";
import Nav from "@/components/Nav";
import AuthForm from "@/components/AuthForm";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "登录",
  description: "登录 TokShop 账号,管理 API Key 与余额。",
  alternates: {
    canonical: `${SITE_URL}/zh/login`,
    languages: {
      en: `${SITE_URL}/login`,
      "zh-CN": `${SITE_URL}/zh/login`,
      "x-default": `${SITE_URL}/login`,
    },
  },
  robots: { index: false, follow: true },
};

export default function LoginPageZh() {
  return (
    <div className="flex min-h-screen flex-col" lang="zh-CN">
      <Nav locale="zh" />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <AuthForm mode="login" locale="zh" />
      </main>
    </div>
  );
}
