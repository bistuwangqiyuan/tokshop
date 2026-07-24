/**
 * Extractability helpers shared by the article page (FAQPage JSON-LD),
 * the QC gate and the SEO/GEO audit. Pure functions over Markdown.
 */

export type FaqPair = { question: string; answer: string };

/**
 * Parse a trailing "## FAQ" (or "## Frequently Asked Questions") section:
 * each "### Question?" heading followed by its answer paragraphs.
 */
export function extractFaq(md: string): FaqPair[] {
  const m = md.match(/^##\s+(?:FAQ|Frequently Asked Questions|常见问题)\s*$/im);
  if (!m || m.index === undefined) return [];
  const section = md.slice(m.index);
  // Cut at the next H2 after the FAQ heading, if any
  const rest = section.replace(/^##[^\n]*\n/, "");
  const nextH2 = rest.search(/^##\s/m);
  const body = nextH2 >= 0 ? rest.slice(0, nextH2) : rest;

  const pairs: FaqPair[] = [];
  const blocks = body.split(/^###\s+/m).slice(1);
  for (const block of blocks) {
    const lines = block.split("\n");
    const question = (lines[0] || "").trim();
    const answer = lines.slice(1).join("\n").trim();
    if (question && answer) pairs.push({ question, answer });
  }
  return pairs;
}

/** Answer-first summary block: body starts with a "> **TL;DR:** ..." blockquote. */
export function hasTldr(md: string): boolean {
  return /^>\s*\*\*TL;?DR:?\*\*/im.test(md);
}

/** At least one question-style H2 ("## How ...?", "## What ...?"). */
export function hasQuestionHeading(md: string): boolean {
  return /^##\s+[^\n]*\?\s*$/m.test(md);
}
