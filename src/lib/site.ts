/** Site-wide constants (single source of truth). */
export const SITE_URL = (
  process.env.APP_URL || "https://tokshop.xyz"
).replace(/\/$/, "");

export const SITE_NAME = "TokShop";

/**
 * Who the seller actually is. Published in the footer, on every legal page and
 * in the Organization JSON-LD: buyers are entitled to know who they are paying,
 * and payment providers verify that the merchant identity on the site matches
 * the one on the account.
 */
export const OPERATOR = {
  en: {
    name: "Wang Qiyuan (王启源)",
    role: "Individual operator, China",
    address:
      "No. 12 Xiaoying East Road, Qinghe, Haidian District, Beijing 100192, China",
  },
  zh: {
    name: "王启源",
    role: "个人经营者（中国）",
    address: "中国北京市海淀区清河小营东路 12 号（邮编 100192）",
  },
} as const;

/** The same address, split into schema.org PostalAddress fields. */
export const OPERATOR_POSTAL = {
  streetAddress: "No. 12 Xiaoying East Road, Qinghe",
  addressLocality: "Haidian District",
  addressRegion: "Beijing",
  postalCode: "100192",
  addressCountry: "CN",
} as const;

export const SITE_DESCRIPTION =
  "OpenAI-compatible pay-as-you-go API for top open-source models " +
  "(DeepSeek, GLM, Qwen, Kimi). Transparent per-token USD pricing, " +
  "instant self-serve API keys, prepaid credits.";
