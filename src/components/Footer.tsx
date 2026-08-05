import Link from "next/link";
import {
  CONTACT_EMAIL,
  CONTACT_EMAIL_CN,
  dict,
  localePath,
  type Locale,
} from "@/lib/i18n";
import { OPERATOR } from "@/lib/site";

export default function Footer({ locale = "en" }: { locale?: Locale }) {
  const t = dict[locale].footer;
  const operator = OPERATOR[locale];
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
        </Link>{" "}
        ·{" "}
        <Link href={p("/downloads")} className="underline hover:text-zinc-300">
          {t.downloads}
        </Link>{" "}
        ·{" "}
        <Link href={p("/about")} className="underline hover:text-zinc-300">
          {t.about}
        </Link>
      </p>
      <p className="mt-2">
        <Link href={p("/terms")} className="underline hover:text-zinc-300">
          {t.terms}
        </Link>{" "}
        ·{" "}
        <Link href={p("/refund")} className="underline hover:text-zinc-300">
          {t.refund}
        </Link>{" "}
        ·{" "}
        <Link href={p("/privacy")} className="underline hover:text-zinc-300">
          {t.privacy}
        </Link>{" "}
        ·{" "}
        <Link href={p("/aup")} className="underline hover:text-zinc-300">
          {t.aup}
        </Link>{" "}
        ·{" "}
        <Link href={p("/contact")} className="underline hover:text-zinc-300">
          {t.contactPage}
        </Link>{" "}
        ·{" "}
        <Link href={p("/about")} className="underline hover:text-zinc-300">
          {t.about}
        </Link>
      </p>
      <p className="mt-3 text-xs text-zinc-600">
        {operator.name} · {operator.role} · {operator.address}
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
