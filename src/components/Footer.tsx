import Link from "next/link";
import {
  CONTACT_EMAIL,
  CONTACT_EMAIL_CN,
  dict,
  localePath,
  type Locale,
} from "@/lib/i18n";

export default function Footer({ locale = "en" }: { locale?: Locale }) {
  const t = dict[locale].footer;
  const p = (path: string) => localePath(locale, path);
  return (
    <footer className="border-t border-zinc-800 py-8 text-center text-sm text-zinc-500">
      <p>
        {t.tagline} ·{" "}
        <Link href={p("/docs")} className="underline hover:text-zinc-300">
          {t.docs}
        </Link>{" "}
        ·{" "}
        <Link href={p("/pricing")} className="underline hover:text-zinc-300">
          {t.pricing}
        </Link>{" "}
        ·{" "}
        <Link href={p("/blog")} className="underline hover:text-zinc-300">
          {t.blog}
        </Link>
      </p>
      <p className="mt-2">
        {t.contact}:{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="underline hover:text-zinc-300"
        >
          {CONTACT_EMAIL}
        </a>{" "}
        ·{" "}
        <a
          href={`mailto:${CONTACT_EMAIL_CN}`}
          className="underline hover:text-zinc-300"
        >
          {CONTACT_EMAIL_CN}
        </a>
      </p>
    </footer>
  );
}
