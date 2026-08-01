import type { Metadata } from "next";
import DeliveryContent from "@/components/pages/DeliveryContent";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your download",
  // Order-specific and behind a signed link: nothing here belongs in an index.
  robots: { index: false, follow: false },
};

export default async function DownloadSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; t?: string }>;
}) {
  const { order, t } = await searchParams;
  return <DeliveryContent locale="en" orderId={order} token={t} />;
}
