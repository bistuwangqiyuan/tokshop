/**
 * The single source of truth for everything we sell.
 *
 * Prices used to be hardcoded in four places (checkout route, dashboard, and
 * twice in the pricing page) which had already drifted apart. Everything now
 * reads from here.
 */

import type { Locale } from "@/lib/i18n";

export type Rail = "creem" | "xunhupay";

/** Which wallet the domestic rail should open. */
export type XunhuChannel = "alipay" | "wechat";

export type CreditPack = {
  sku: string;
  usd: number;
  /**
   * Loss-leader entry price: at Creem's 3.9% + $0.40 a one-dollar order costs
   * $0.44 to process while the credits it buys cost us $0.67 upstream, so this
   * pack is deliberately unprofitable and capped at one per account.
   */
  oncePerAccount?: boolean;
};

export const CREDIT_PACKS: readonly CreditPack[] = [
  { sku: "credits_1", usd: 1, oncePerAccount: true },
  { sku: "credits_5", usd: 5 },
  { sku: "credits_10", usd: 10 },
  { sku: "credits_20", usd: 20 },
  { sku: "credits_50", usd: 50 },
  { sku: "credits_100", usd: 100 },
] as const;

/** Packs shown as headline cards on the pricing page. */
export const FEATURED_PACK_SKUS = ["credits_1", "credits_20", "credits_100"];

export type DownloadProduct = {
  sku: string;
  usd: number;
  /** Base name of the delivered file, without extension. */
  fileBase: string;
  /** Version shown to buyers, bumped when the content is substantively revised. */
  version: string;
  i18n: Record<
    Locale,
    { title: string; summary: string; bullets: string[]; pages: string }
  >;
};

export const DOWNLOAD_PRODUCTS: readonly DownloadProduct[] = [
  {
    sku: "handbook_v1",
    usd: 1,
    fileBase: "tokshop-open-model-api-handbook",
    version: "1.0",
    i18n: {
      en: {
        title: "The Open-Model API Handbook: Selection and Cost Engineering",
        summary:
          "How a pay-as-you-go API reselling open-source models is actually built: the unit economics, the billing code that cannot lose money on a dropped stream, the payment idempotency design, and the automated content engine behind this site. Written from a live production system, not from theory.",
        bullets: [
          "Unit economics: the retail multiplier, what each payment rail really costs, and why a one-dollar order behaves completely differently on each",
          "Per-token billing that survives aborted streams, with the exact settlement point in the response pipeline",
          "Payment engineering: two-layer idempotency, single-statement atomic settlement, signature verification, callback re-verification",
          "Model selection: how to compare open-source models on cost per useful answer rather than price per million tokens",
          "Appendix generated at download time from the live price catalog, so the numbers are never stale",
        ],
        pages:
          "Markdown and in-browser reader, bilingual, updates to this edition included",
      },
      zh: {
        title: "《开源大模型 API 选型与成本优化实战手册》",
        summary:
          "一套真实在跑的开源大模型 API 转售系统是怎么搭起来的：单位经济模型、流式中断也不会丢账的计费代码、支付幂等设计，以及驱动本站的自动化内容引擎。全部取自生产环境，不是纸上推演。",
        bullets: [
          "单位经济模型：零售倍率怎么定，两条支付通道的真实成本，以及为什么 1 美元订单在两条通道上的经济性天差地别",
          "按 token 计费如何做到流式请求被中断也不丢账，以及结算点该放在响应管线的哪一步",
          "支付工程：双层幂等、单条语句原子结算、回调验签、二次回查核对",
          "模型选型：如何按「每个有效答案的成本」而不是「每百万 token 单价」来横向比较开源模型",
          "附录在下载时从实时价目库生成，数字永不过期",
        ],
        pages: "Markdown 文件 + 在线阅读，中英双语，本版更新免费",
      },
    },
  },
] as const;

export function findCreditPack(sku: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.sku === sku);
}

export function findDownloadProduct(sku: string): DownloadProduct | undefined {
  return DOWNLOAD_PRODUCTS.find((p) => p.sku === sku);
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export function formatCny(cny: number): string {
  return `¥${cny.toFixed(2)}`;
}

/** USD reference rate for the CNY-native domestic rail. */
export function cnyPerUsd(): number {
  const raw = Number(process.env.CNY_PER_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : 7.3;
}

/** Round up to whole cents so we never undercharge on conversion. */
export function usdToCny(usd: number): number {
  return Math.ceil(usd * cnyPerUsd() * 100) / 100;
}
