import { createHash, randomBytes } from "crypto";

export const API_KEY_PREFIX = "sk-tok-";

export function generateApiKey(): {
  key: string;
  keyHash: string;
  keyPrefix: string;
} {
  const key = API_KEY_PREFIX + randomBytes(24).toString("hex");
  return { key, keyHash: hashApiKey(key), keyPrefix: key.slice(0, 15) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
