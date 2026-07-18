/** Cron auth: schedulers send Authorization: Bearer CRON_SECRET. */
export function verifyCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  const alt = req.headers.get("x-cron-key") || "";
  return auth === `Bearer ${secret}` || alt === secret;
}
