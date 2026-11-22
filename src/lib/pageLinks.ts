/** Which atlas page: a concept's, a relation's, or (neither) the front page with the chapters. */
export interface PageRef {
  concept?: string;
  relation?: string;
}

/**
 * A personal map is addressed by its id (members) or, opened with its share link
 * (Phase 4), by "share:<token>". The token goes after "#": browsers never send that
 * part to the server, so it stays out of request logs.
 */
const SHARE = 'share:';
export const shareKey = (token: string): string => SHARE + token;
export const shareToken = (map: string): string | null => (map.startsWith(SHARE) ? map.slice(SHARE.length) : null);
/** The share token in an address's "#share=…", if any. */
export const shareFromHash = (hash: string): string | null => new URLSearchParams(hash.replace(/^#/, '')).get('share');

const mapQuery = (map: string) => (shareToken(map) ? '?mode=map' : `?mode=map&map=${encodeURIComponent(map)}`);
const mapHash = (map: string) => {
  const token = shareToken(map);
  return token ? `#share=${encodeURIComponent(token)}` : '';
};

/** A personal map (Decision 50): its map view. */
export const mapHref = (map: string): string => mapQuery(map) + mapHash(map);

/** A personal map's pages: one of its concepts' or relations', or its front page. */
const mapPagesHref = (map: string, ref: PageRef): string =>
  `${mapQuery(map)}&view=pages${
    ref.relation ? `&relation=${encodeURIComponent(ref.relation)}` : ref.concept ? `&concept=${encodeURIComponent(ref.concept)}` : ''
  }${mapHash(map)}`;

/**
 * A concept's page (null: the front page with the chapters) — in the atlas
 * pages, or with `map`, in that personal map's pages (lib/mapScope.ts).
 */
export const pageHref = (id: string | null, map: string | null = null): string =>
  map ? mapPagesHref(map, id ? { concept: id } : {}) : id ? `?mode=page&concept=${encodeURIComponent(id)}` : '?mode=page';

/** A relation's page. */
export const relationHref = (id: string, map: string | null = null): string =>
  map ? mapPagesHref(map, { relation: id }) : `?mode=page&relation=${encodeURIComponent(id)}`;

export const hrefOf = (ref: PageRef, map: string | null = null): string =>
  ref.relation ? relationHref(ref.relation, map) : pageHref(ref.concept ?? null, map);

/** The page an address points to (from `?mode=page&…`). */
export function refFromSearch(search: string): PageRef {
  const p = new URLSearchParams(search);
  const relation = p.get('relation'), concept = p.get('concept');
  return relation ? { relation } : concept ? { concept } : {};
}

/** A plain left click — the others (new tab, new window) are left to the browser. */
export const isPlainClick = (e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
