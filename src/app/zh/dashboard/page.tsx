import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";

export const metadata: Metadata = {
  title: "控制台",
  robots: { index: false, follow: false },
};

export default function DashboardPageZh() {
  return <Dashboard locale="zh" />;
}
