"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { dict, localePath, type Locale } from "@/lib/i18n";

type Me = { id: string; email: string; balance: string };
type Key = {
  id: string;
  keyPrefix: string;
  name: string;
  status: string;
  createdAt: string;
};
type UsageLog = {
  id: string;
  modelSlug: string;
  inputTokens: number;
  outputTokens: number;
  cost: string;
  stream: boolean;
  createdAt: string;
};
type Totals = {
  totalCalls: number;
  totalInput: number;
  totalOutput: number;
  totalCost: string;
};
type Rail = "creem" | "xunhupay";
type Channel = "alipay" | "wechat";
type Pack = {
  sku: string;
  usd: number;
  cny: number;
  oncePerAccount: boolean;
  used: boolean;
};
type Options = { rails: Rail[]; channels: Channel[]; packs: Pack[] };
type MyDownload = {
  orderId: string;
  sku: string;
  title: string;
  version: string;
  redeemCode: string | null;
  paidAt: string | null;
};

export default function Dashboard({ locale = "en" }: { locale?: Locale }) {
  const router = useRouter();
  const t = dict[locale].dash;
  const pay = dict[locale].pay;
  const dl = dict[locale].downloads;
  const p = (path: string) => localePath(locale, path);
  const [me, setMe] = useState<Me | null>(null);
  const [keys, setKeys] = useState<Key[]>([]);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [downloads, setDownloads] = useState<MyDownload[]>([]);
  const [rail, setRail] = useState<Rail | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);

  const load = useCallback(async () => {
    const meRes = await fetch("/api/auth/me");
    if (meRes.status === 401) {
      router.push(localePath(locale, "/login"));
      return;
    }
    const meData = await meRes.json();
    const [keysRes, usageRes, optionsRes, downloadsRes] = await Promise.all([
      fetch("/api/keys"),
      fetch("/api/usage"),
      fetch("/api/checkout/options"),
      fetch(`/api/downloads/mine?lang=${locale}`),
    ]);
    const keysData = await keysRes.json();
    const usageData = await usageRes.json();
    const optionsData: Options = await optionsRes.json();
    const downloadsData = await downloadsRes.json();
    setMe(meData.user);
    setKeys(keysData.keys ?? []);
    setLogs(usageData.logs ?? []);
    setTotals(usageData.totals ?? null);
    setOptions(optionsData);
    setDownloads(downloadsData.downloads ?? []);
    setRail((current) => current ?? optionsData.rails[0] ?? null);
    setChannel((current) => current ?? optionsData.channels[0] ?? null);
  }, [router, locale]);

  useEffect(() => {
    // False positive: `load` is async, all setState calls happen after awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function createKey() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "default" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? t.createKeyFailed);
        return;
      }
      setNewKey(data.key);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/keys/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function topUp(sku: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          locale,
          ...(rail ? { rail } : {}),
          ...(rail === "xunhupay" && channel ? { channel } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(
          data.error === "starter_pack_used"
            ? pay.starterUsed
            : (data.message ?? data.error ?? t.checkoutFailed)
        );
        return;
      }
      if (!data.checkoutUrl) {
        setMsg(pay.noRails);
        return;
      }
      window.location.assign(data.checkoutUrl);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(p("/"));
    router.refresh();
  }

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">
        {t.loading}
      </div>
    );
  }

  return (
    <div className="min-h-screen" lang={locale === "zh" ? "zh-CN" : "en"}>
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href={p("/")} className="text-lg font-semibold">
            <span className="text-emerald-400">Tok</span>Shop
          </Link>
          <div className="flex items-center gap-4 text-sm text-zinc-400">
            <span>{me.email}</span>
            <button onClick={logout} className="underline hover:text-white">
              {t.signOut}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        {msg && (
          <div className="rounded-md border border-amber-600 bg-amber-950 px-4 py-3 text-sm text-amber-300">
            {msg}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-sm text-zinc-400">{t.balance}</p>
            <p className="mt-1 text-3xl font-semibold text-emerald-400">
              ${Number(me.balance).toFixed(4)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-sm text-zinc-400">{t.totalCalls}</p>
            <p className="mt-1 text-3xl font-semibold">
              {totals?.totalCalls ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-sm text-zinc-400">{t.totalSpend}</p>
            <p className="mt-1 text-3xl font-semibold">
              ${Number(totals?.totalCost ?? 0).toFixed(4)}
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="font-semibold">{t.topUpTitle}</h2>
          <p className="mt-1 text-sm text-zinc-400">{t.topUpSub}</p>

          {(options?.rails.length ?? 0) === 0 ? (
            <p className="mt-4 text-sm text-amber-300">{pay.noRails}</p>
          ) : (
            <>
              {(options?.rails.length ?? 0) > 1 && (
                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  {options?.rails.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRail(r)}
                      className={`rounded-md border px-3 py-1.5 ${
                        rail === r
                          ? "border-emerald-500 text-emerald-300"
                          : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                      }`}
                    >
                      {r === "creem" ? pay.card : pay.walletNote}
                    </button>
                  ))}
                </div>
              )}
              {rail === "xunhupay" && (options?.channels.length ?? 0) > 1 && (
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  {options?.channels.map((c) => (
                    <button
                      key={c}
                      onClick={() => setChannel(c)}
                      className={`rounded-md border px-3 py-1.5 ${
                        channel === c
                          ? "border-emerald-500 text-emerald-300"
                          : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                      }`}
                    >
                      {c === "alipay" ? pay.alipay : pay.wechat}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                {options?.packs.map((pack) => {
                  const blocked = pack.oncePerAccount && pack.used;
                  return (
                    <button
                      key={pack.sku}
                      disabled={busy || blocked}
                      title={blocked ? pay.starterUsed : undefined}
                      onClick={() => topUp(pack.sku)}
                      className="rounded-md border border-emerald-600 px-5 py-2 text-emerald-400 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-600 disabled:hover:bg-transparent"
                    >
                      ${pack.usd}
                      {rail === "xunhupay" && (
                        <span className="ml-2 text-xs text-zinc-500">
                          ¥{pack.cny.toFixed(2)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">{dl.myDownloads}</h2>
            <Link
              href={p("/downloads")}
              className="text-sm text-emerald-400 underline hover:text-emerald-300"
            >
              {dl.browseDownloads}
            </Link>
          </div>
          {downloads.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">{dl.noDownloads}</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {downloads.map((d) => (
                <li
                  key={d.orderId}
                  className="rounded-md border border-zinc-800 p-4"
                >
                  <p className="text-sm font-medium">{d.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {dl.version} {d.version}
                    {d.redeemCode && (
                      <>
                        {" · "}
                        {dl.redeemCode}:{" "}
                        <span className="select-all font-mono text-zinc-400">
                          {d.redeemCode}
                        </span>
                      </>
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    <Link
                      href={p(`/downloads/${d.sku}/read`)}
                      className="text-emerald-400 underline hover:text-emerald-300"
                    >
                      {dl.readOnline}
                    </Link>
                    <a
                      href={`/api/downloads/${d.sku}?lang=${locale}`}
                      className="text-emerald-400 underline hover:text-emerald-300"
                    >
                      {dl.downloadMd}
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t.keysTitle}</h2>
            <button
              onClick={createKey}
              disabled={busy}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {t.createKey}
            </button>
          </div>
          {newKey && (
            <div className="mt-4 rounded-md border border-emerald-700 bg-emerald-950 p-4">
              <p className="text-sm text-emerald-300">{t.copyKey}</p>
              <code className="mt-2 block break-all font-mono text-sm text-emerald-200">
                {newKey}
              </code>
            </div>
          )}
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400">
                <th className="py-2 pr-4 font-medium">{t.thKey}</th>
                <th className="py-2 pr-4 font-medium">{t.thStatus}</th>
                <th className="py-2 pr-4 font-medium">{t.thCreated}</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-zinc-500">
                    {t.noKeys}
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.id} className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-mono">{k.keyPrefix}...</td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          k.status === "active"
                            ? "text-emerald-400"
                            : "text-zinc-500"
                        }
                      >
                        {k.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-zinc-400">
                      {new Date(k.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 text-right">
                      {k.status === "active" && (
                        <button
                          onClick={() => revokeKey(k.id)}
                          disabled={busy}
                          className="text-sm text-red-400 underline hover:text-red-300 disabled:opacity-50"
                        >
                          {t.revoke}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="font-semibold">{t.usageTitle}</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {t.totalTokens} {totals?.totalInput ?? 0} {t.tokensIn} /{" "}
            {totals?.totalOutput ?? 0} {t.tokensOut}
          </p>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400">
                <th className="py-2 pr-4 font-medium">{t.thTime}</th>
                <th className="py-2 pr-4 font-medium">{t.thModel}</th>
                <th className="py-2 pr-4 font-medium">{t.thTokens}</th>
                <th className="py-2 font-medium">{t.thCost}</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-zinc-500">
                    {t.noUsage}{" "}
                    <Link href={p("/docs")} className="underline">
                      {t.docsWord}
                    </Link>
                    .
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="border-b border-zinc-800">
                    <td className="py-2 pr-4 text-zinc-400">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 font-mono text-emerald-400">
                      {l.modelSlug}
                    </td>
                    <td className="py-2 pr-4">
                      {l.inputTokens} / {l.outputTokens}
                    </td>
                    <td className="py-2">${Number(l.cost).toFixed(6)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
