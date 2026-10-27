// Pictures of a concept (node.figures): files under content/media/<concept-id>/,
// each described in words (alt), with where it's from and its licence
// (credit). The rules are shared by the editor, the proposal checks and the
// backend, which writes a proposal's new pictures into its pull request;
// scripts/validate-concepts.mjs mirrors them for the files in the repository.
// Pure: no DOM.
import type { Figure } from '../data/types';

/** The kinds of picture taken, by file extension. SVG isn't one: it can carry scripts. */
export const FIGURE_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' } as const;
export type FigureExt = keyof typeof FIGURE_TYPES;

/** The largest picture, in bytes, once the editor has resized it. */
export const FIGURE_MAX_BYTES = 1_000_000;
/** How many pictures one concept carries. */
export const MAX_FIGURES = 4;
/** The longest side a picture is resized to before it's added. */
export const FIGURE_MAX_SIDE = 1600;

/** "<concept-id>/<name>.<ext>": a picture lives in its concept's folder. */
const FIGURE_FILE = /^([a-z0-9]+(?:_[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.(png|jpg|webp|gif)$/;

export const figurePath = (file: string) => `content/media/${file}`;

/** A file name from what the picture was called: "My Plot (2).PNG" → "my-plot-2". */
export const figureSlug = (name: string) =>
  name
    .replace(/\.[^.]*$/, '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'picture';

/** What's wrong with a concept's pictures (empty: nothing). */
export function figureProblems(figures: unknown, conceptId: string): string[] {
  if (figures === undefined) return [];
  if (!Array.isArray(figures)) return ['"figures" must be a list of pictures'];
  const out: string[] = [];
  if (figures.length > MAX_FIGURES) out.push(`at most ${MAX_FIGURES} pictures`);
  const seen = new Set<string>();
  figures.forEach((raw, i) => {
    const f = raw as Partial<Figure>;
    const at = `picture ${i + 1}`;
    const m = typeof f.file === 'string' ? FIGURE_FILE.exec(f.file) : null;
    if (!m) out.push(`${at}: "file" must be "${conceptId}/<name>.png" (or .jpg, .webp, .gif)`);
    else if (m[1] !== conceptId) out.push(`${at}: belongs in content/media/${conceptId}/`);
    if (typeof f.file === 'string') {
      if (seen.has(f.file)) out.push(`${at}: listed twice`);
      seen.add(f.file);
    }
    if (typeof f.alt !== 'string' || !f.alt.trim()) out.push(`${at}: describe what it shows ("alt"), for people who can't see it`);
    if (typeof f.credit !== 'string' || !f.credit.trim()) out.push(`${at}: say where it's from and its licence ("credit")`);
    if (f.caption !== undefined && (typeof f.caption !== 'string' || !f.caption.trim())) out.push(`${at}: "caption" must be text, or left out`);
    for (const key of Object.keys(f)) if (!['file', 'alt', 'caption', 'credit'].includes(key)) out.push(`${at}: unknown field "${key}"`);
  });
  return out;
}

/** What a file's first bytes say it is — the extension alone isn't trusted. */
export function sniffImage(bytes: Uint8Array): FigureExt | null {
  const at = (i: number, ...b: number[]) => b.every((x, k) => bytes[i + k] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'jpg';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'gif';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'webp';
  return null;
}

/** A new picture as a proposal sends it: where it goes, and its bytes in base64. */
export interface FigureUpload {
  path: string;
  data: string;
}

/**
 * Whether an upload is a picture that may go where it says: a path a figure
 * of the proposal names, under content/media/, the bytes really that kind of
 * image and not too large. Returns the problem, or null.
 */
export function uploadProblem(u: FigureUpload, allowedPaths: Set<string>): string | null {
  if (!allowedPaths.has(u.path)) return `"${u.path}" isn't a picture of the proposal's concept`;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(u.data), (c) => c.charCodeAt(0));
  } catch {
    return `"${u.path}" isn't base64`;
  }
  if (bytes.length > FIGURE_MAX_BYTES) return `"${u.path}" is larger than ${FIGURE_MAX_BYTES / 1_000_000} MB`;
  const ext = sniffImage(bytes);
  if (!ext || !u.path.endsWith(`.${ext}`)) return `"${u.path}" isn't the kind of picture its name says`;
  return null;
}
