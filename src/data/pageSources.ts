// The atlas pages as written: content/pages/<concept-id>/depth-N.md, Markdown
// + LaTeX (lib/pageText.ts). Which pages exist, and at how many depths, is
// known up front; a page's text is loaded when it's opened (one small chunk
// per file). scripts/check-pages.mjs stops the build on a page that won't show.

const FILES = import.meta.glob<string>('/content/pages/*/depth-*.md', { query: '?raw', import: 'default' });
const FILE = /^\/content\/pages\/([^/]+)\/depth-([1-9][0-9]*)\.md$/;

const fileOf = (id: string, depth: number) => `/content/pages/${id}/depth-${depth}.md`;

/** How many depths each concept's page is written at (depth 1, 2, … without gaps). */
export const PAGE_DEPTHS: Record<string, number> = (() => {
  const ids = new Set(Object.keys(FILES).flatMap((f) => FILE.exec(f)?.[1] ?? []));
  const out: Record<string, number> = {};
  for (const id of ids) {
    let n = 0;
    while (fileOf(id, n + 1) in FILES) n++;
    if (n) out[id] = n;
  }
  return out;
})();

/** A page's depths, depth 1 first ([] when nothing is written). */
export async function loadPage(id: string): Promise<string[]> {
  const n = PAGE_DEPTHS[id] ?? 0;
  return Promise.all(Array.from({ length: n }, (_, i) => FILES[fileOf(id, i + 1)]()));
}
