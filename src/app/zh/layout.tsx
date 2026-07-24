import SetHtmlLang from "@/components/SetHtmlLang";

export default function ZhLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SetHtmlLang lang="zh-CN" />
      {children}
    </>
  );
}
