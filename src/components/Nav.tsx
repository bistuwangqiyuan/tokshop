import Link from "next/link";
import LangSwitcher from "@/components/LangSwitcher";
import { dict, localePath, type Locale } from "@/lib/i18n";

export default function Nav({ locale = "en" }: { locale?: Locale }) {
  const t = dict[locale].nav;
  const p = (path: string) => localePath(locale, path);
  return (
    <header className="border-b border-zinc-800">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href={p("/")} className="text-lg font-semibold tracking-tight">
          <span className="text-emerald-400">Tok</span>Shop
        </Link>
        <div className="flex items-center gap-6 text-sm text-zinc-300">
          <Link href={p("/pricing")} className="hover:text-white">
            {t.pricing}
          </Link>
          <Link href={p("/docs")} className="hover:text-white">
            {t.docs}
          </Link>
          <Link href="/blog" className="hover:text-white">
            {t.blog}
          </Link>
          <Link href={p("/login")} className="hover:text-white">
            {t.signIn}
          </Link>
          <Link
            href={p("/register")}
            className="rounded-md bg-emerald-500 px-3 py-1.5 font-medium text-zinc-950 hover:bg-emerald-400"
          >
            {t.getKey}
          </Link>
          <LangSwitcher />
        </div>
      </nav>
    </header>
  );
}
