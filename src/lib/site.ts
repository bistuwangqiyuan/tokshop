/** Site-wide constants (single source of truth). */
export const SITE_URL = (
  process.env.APP_URL || "https://tokshop.xyz"
).replace(/\/$/, "");

export const SITE_NAME = "TokShop";

export const SITE_DESCRIPTION =
  "OpenAI-compatible pay-as-you-go API for top open-source models " +
  "(DeepSeek, GLM, Qwen, Kimi). Transparent per-token USD pricing, " +
  "instant self-serve API keys, prepaid credits.";
