import type { Metadata } from "next";
import Nav from "@/components/Nav";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "API Documentation",
  description:
    "How to use the TokShop OpenAI-compatible API: get a key, list models, chat completions, streaming and per-token billing details.",
  alternates: { canonical: `${SITE_URL}/docs` },
};

const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is the API compatible with the OpenAI SDK?",
      acceptedAnswer: {
        "@type": "Answer",
        text: `Yes. Point any OpenAI SDK at base URL ${SITE_URL}/v1 with your sk-tok- key; /v1/models and /v1/chat/completions (streaming and non-streaming) work unchanged.`,
      },
    },
    {
      "@type": "Question",
      name: "How does billing work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Prepaid USD credits. Each request is deducted as input_tokens x input_price/1M + output_tokens x output_price/1M. When the balance reaches zero, requests return HTTP 402.",
      },
    },
    {
      "@type": "Question",
      name: "How do I get an API key?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Register with an email and password, then create a key in the dashboard. Keys are shown once at creation and can be revoked at any time.",
      },
    },
  ],
};

const curlExample = `curl https://tokshop.xyz/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-tok-YOUR_KEY" \\
  -d '{
    "model": "deepseek-v3.2",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`;

const pythonExample = `from openai import OpenAI

client = OpenAI(
    base_url="https://tokshop.xyz/v1",
    api_key="sk-tok-YOUR_KEY",
)

resp = client.chat.completions.create(
    model="deepseek-v3.2",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)`;

const streamExample = `resp = client.chat.completions.create(
    model="deepseek-v3.2",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True,
)
for chunk in resp:
    print(chunk.choices[0].delta.content or "", end="")`;

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900 p-4 font-mono text-sm text-zinc-300">
      {children}
    </pre>
  );
}

export default function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }}
      />
      <Nav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <h1 className="text-3xl font-bold">API Documentation</h1>
        <p className="mt-3 text-zinc-400">
          TokShop exposes an OpenAI-compatible API. Base URL:{" "}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-emerald-400">
            https://tokshop.xyz/v1
          </code>
        </p>

        <h2 className="mt-10 text-xl font-semibold">1. Get an API key</h2>
        <p className="mt-2 text-zinc-400">
          Register, top up your balance, then create a key in the dashboard.
          Keys look like{" "}
          <code className="font-mono text-emerald-400">sk-tok-...</code> and are
          shown only once.
        </p>

        <h2 className="mt-10 text-xl font-semibold">2. List models</h2>
        <Code>{`curl https://tokshop.xyz/v1/models`}</Code>
        <p className="mt-2 text-sm text-zinc-500">
          Public endpoint. Returns model ids, context windows and USD pricing
          per 1M tokens.
        </p>

        <h2 className="mt-10 text-xl font-semibold">3. Chat completions</h2>
        <Code>{curlExample}</Code>
        <p className="mt-4 text-zinc-400">With the official OpenAI Python SDK:</p>
        <Code>{pythonExample}</Code>

        <h2 className="mt-10 text-xl font-semibold">4. Streaming</h2>
        <p className="mt-2 text-zinc-400">
          Set <code className="font-mono text-emerald-400">stream: true</code>.
          Server-sent events, identical to OpenAI&apos;s format.
        </p>
        <Code>{streamExample}</Code>

        <h2 className="mt-10 text-xl font-semibold">5. Billing</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-zinc-400">
          <li>Prepaid USD credits; each request is deducted from the balance.</li>
          <li>
            Cost = input_tokens x input_price / 1M + output_tokens x
            output_price / 1M.
          </li>
          <li>
            When the balance reaches zero, requests return{" "}
            <code className="font-mono">402 insufficient_balance</code>.
          </li>
          <li>Every call is logged and auditable in your dashboard.</li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold">Errors</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-zinc-400">
          <li>
            <code className="font-mono">401</code> - missing or invalid API key
          </li>
          <li>
            <code className="font-mono">402</code> - insufficient balance
          </li>
          <li>
            <code className="font-mono">404</code> - unknown model
          </li>
        </ul>
      </main>
    </div>
  );
}
