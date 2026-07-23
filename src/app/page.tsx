import type { Metadata } from "next";
import HomeContent from "@/components/pages/HomeContent";

export const revalidate = 300;

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
    languages: { en: "/", "zh-CN": "/zh", "x-default": "/" },
  },
};

export default function Home() {
  return <HomeContent locale="en" />;
}
