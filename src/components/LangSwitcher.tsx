"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** EN / 中文 toggle. English lives at the root URLs, Chinese under /zh. */
export default function LangSwitcher() {
  const pathname = usePathname() || "/";
  const isZh = pathname === "/zh" || pathname.startsWith("/zh/");
  const enHref = isZh ? pathname.replace(/^\/zh/, "") || "/" : pathname;
  const zhHref = isZh ? pathname : pathname === "/" ? "/zh" : `/zh${pathname}`;

  return (
    <span className="flex items-center gap-1 text-xs text-zinc-500">
      <Link
        href={enHref}
        className={isZh ? "hover:text-white" : "font-semibold text-white"}
      >
        EN
      </Link>
      <span>/</span>
      <Link
        href={zhHref}
        className={isZh ? "font-semibold text-white" : "hover:text-white"}
      >
        中文
      </Link>
    </span>
  );
}
