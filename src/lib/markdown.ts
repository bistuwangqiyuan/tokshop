import { marked } from "marked";

/**
 * Render an article body to HTML with any top-level heading demoted.
 *
 * The page template already prints the article title as the page's only h1.
 * Models sometimes repeat a title as `# ...` at the top of the body, which
 * produced a second h1 and cost the page a point in the SEO audit. Demoting at
 * render time fixes every article already published, not just the next one.
 *
 * Done through the lexer rather than a regex so that a `#` inside a fenced code
 * block stays a comment, and locally rather than via `marked.use` so that
 * standalone documents, which legitimately own their h1, are unaffected.
 */
export function renderArticleHtml(md: string): string {
  const tokens = marked.lexer(md);
  for (const token of tokens) {
    if (token.type === "heading" && token.depth === 1) token.depth = 2;
  }
  return marked.parser(tokens);
}
