"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-8">
      <h1 className="text-xl font-semibold">
        {mode === "login" ? "Sign in" : "Create your account"}
      </h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm text-zinc-400">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400">
            Password{mode === "register" ? " (min 8 characters)" : ""}
          </label>
          <input
            type="password"
            required
            minLength={mode === "register" ? 8 : 1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-emerald-500 py-2 font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {loading
            ? "Please wait..."
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-zinc-500">
        {mode === "login" ? (
          <>
            No account?{" "}
            <Link href="/register" className="text-emerald-400 underline">
              Register
            </Link>
          </>
        ) : (
          <>
            Already registered?{" "}
            <Link href="/login" className="text-emerald-400 underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
