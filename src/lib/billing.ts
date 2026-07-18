import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * Retail cost in USD for a call, computed from per-1M-token prices.
 * Returns a fixed 8-decimal string suitable for numeric(16,8).
 */
export function computeCost(
  inputTokens: number,
  outputTokens: number,
  inputPricePerM: string,
  outputPricePerM: string
): string {
  const cost =
    (inputTokens * Number(inputPricePerM) +
      outputTokens * Number(outputPricePerM)) /
    1_000_000;
  return cost.toFixed(8);
}

/**
 * Deduct cost from the user's balance and record a usage log.
 * Balance may go slightly negative on a single call (checked before the call),
 * which mirrors how usage-based providers settle in-flight requests.
 */
export async function settleUsage(params: {
  userId: string;
  apiKeyId: string;
  modelSlug: string;
  inputTokens: number;
  outputTokens: number;
  cost: string;
  stream: boolean;
}) {
  await db
    .update(schema.users)
    .set({ balance: sql`${schema.users.balance} - ${params.cost}` })
    .where(sql`${schema.users.id} = ${params.userId}`);

  await db.insert(schema.usageLogs).values({
    userId: params.userId,
    apiKeyId: params.apiKeyId,
    modelSlug: params.modelSlug,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    cost: params.cost,
    stream: params.stream,
  });
}
