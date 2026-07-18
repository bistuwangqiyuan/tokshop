import { GATEWAY_BASE_URL, getGatewayToken } from "@/lib/gateway";

/**
 * Text generation via Vercel AI Gateway (OpenAI-compatible /chat/completions).
 * Fallback chain: quality first, all open-weight models.
 */
const MODEL_CANDIDATES = [
  process.env.AI_MODEL,
  "deepseek/deepseek-v3.2",
  "zai/glm-4.6",
  "alibaba/qwen-3-32b",
].filter(Boolean) as string[];

export async function aiGenerate(opts: {
  system: string;
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<{ text: string; model: string }> {
  const token = await getGatewayToken();
  let lastError: unknown;
  for (const model of MODEL_CANDIDATES) {
    try {
      const r = await fetch(`${GATEWAY_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.prompt },
          ],
          max_tokens: opts.maxOutputTokens ?? 4000,
          temperature: opts.temperature ?? 0.6,
        }),
      });
      if (!r.ok) {
        lastError = new Error(`${model}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
        continue;
      }
      const data = await r.json();
      const text: string = data?.choices?.[0]?.message?.content ?? "";
      if (text.trim().length > 0) return { text, model };
      lastError = new Error(`empty response from ${model}`);
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    `AI generation failed on all models [${MODEL_CANDIDATES.join(", ")}]: ${String(lastError)}`
  );
}

/** Extract JSON from model output (tolerates code fences, noise, truncated tails). */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.search(/[[{]/);
  if (start < 0)
    throw new Error(`no JSON found in AI output; head=${raw.slice(0, 160)}`);
  const body = raw.slice(start);

  // 1. direct parse
  try {
    return JSON.parse(body) as T;
  } catch {
    /* continue */
  }
  // 2. shrink from the end to the nearest closing bracket
  for (let end = body.length; end > 0; end--) {
    const c = body[end - 1];
    if (c !== "}" && c !== "]") continue;
    try {
      return JSON.parse(body.slice(0, end)) as T;
    } catch {
      /* keep shrinking */
    }
  }
  // 3. truncation repair: cut array to last complete object and close it
  if (body.startsWith("[")) {
    const lastObj = body.lastIndexOf("}");
    if (lastObj > 0) {
      try {
        return JSON.parse(body.slice(0, lastObj + 1) + "]") as T;
      } catch {
        /* fallthrough */
      }
    }
  }
  // 4. object truncation: close braces one by one
  if (body.startsWith("{")) {
    const lastComplete = Math.max(body.lastIndexOf("}"), body.lastIndexOf('"'));
    if (lastComplete > 0) {
      let candidate = body.slice(0, lastComplete + 1);
      for (let i = 0; i < 4; i++) {
        candidate += "}";
        try {
          return JSON.parse(candidate) as T;
        } catch {
          /* keep closing */
        }
      }
    }
  }
  throw new Error(`unparseable JSON in AI output; head=${body.slice(0, 160)}`);
}
