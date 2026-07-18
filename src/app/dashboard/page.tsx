"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

const PACKS = [5, 10, 20, 50, 100];

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [keys, setKeys] = useState<Key[]>([]);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const meRes = await fetch("/api/auth/me");
    if (meRes.status === 401) {
      router.push("/login");
      return;
    }
    const meData = await meRes.json();
    setMe(meData.user);
    const [keysRes, usageRes] = await Promise.all([
      fetch("/api/keys"),
      fetch("/api/usage"),
    ]);
    const keysData = await keysRes.json();
    const usageData = await usageRes.json();
    setKeys(keysData.keys ?? []);
    setLogs(usageData.logs ?? []);
    setTotals(usageData.totals ?? null);
  }, [router]);

  useEffect(() => {
    load();
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
        setMsg(data.error ?? "Failed to create key");
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

  async function topUp(amount: number) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Checkout failed");
        return;
      }
      if (!data.checkoutUrl) {
        setMsg(
          "Order created, but online payment is not enabled yet. Please contact support to complete the payment."
        );
        return;
      }
      window.location.href = data.checkoutUrl;
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold">
            <span className="text-emerald-400">Tok</span>Shop
          </Link>
          <div className="flex items-center gap-4 text-sm text-zinc-400">
            <span>{me.email}</span>
            <button onClick={logout} className="underline hover:text-white">
              Sign out
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
            <p className="text-sm text-zinc-400">Balance</p>
            <p className="mt-1 text-3xl font-semibold text-emerald-400">
              ${Number(me.balance).toFixed(4)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-sm text-zinc-400">Total calls</p>
            <p className="mt-1 text-3xl font-semibold">
              {totals?.totalCalls ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-sm text-zinc-400">Total spend</p>
            <p className="mt-1 text-3xl font-semibold">
              ${Number(totals?.totalCost ?? 0).toFixed(4)}
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="font-semibold">Top up credits</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Prepaid credits in USD, applied instantly after payment.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {PACKS.map((p) => (
              <button
                key={p}
                disabled={busy}
                onClick={() => topUp(p)}
                className="rounded-md border border-emerald-600 px-5 py-2 text-emerald-400 hover:bg-emerald-950 disabled:opacity-50"
              >
                ${p}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">API keys</h2>
            <button
              onClick={createKey}
              disabled={busy}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              Create key
            </button>
          </div>
          {newKey && (
            <div className="mt-4 rounded-md border border-emerald-700 bg-emerald-950 p-4">
              <p className="text-sm text-emerald-300">
                Copy your key now - it is shown only once:
              </p>
              <code className="mt-2 block break-all font-mono text-sm text-emerald-200">
                {newKey}
              </code>
            </div>
          )}
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400">
                <th className="py-2 pr-4 font-medium">Key</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Created</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-zinc-500">
                    No keys yet.
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
                          Revoke
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
          <h2 className="font-semibold">Recent usage</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Total tokens: {totals?.totalInput ?? 0} in /{" "}
            {totals?.totalOutput ?? 0} out
          </p>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400">
                <th className="py-2 pr-4 font-medium">Time</th>
                <th className="py-2 pr-4 font-medium">Model</th>
                <th className="py-2 pr-4 font-medium">Tokens (in/out)</th>
                <th className="py-2 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-zinc-500">
                    No usage yet. Make your first API call - see the{" "}
                    <Link href="/docs" className="underline">
                      docs
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
