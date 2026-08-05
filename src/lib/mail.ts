/**
 * Outbound email via AgentMail (the same inbox published as support).
 * Missing credentials degrade to a no-op so settlement never fails on mail.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { CONTACT_EMAIL } from "@/lib/i18n";
import type { SettledOrder } from "@/lib/orders";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const AGENTMAIL_API = "https://api.agentmail.to/v0";

export function mailConfigured(): boolean {
  return Boolean(process.env.AGENTMAIL_API_KEY);
}

export function mailInboxId(): string {
  return process.env.AGENTMAIL_INBOX_ID?.trim() || CONTACT_EMAIL;
}

export type SendMailResult =
  | { ok: true; messageId: string; skipped?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

export async function sendMail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  labels?: string[];
}): Promise<SendMailResult> {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) {
    return { ok: true, skipped: true, reason: "AGENTMAIL_API_KEY not set" };
  }
  const to = params.to.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { ok: false, error: "invalid recipient" };
  }

  const inboxId = encodeURIComponent(mailInboxId());
  try {
    const res = await fetch(
      `${AGENTMAIL_API}/inboxes/${inboxId}/messages/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to,
          subject: params.subject,
          text: params.text,
          html: params.html,
          labels: params.labels ?? ["tokshop", "receipt"],
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `AgentMail ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as { message_id?: string };
    return { ok: true, messageId: data.message_id ?? "unknown" };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

/** Reply in-thread (AgentMail reply endpoint). */
export async function replyMail(params: {
  messageId: string;
  text: string;
  html?: string;
}): Promise<SendMailResult> {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) {
    return { ok: true, skipped: true, reason: "AGENTMAIL_API_KEY not set" };
  }
  const inboxId = encodeURIComponent(mailInboxId());
  const messageId = encodeURIComponent(params.messageId);
  try {
    const res = await fetch(
      `${AGENTMAIL_API}/inboxes/${inboxId}/messages/${messageId}/reply`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: params.text,
          html: params.html,
          labels: ["tokshop", "support-auto"],
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `AgentMail reply ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as { message_id?: string };
    return { ok: true, messageId: data.message_id ?? "unknown" };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

export async function sendSettlementEmail(
  settled: SettledOrder
): Promise<SendMailResult> {
  if (!settled.email) {
    return { ok: true, skipped: true, reason: "order has no email" };
  }

  if (settled.kind === "download") {
    const code = settled.redeemCode ?? "(see delivery page)";
    const restore = `${SITE_URL}/downloads/restore`;
    const subject = `${SITE_NAME}: your download redeem code`;
    const text = [
      `Thanks for your purchase from ${SITE_NAME}.`,
      ``,
      `Order: ${settled.id}`,
      `Product: ${settled.sku ?? "download"}`,
      `Redeem code: ${code}`,
      ``,
      `Restore access any time: ${restore}`,
      `Paste the redeem code on that page if you change browsers.`,
      ``,
      `Support: ${CONTACT_EMAIL}`,
      `Operator receipt — keep this email.`,
    ].join("\n");
    return sendMail({
      to: settled.email,
      subject,
      text,
      labels: ["tokshop", "receipt", "download"],
    });
  }

  const credits = Number(settled.credits).toFixed(2);
  const dash = `${SITE_URL}/dashboard`;
  const subject = `${SITE_NAME}: $${credits} credits added`;
  const text = [
    `Your ${SITE_NAME} balance was topped up.`,
    ``,
    `Order: ${settled.id}`,
    `Credits added: $${credits} USD`,
    `Pack: ${settled.sku ?? "credits"}`,
    ``,
    `Open your dashboard: ${dash}`,
    `Create an API key there and call ${SITE_URL}/v1/chat/completions.`,
    ``,
    `Support: ${CONTACT_EMAIL}`,
  ].join("\n");
  return sendMail({
    to: settled.email,
    subject,
    text,
    labels: ["tokshop", "receipt", "credits"],
  });
}

/**
 * Verify AgentMail (Svix) webhook signatures.
 * Spec: https://docs.agentmail.to/webhook-verification
 */
export function verifyAgentMailSignature(
  rawBody: string,
  headers: {
    id: string | null;
    timestamp: string | null;
    signature: string | null;
  }
): boolean {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) {
    return false;
  }

  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) return false;
  // Reject timestamps older than 5 minutes (Svix default tolerance).
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const keyPart = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(keyPart, "base64");
  } catch {
    return false;
  }

  const signed = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = createHmac("sha256", key).update(signed).digest("base64");

  const candidates = headers.signature.split(" ").map((part) => {
    const [, sig] = part.split(",", 2);
    return sig ?? "";
  });

  const expectedBuf = Buffer.from(expected);
  return candidates.some((sig) => {
    try {
      const got = Buffer.from(sig);
      return (
        got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf)
      );
    } catch {
      return false;
    }
  });
}
