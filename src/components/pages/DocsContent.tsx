import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import {
  CONTACT_EMAIL,
  CONTACT_EMAIL_CN,
  dict,
  type Locale,
} from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";

const FAQ_JSONLD = {
  en: {
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
  },
  zh: {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "API 与 OpenAI SDK 兼容吗?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `兼容。把任意 OpenAI SDK 的 base URL 指向 ${SITE_URL}/v1 并使用 sk-tok- 开头的 Key 即可;/v1/models 和 /v1/chat/completions(流式与非流式)无需改动。`,
        },
      },
      {
        "@type": "Question",
        name: "如何计费?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "预付美元余额。每次请求按 输入token数×输入单价/1M + 输出token数×输出单价/1M 扣费。余额耗尽后请求返回 HTTP 402。",
        },
      },
      {
        "@type": "Question",
        name: "如何获取 API Key?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "用邮箱和密码注册,然后在控制台创建 Key。Key 仅在创建时展示一次,可随时吊销。",
        },
      },
    ],
  },
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

export default function DocsContent({ locale }: { locale: Locale }) {
  const t = dict[locale].docs;
  return (
    <div
      className="flex min-h-screen flex-col"
      lang={locale === "zh" ? "zh-CN" : "en"}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD[locale]) }}
      />
      <Nav locale={locale} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="mt-3 text-zinc-400">
          {t.intro}{" "}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-emerald-400">
            https://tokshop.xyz/v1
          </code>
        </p>

        <h2 className="mt-10 text-xl font-semibold">{t.s1}</h2>
        <p className="mt-2 text-zinc-400">
          {t.s1Body}{" "}
          <code className="font-mono text-emerald-400">sk-tok-...</code>
          {t.s1Body2}
        </p>

        <h2 className="mt-10 text-xl font-semibold">{t.s2}</h2>
        <Code>{`curl https://tokshop.xyz/v1/models`}</Code>
        <p className="mt-2 text-sm text-zinc-500">{t.s2Note}</p>

        <h2 className="mt-10 text-xl font-semibold">{t.s3}</h2>
        <Code>{curlExample}</Code>
        <p className="mt-4 text-zinc-400">{t.s3Python}</p>
        <Code>{pythonExample}</Code>

        <h2 className="mt-10 text-xl font-semibold">{t.s4}</h2>
        <p className="mt-2 text-zinc-400">
          {t.s4Body}{" "}
          <code className="font-mono text-emerald-400">stream: true</code>
          {t.s4Body2}
        </p>
        <Code>{streamExample}</Code>

        <h2 className="mt-10 text-xl font-semibold">{t.s5}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-zinc-400">
          <li>{t.billing[0]}</li>
          <li>{t.billing[1]}</li>
          <li>
            {t.billing402pre}{" "}
            <code className="font-mono">402 insufficient_balance</code>.
          </li>
          <li>{t.billing[2]}</li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold">{t.errorsTitle}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-zinc-400">
          <li>
            <code className="font-mono">401</code> - {t.err401}
          </li>
          <li>
            <code className="font-mono">402</code> - {t.err402}
          </li>
          <li>
            <code className="font-mono">404</code> - {t.err404}
          </li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold">{t.supportTitle}</h2>
        <p className="mt-2 text-zinc-400">
          {t.supportBody}{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-emerald-400 underline"
          >
            {CONTACT_EMAIL}
          </a>{" "}
          /{" "}
          <a
            href={`mailto:${CONTACT_EMAIL_CN}`}
            className="text-emerald-400 underline"
          >
            {CONTACT_EMAIL_CN}
          </a>
        </p>

        <p className="mt-12 border-t border-zinc-800 pt-6 text-xs leading-relaxed text-zinc-500">
          {dict[locale].disclaimer}
        </p>
      </main>
      <Footer locale={locale} />
    </div>
  );
}
