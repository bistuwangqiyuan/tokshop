/**
 * XunhuPay (虎皮椒) - Alipay and WeChat Pay for mainland China.
 *
 * Creem's checkout page offers cards, Apple Pay and Google Pay only, so this
 * rail exists because most mainland customers hold UnionPay cards or pay from
 * a wallet. It is also cheaper for small orders: XunhuPay charges only a
 * percentage, while Creem's fixed $0.40 eats 44% of a one-dollar order.
 *
 * XunhuPay is a technical service provider, not a merchant of record. It never
 * holds the funds - Alipay and WeChat Pay settle directly to the operator - and
 * it does not handle tax, unlike Creem.
 *
 * We only build a payment and read its status back. The payment page itself is
 * hosted by XunhuPay, so no card or wallet credential ever reaches us.
 */

import { createHash, randomBytes } from "node:crypto";
import type { XunhuChannel } from "@/lib/products";

const API_BASE = "https://api.xunhupay.com";
const API_VERSION = "1.1";

type Credentials = { appid: string; appsecret: string };

function credentials(channel: XunhuChannel): Credentials | null {
  const appid =
    channel === "alipay"
      ? (process.env.XUNHU_ALIPAY_APPID ?? process.env.XUNHU_APPID)
      : process.env.XUNHU_APPID;
  const appsecret =
    channel === "alipay"
      ? (process.env.XUNHU_ALIPAY_APPSECRET ?? process.env.XUNHU_APPSECRET)
      : process.env.XUNHU_APPSECRET;
  if (!appid || !appsecret) return null;
  return { appid, appsecret };
}

export function xunhupayConfigured(channel?: XunhuChannel): boolean {
  if (channel) return credentials(channel) !== null;
  return credentials("wechat") !== null || credentials("alipay") !== null;
}

/** Which wallets are actually usable right now, in display order. */
export function availableChannels(): XunhuChannel[] {
  return (["alipay", "wechat"] as XunhuChannel[]).filter((c) =>
    xunhupayConfigured(c)
  );
}

/**
 * Signature per the XunhuPay v3 spec: drop `hash` and empty values, sort keys
 * by ASCII ascending, join as `k=v&...`, append the app secret with no
 * separator, then MD5 as lowercase hex.
 */
export function sign(
  params: Record<string, string | number>,
  appsecret: string
): string {
  const stringA = Object.keys(params)
    .filter((k) => k !== "hash")
    .filter((k) => {
      const v = params[k];
      return v !== "" && v !== null && v !== undefined;
    })
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("md5")
    .update(`${stringA}${appsecret}`)
    .digest("hex")
    .toLowerCase();
}

/**
 * `trade_order_id` accepts up to 32 characters of digits, letters, `_`, `-`
 * and `*`. A UUID is 36 with hyphens, so we strip them and get exactly 32.
 */
export function toTradeOrderId(orderId: string): string {
  return orderId.replace(/-/g, "");
}

export function fromTradeOrderId(tradeOrderId: string): string | null {
  const hex = tradeOrderId.trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

async function post(
  path: string,
  params: Record<string, string | number>
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  );
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`XunhuPay ${path} returned non-JSON (${res.status}): ${text}`);
  }
  if (Number(json.errcode) !== 0) {
    throw new Error(
      `XunhuPay ${path} failed (errcode ${json.errcode}): ${json.errmsg ?? ""}`
    );
  }
  return json;
}

/**
 * Create a payment and return the hosted page to redirect the customer to.
 * `url` works on both desktop (QR) and mobile (opens the wallet app), which is
 * why we prefer it over the bare QR image URL.
 */
export async function createPayment(params: {
  orderId: string;
  cnyAmount: number;
  title: string;
  channel: XunhuChannel;
  notifyUrl: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ redirectUrl: string; openOrderId: string | null }> {
  const creds = credentials(params.channel);
  if (!creds) throw new Error(`XunhuPay ${params.channel} is not configured`);

  const payload: Record<string, string | number> = {
    version: API_VERSION,
    appid: creds.appid,
    trade_order_id: toTradeOrderId(params.orderId),
    total_fee: params.cnyAmount.toFixed(2),
    // No emoji and no "%" allowed, max 42 Chinese characters.
    title: params.title.slice(0, 100),
    time: Math.floor(Date.now() / 1000),
    notify_url: params.notifyUrl,
    return_url: params.returnUrl,
    callback_url: params.cancelUrl,
    nonce_str: randomBytes(16).toString("hex"),
  };
  payload.hash = sign(payload, creds.appsecret);

  const json = await post("/payment/do.html", payload);
  const redirectUrl = typeof json.url === "string" ? json.url : null;
  if (!redirectUrl) {
    throw new Error("XunhuPay did not return a payment url");
  }
  const openOrderId =
    typeof json.oderid === "string"
      ? json.oderid
      : typeof json.open_order_id === "string"
        ? json.open_order_id
        : null;
  return { redirectUrl, openOrderId };
}

export type XunhuOrderStatus = {
  /** OD paid, WP awaiting payment, CD cancelled. */
  status: string;
  openOrderId: string | null;
  totalFee: number | null;
};

/**
 * Read an order's authoritative state back from XunhuPay. The notify callback is
 * only MD5-signed with a shared secret, so we re-query before crediting
 * anything: that turns a leaked or replayed callback into a no-op.
 */
export async function queryOrder(
  orderId: string,
  channel: XunhuChannel
): Promise<XunhuOrderStatus | null> {
  const creds = credentials(channel);
  if (!creds) return null;

  const payload: Record<string, string | number> = {
    appid: creds.appid,
    out_trade_order: toTradeOrderId(orderId),
    time: Math.floor(Date.now() / 1000),
    nonce_str: randomBytes(16).toString("hex"),
  };
  payload.hash = sign(payload, creds.appsecret);

  const json = await post("/payment/query.html", payload).catch(() => null);
  const data = json?.data as Record<string, unknown> | undefined;
  if (!data) return null;
  const totalFee = Number(data.total_fee);
  return {
    status: String(data.status ?? ""),
    openOrderId:
      typeof data.open_order_id === "string" ? data.open_order_id : null,
    totalFee: Number.isFinite(totalFee) ? totalFee : null,
  };
}

/**
 * Verify a notify callback. Tries every configured channel because the callback
 * body does not say which application produced it.
 */
export function verifyNotify(
  params: Record<string, string>
): { valid: boolean; channel: XunhuChannel | null } {
  const provided = params.hash;
  if (!provided) return { valid: false, channel: null };
  for (const channel of ["wechat", "alipay"] as XunhuChannel[]) {
    const creds = credentials(channel);
    if (!creds) continue;
    if (sign(params, creds.appsecret) === provided.toLowerCase()) {
      return { valid: true, channel };
    }
  }
  return { valid: false, channel: null };
}
