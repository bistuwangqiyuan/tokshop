/**
 * Post-settlement side effects that must never block or reverse a payment.
 */

import { waitUntil } from "@vercel/functions";
import { sendSettlementEmail } from "@/lib/mail";
import type { SettledOrder } from "@/lib/orders";

export function scheduleSettlementNotice(
  settled: SettledOrder | null | undefined
): void {
  if (!settled) return;
  waitUntil(
    sendSettlementEmail(settled).then((result) => {
      if (!result.ok) {
        console.error("settlement email failed", settled.id, result.error);
      } else if ("skipped" in result && result.skipped) {
        // Expected when AgentMail is not configured yet.
      }
    })
  );
}
