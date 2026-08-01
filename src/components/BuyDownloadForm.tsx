"use client";

import { useState } from "react";
import { dict, type Locale } from "@/lib/i18n";
import type { Rail, XunhuChannel } from "@/lib/products";

type Method =
  | { rail: "creem" }
  | { rail: "xunhupay"; channel: XunhuChannel };

export default function BuyDownloadForm({
  sku,
  locale,
  rails,
  walletChannels,
  cnyAmount,
}: {
  sku: string;
  locale: Locale;
  rails: Rail[];
  walletChannels: XunhuChannel[];
  cnyAmount: number;
}) {
  const t = dict[locale].downloads;
  const p = dict[locale].pay;
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const methods: Method[] = [
    ...(rails.includes("creem") ? [{ rail: "creem" } as Method] : []),
    ...(rails.includes("xunhupay")
      ? walletChannels.map((channel) => ({ rail: "xunhupay", channel }) as Method)
      : []),
  ];

  async function buy(method: Method) {
    if (!email.includes("@")) {
      setMsg(t.emailLabel);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/checkout/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          email,
          locale,
          rail: method.rail,
          ...(method.rail === "xunhupay" ? { channel: method.channel } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.message ?? data.error ?? p.failed);
        return;
      }
      if (!data.checkoutUrl) {
        setMsg(data.note ? p.noRails : p.failed);
        return;
      }
      setMsg(p.redirecting);
      window.location.assign(data.checkoutUrl);
    } catch {
      setMsg(p.failed);
    } finally {
      setBusy(false);
    }
  }

  if (methods.length === 0) {
    return (
      <p className="rounded-md border border-amber-700 bg-amber-950/40 p-4 text-sm text-amber-200">
        {p.noRails}
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
      <label
        htmlFor={`email-${sku}`}
        className="block text-sm font-medium text-zinc-200"
      >
        {t.emailLabel}
      </label>
      <input
        id={`email-${sku}`}
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t.emailPlaceholder}
        className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
      />
      <p className="mt-2 text-xs text-zinc-500">{t.emailNote}</p>

      <p className="mt-6 text-sm font-medium text-zinc-200">{p.chooseMethod}</p>
      <div className="mt-3 grid gap-3">
        {methods.map((method) => {
          const isCard = method.rail === "creem";
          const label = isCard
            ? p.card
            : method.channel === "alipay"
              ? p.alipay
              : p.wechat;
          const note = isCard ? p.cardNote : p.walletNote;
          const price = isCard
            ? "$1.00"
            : `¥${cnyAmount.toFixed(2)} (${p.approx} $1.00)`;
          return (
            <button
              key={isCard ? "creem" : `xunhupay-${method.channel}`}
              type="button"
              disabled={busy}
              onClick={() => buy(method)}
              className="flex items-center justify-between gap-4 rounded-md border border-zinc-700 px-4 py-3 text-left hover:border-emerald-500 disabled:opacity-50"
            >
              <span>
                <span className="block text-sm font-medium text-zinc-100">
                  {label}
                </span>
                <span className="block text-xs text-zinc-500">{note}</span>
              </span>
              <span className="whitespace-nowrap text-sm font-semibold text-emerald-400">
                {price}
              </span>
            </button>
          );
        })}
      </div>

      {msg && <p className="mt-4 text-sm text-amber-300">{msg}</p>}
    </div>
  );
}
