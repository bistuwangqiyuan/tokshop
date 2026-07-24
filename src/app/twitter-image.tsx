import { brandImage, OG_SIZE } from "@/lib/og";

export const alt = "TokShop - Open-Source LLM Tokens, Pay As You Go";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return brandImage(
    "Open-source LLM tokens. Pay as you go.",
    "One OpenAI-compatible API for DeepSeek, GLM, Qwen and Kimi. Transparent per-token USD pricing."
  );
}
