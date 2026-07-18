import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { hashApiKey } from "@/lib/apikey";
import { computeCost, settleUsage } from "@/lib/billing";
import { GATEWAY_BASE_URL, getGatewayToken } from "@/lib/gateway";

export const maxDuration = 300;

type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
};

function openaiError(status: number, message: string, code: string) {
  return NextResponse.json(
    { error: { message, type: "invalid_request_error", code } },
    { status }
  );
}

export async function POST(req: NextRequest) {
  // 1. Authenticate via API key
  const authHeader = req.headers.get("authorization") ?? "";
  const key = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!key) {
    return openaiError(401, "Missing API key", "missing_api_key");
  }

  const keyHash = hashApiKey(key);
  const [keyRow] = await db
    .select({
      id: schema.apiKeys.id,
      userId: schema.apiKeys.userId,
    })
    .from(schema.apiKeys)
    .where(
      and(eq(schema.apiKeys.keyHash, keyHash), eq(schema.apiKeys.status, "active"))
    )
    .limit(1);
  if (!keyRow) {
    return openaiError(401, "Invalid API key", "invalid_api_key");
  }

  // 2. Check balance
  const [user] = await db
    .select({ balance: schema.users.balance })
    .from(schema.users)
    .where(eq(schema.users.id, keyRow.userId))
    .limit(1);
  if (!user || Number(user.balance) <= 0) {
    return openaiError(
      402,
      "Insufficient balance. Please top up at https://tokshop.xyz/dashboard",
      "insufficient_balance"
    );
  }

  // 3. Resolve model
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.model !== "string") {
    return openaiError(400, "Missing model", "missing_model");
  }
  const [model] = await db
    .select()
    .from(schema.models)
    .where(and(eq(schema.models.slug, body.model), eq(schema.models.active, true)))
    .limit(1);
  if (!model) {
    return openaiError(404, `Model '${body.model}' not found`, "model_not_found");
  }

  const isStream = body.stream === true;
  const clientWantsUsageChunk = Boolean(body.stream_options?.include_usage);

  const upstreamBody = {
    ...body,
    model: model.upstreamId,
    // always request usage from upstream so we can meter streams
    ...(isStream ? { stream_options: { include_usage: true } } : {}),
  };

  const upstream = await fetch(`${GATEWAY_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getGatewayToken()}`,
    },
    body: JSON.stringify(upstreamBody),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    let errJson: unknown;
    try {
      errJson = JSON.parse(errText);
    } catch {
      errJson = { error: { message: errText, type: "upstream_error" } };
    }
    return NextResponse.json(errJson as Record<string, unknown>, {
      status: upstream.status,
    });
  }

  const settle = async (usage: Usage | null, stream: boolean) => {
    const inputTokens = usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? 0;
    const cost = computeCost(
      inputTokens,
      outputTokens,
      model.inputPricePerM,
      model.outputPricePerM
    );
    await settleUsage({
      userId: keyRow.userId,
      apiKeyId: keyRow.id,
      modelSlug: model.slug,
      inputTokens,
      outputTokens,
      cost,
      stream,
    });
  };

  // 4a. Non-streaming: parse usage, bill, rewrite model id, return
  if (!isStream) {
    const data = await upstream.json();
    await settle(data.usage ?? null, false);
    if (data && typeof data === "object") data.model = model.slug;
    return NextResponse.json(data);
  }

  // 4b. Streaming: pass through SSE, capture usage from the final chunk
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let capturedUsage: Usage | null = null;

  const processEvent = (rawEvent: string): string | null => {
    const dataLine = rawEvent
      .split("\n")
      .find((l) => l.startsWith("data:"));
    if (!dataLine) return rawEvent + "\n\n";
    const payload = dataLine.slice(5).trim();
    if (payload === "[DONE]") return rawEvent + "\n\n";
    try {
      const parsed = JSON.parse(payload);
      if (parsed.usage) {
        capturedUsage = parsed.usage as Usage;
        // usage-only chunk: forward only if the client asked for it
        const noChoices =
          !Array.isArray(parsed.choices) || parsed.choices.length === 0;
        if (noChoices && !clientWantsUsageChunk) return null;
      }
      if (typeof parsed.model === "string") {
        parsed.model = model.slug;
        return `data: ${JSON.stringify(parsed)}\n\n`;
      }
    } catch {
      // non-JSON keep-alive lines pass through untouched
    }
    return rawEvent + "\n\n";
  };

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const out = processEvent(rawEvent);
        if (out !== null) controller.enqueue(encoder.encode(out));
      }
    },
    async flush(controller) {
      if (buffer.trim()) {
        const out = processEvent(buffer.trim());
        if (out !== null) controller.enqueue(encoder.encode(out));
      }
      // settle before the stream closes so billing is never lost
      await settle(capturedUsage, true);
    },
  });

  return new Response(upstream.body!.pipeThrough(transform), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
