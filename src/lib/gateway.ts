import { getVercelOidcToken } from "@vercel/functions/oidc";

export const GATEWAY_BASE_URL =
  process.env.AI_GATEWAY_BASE_URL ?? "https://ai-gateway.vercel.sh/v1";

/**
 * Credential for the Vercel AI Gateway.
 * Prefers an explicit AI_GATEWAY_API_KEY; falls back to the deployment's
 * OIDC token, which the gateway accepts natively when running on Vercel.
 */
export async function getGatewayToken(): Promise<string> {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (key) return key;
  try {
    return await getVercelOidcToken();
  } catch {
    throw new Error(
      "No AI Gateway credential: set AI_GATEWAY_API_KEY or deploy on Vercel with OIDC enabled"
    );
  }
}
