import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Locale } from "@/lib/i18n";
import { HANDBOOK_EN } from "./handbook.en";
import { HANDBOOK_ZH } from "./handbook.zh";

const REGISTRY: Record<string, Record<Locale, string>> = {
  handbook_v1: { en: HANDBOOK_EN, zh: HANDBOOK_ZH },
};

export function hasPaidDoc(sku: string): boolean {
  return sku in REGISTRY;
}

async function livePriceTable(locale: Locale): Promise<string> {
  let models: (typeof schema.models.$inferSelect)[] = [];
  try {
    models = await db
      .select()
      .from(schema.models)
      .where(eq(schema.models.active, true));
  } catch {
    // Fall through to the note below rather than shipping a broken document.
  }

  const header =
    locale === "zh"
      ? "| 模型 | 上下文 | 输入 / 百万 token | 输出 / 百万 token |\n| --- | --- | --- | --- |"
      : "| Model | Context | Input / 1M tokens | Output / 1M tokens |\n| --- | --- | --- | --- |";

  if (models.length === 0) {
    return locale === "zh"
      ? "生成本文件时未能读取价目库。权威价目请见 https://tokshop.xyz/v1/models"
      : "The catalog could not be read while generating this file. The authoritative prices are at https://tokshop.xyz/v1/models";
  }

  const rows = models
    .map(
      (m) =>
        `| \`${m.slug}\` ${m.displayName} | ${Math.round(m.contextLength / 1000)}K | ` +
        `$${Number(m.inputPricePerM).toFixed(2)} | $${Number(m.outputPricePerM).toFixed(2)} |`
    )
    .join("\n");

  const stamp =
    locale === "zh"
      ? `\n\n生成时间（UTC）：${new Date().toISOString()}`
      : `\n\nGenerated at (UTC): ${new Date().toISOString()}`;

  return `${header}\n${rows}${stamp}`;
}

/**
 * Render a purchased document. The live price appendix is substituted here, at
 * delivery time, so a downloaded copy always matches the public catalog as of
 * the moment it was fetched.
 */
export async function renderPaidDoc(
  sku: string,
  locale: Locale
): Promise<string | null> {
  const doc = REGISTRY[sku]?.[locale];
  if (!doc) return null;
  return doc.replace("{{PRICE_TABLE}}", await livePriceTable(locale));
}
