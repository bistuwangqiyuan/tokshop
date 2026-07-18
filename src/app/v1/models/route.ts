import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Public OpenAI-compatible model listing with retail pricing (USD per 1M tokens).
export async function GET() {
  const rows = await db
    .select()
    .from(schema.models)
    .where(eq(schema.models.active, true));

  return NextResponse.json({
    object: "list",
    data: rows.map((m) => ({
      id: m.slug,
      object: "model",
      created: Math.floor(m.createdAt.getTime() / 1000),
      owned_by: "tokshop",
      display_name: m.displayName,
      context_length: m.contextLength,
      pricing: {
        currency: "USD",
        input_per_million_tokens: Number(m.inputPricePerM),
        output_per_million_tokens: Number(m.outputPricePerM),
      },
    })),
  });
}
