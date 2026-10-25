/** A concept's page in the atlas pages (null: the front page with the chapters). */
export const pageHref = (id: string | null): string =>
  id ? `?mode=page&concept=${encodeURIComponent(id)}` : '?mode=page';

/** A plain left click — the others (new tab, new window) are left to the browser. */
export const isPlainClick = (e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
