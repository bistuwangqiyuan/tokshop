"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dict, localePath, type Locale } from "@/lib/i18n";

export default function RestoreForm({ locale }: { locale: Locale }) {
  const t = dict[locale].downloads;
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/downloads/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(t.restoreFail);
        return;
      }
      router.push(localePath(locale, `/downloads/${data.sku}/read`));
    } catch {
      setMsg(t.restoreFail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 max-w-md">
      <label htmlFor="code" className="block text-sm font-medium text-zinc-200">
        {t.redeemCode}
      </label>
      <input
        id="code"
        name="code"
        required
        autoComplete="off"
        spellCheck={false}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="TSK-XXXX-XXXX-XXXX"
        className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm tracking-wider text-zinc-100 outline-none focus:border-emerald-500"
      />
      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {t.restoreSubmit}
      </button>
      {msg && <p className="mt-4 text-sm text-amber-300">{msg}</p>}
    </form>
  );
}
