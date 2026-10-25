/** Which atlas page: a concept's, a relation's, or (neither) the front page with the chapters. */
export interface PageRef {
  concept?: string;
  relation?: string;
}

/** A concept's page in the atlas pages (null: the front page with the chapters). */
export const pageHref = (id: string | null): string =>
  id ? `?mode=page&concept=${encodeURIComponent(id)}` : '?mode=page';

/** A relation's page. */
export const relationHref = (id: string): string => `?mode=page&relation=${encodeURIComponent(id)}`;

export const hrefOf = (ref: PageRef): string =>
  ref.relation ? relationHref(ref.relation) : pageHref(ref.concept ?? null);

/** The page an address points to (from `?mode=page&…`). */
export function refFromSearch(search: string): PageRef {
  const p = new URLSearchParams(search);
  const relation = p.get('relation'), concept = p.get('concept');
  return relation ? { relation } : concept ? { concept } : {};
}

/** A plain left click — the others (new tab, new window) are left to the browser. */
export const isPlainClick = (e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
