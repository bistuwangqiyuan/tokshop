import type { Metadata } from "next";
import DeliveryContent from "@/components/pages/DeliveryContent";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "你的下载",
  robots: { index: false, follow: false },
};

export default async function ZhDownloadSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; t?: string }>;
}) {
  const { order, t } = await searchParams;
  return <DeliveryContent locale="zh" orderId={order} token={t} />;
}
