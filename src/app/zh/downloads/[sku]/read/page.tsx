import type { Metadata } from "next";
import ReaderContent from "@/components/pages/ReaderContent";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "在线阅读",
  robots: { index: false, follow: false },
};

export default async function ZhReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { sku } = await params;
  const { code } = await searchParams;
  return <ReaderContent locale="zh" sku={sku} code={code} />;
}
