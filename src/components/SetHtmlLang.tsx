"use client";

import { useEffect } from "react";

/**
 * The root layout renders <html lang="en">; nested layouts cannot override
 * it. This corrects the document language on the /zh subtree client-side
 * (crawlers also get hreflang + lang attributes on the SSR content wrapper).
 */
export default function SetHtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = previous || "en";
    };
  }, [lang]);
  return null;
}
