import katex from 'katex';
import { pageMaths, parsePage } from './pageText';

// Whether every piece of maths on a page typesets — what the build checks
// (scripts/check-pages.mjs) and the proposal editor says before a page is
// proposed. Uses KaTeX, so it lives apart from the pure page parser.

/** What won't typeset on a page depth, each in words (empty: it all does). */
export function pageMathProblems(source: string): string[] {
  const out: string[] = [];
  for (const { tex, display } of pageMaths(parsePage(source).blocks)) {
    try {
      katex.renderToString(tex, { displayMode: display, throwOnError: true });
    } catch (e) {
      const reason = String((e as Error).message).replace(/^KaTeX parse error: /, '');
      const hint = /only in display mode/.test(reason) ? ' — put it between $$ … $$ on lines of their own, not $ … $' : '';
      out.push(`"${tex.replace(/\s+/g, ' ').trim()}" isn't LaTeX KaTeX can typeset (${reason})${hint}`);
    }
  }
  return out;
}
