import Link from "next/link";
import { eq } from "drizzle-orm";
import Nav from "@/components/Nav";
import { db, schema } from "@/lib/db";

export const revalidate = 300;

export default async function Home() {
  let models: (typeof schema.models.$inferSelect)[] = [];
  try {
    models = await db
      .select()
      .from(schema.models)
      .where(eq(schema.models.active, true));
  } catch {
    // DB not ready yet (first deploy before migration); render page without table
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-24 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Open-source LLM tokens.
            <br />
            <span className="text-emerald-400">Pay as you go.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            One OpenAI-compatible API for DeepSeek, GLM, Qwen and Kimi.
            Transparent per-token pricing, instant API keys, no subscription,
            no minimum spend.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/register"
              className="rounded-md bg-emerald-500 px-6 py-3 font-medium text-zinc-950 hover:bg-emerald-400"
            >
              Get your API key
            </Link>
            <Link
              href="/docs"
              className="rounded-md border border-zinc-700 px-6 py-3 font-medium text-zinc-200 hover:border-zinc-500"
            >
              Read the docs
            </Link>
          </div>
          <div className="mx-auto mt-16 max-w-2xl rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-left font-mono text-sm text-zinc-300">
            <p className="text-zinc-500"># Works with any OpenAI SDK</p>
            <p className="mt-2">
              curl https://tokshop.xyz/v1/chat/completions \
            </p>
            <p className="pl-4">-H &quot;Authorization: Bearer sk-tok-...&quot; \</p>
            <p className="pl-4">
              -d &apos;{"{"}&quot;model&quot;:&quot;deepseek-v3.2&quot;,
              &quot;messages&quot;:[...]{"}"}&apos;
            </p>
          </div>
        </section>

        <section id="pricing" className="border-t border-zinc-800 bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-center text-3xl font-bold">Pricing</h2>
            <p className="mt-3 text-center text-zinc-400">
              USD per 1M tokens. Billed per request, down to the token.
            </p>
            <div className="mt-10 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-zinc-400">
                    <th className="py-3 pr-4 font-medium">Model</th>
                    <th className="py-3 pr-4 font-medium">Context</th>
                    <th className="py-3 pr-4 font-medium">Input / 1M</th>
                    <th className="py-3 font-medium">Output / 1M</th>
                  </tr>
                </thead>
                <tbody>
                  {models.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-zinc-500">
                        Model catalog is being provisioned. Check back shortly.
                      </td>
                    </tr>
                  ) : (
                    models.map((m) => (
                      <tr key={m.id} className="border-b border-zinc-800">
                        <td className="py-3 pr-4">
                          <span className="font-mono text-emerald-400">
                            {m.slug}
                          </span>
                          <span className="ml-2 text-zinc-500">
                            {m.displayName}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-zinc-300">
                          {Math.round(m.contextLength / 1000)}K
                        </td>
                        <td className="py-3 pr-4 text-zinc-300">
                          ${Number(m.inputPricePerM).toFixed(2)}
                        </td>
                        <td className="py-3 text-zinc-300">
                          ${Number(m.outputPricePerM).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="border-t border-zinc-800">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 py-20 sm:grid-cols-3">
            {[
              {
                title: "OpenAI-compatible",
                body: "Drop-in replacement. Point your existing SDK at tokshop.xyz/v1 and go.",
              },
              {
                title: "Per-token billing",
                body: "Prepaid credits, deducted per request with full usage logs you can audit.",
              },
              {
                title: "Instant & automated",
                body: "Sign up, top up, get a key - the whole flow is self-serve, 24/7.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-6"
              >
                <h3 className="font-semibold text-emerald-400">{f.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-zinc-800 py-8 text-center text-sm text-zinc-500">
        TokShop · OpenAI-compatible token marketplace ·{" "}
        <Link href="/docs" className="underline hover:text-zinc-300">
          Docs
        </Link>
      </footer>
    </div>
  );
}
