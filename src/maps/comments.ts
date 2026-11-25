import { sentenceParts } from '../graph/concepts';
import type { ResolvedMap } from './map';
import type { MapRole } from './api';

// Comment threads on a personal map (Decision 50, Phase 3): on a concept, a
// relation, a page depth, or the whole map. A thread is its first comment;
// replies point to it. Shared by the server (server/maps.ts) and the panel.

export interface MapComment {
  id: string;
  /** null on a thread's first comment */
  threadId: string | null;
  /** 'map', 'node:<id>', 'edge:<id>', 'page:<id>:<depth>' */
  anchor: string;
  /** GitHub username; null once the author deleted their account ("former member") */
  author: string | null;
  /** Markdown + LaTeX, the proposal subset (src/community/richText.ts) */
  body: string;
  createdAt: string;
  editedAt: string | null;
  /** On a thread's first comment */
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface CommentThread {
  first: MapComment;
  replies: MapComment[];
}

export const COMMENT_LIMITS = { body: 4000, perMap: 2000 };

/** Owners, editors and commenters read and write comments; viewers don't see them. */
export const canComment = (role: MapRole) => role !== 'viewer';

/**
 * The parts of a concept a comment can be about, besides the concept as a whole
 * (comment mode on the map). A page's depths have their own anchor.
 */
export const COMMENT_FIELDS = {
  label: 'Name',
  type: 'Kind',
  description: 'Description',
  details: 'Equation, formulas or resource details',
  relations: 'Relations',
  scale: 'Importance and generality',
  page: 'Its page',
} as const;
export type CommentField = keyof typeof COMMENT_FIELDS;
const isField = (f: string): f is CommentField => f in COMMENT_FIELDS;

export type Anchor =
  | { kind: 'map' }
  | { kind: 'node'; id: string; field?: CommentField }
  | { kind: 'edge'; id: string }
  | { kind: 'page'; id: string; depth: number };

export function parseAnchor(anchor: string): Anchor | null {
  if (anchor === 'map') return { kind: 'map' };
  const m = /^(node|edge):([^:]{1,200})$/.exec(anchor);
  if (m) return { kind: m[1] as 'node' | 'edge', id: m[2] };
  const f = /^node:([^:]{1,200}):([a-z]{1,20})$/.exec(anchor);
  if (f) return isField(f[2]) ? { kind: 'node', id: f[1], field: f[2] } : null;
  const p = /^page:([^:]{1,200}):([1-9]\d?)$/.exec(anchor);
  return p ? { kind: 'page', id: p[1], depth: Number(p[2]) } : null;
}

export function anchorKey(a: Anchor): string {
  if (a.kind === 'node' && a.field) return `node:${a.id}:${a.field}`;
  return a.kind === 'map' ? 'map' : a.kind === 'page' ? `page:${a.id}:${a.depth}` : `${a.kind}:${a.id}`;
}

/** Whether the anchor names something the map has now (a concept, its relation, a concept's page). */
export function anchorInMap(a: Anchor, resolved: ResolvedMap): boolean {
  if (a.kind === 'map') return true;
  if (a.kind === 'edge') return resolved.graph.edges.some((e) => e.id === a.id);
  return resolved.graph.nodes.some((n) => n.id === a.id);
}

/** What a thread is about, in words: "Force", "Force is a … of …", "Force (page, depth 2)". */
export function anchorLabel(a: Anchor | null, resolved: ResolvedMap): string {
  if (!a) return 'Something unknown';
  if (a.kind === 'map') return 'The whole map';
  const byId = new Map(resolved.graph.nodes.map((n) => [n.id, n]));
  if (a.kind === 'edge') {
    const edge = resolved.graph.edges.find((e) => e.id === a.id);
    if (!edge) return `A relation no longer on the map (${a.id})`;
    return sentenceParts(edge, byId)
      .map((p) => (typeof p === 'string' ? p : p.label))
      .join('');
  }
  const label = byId.get(a.id)?.label;
  if (!label) return `A concept no longer on the map (${a.id})`;
  if (a.kind === 'node' && a.field) return `${label} (${COMMENT_FIELDS[a.field].toLowerCase()})`;
  return a.kind === 'page' ? `${label} (page, depth ${a.depth})` : label;
}

/** What on the map a thread belongs to: a concept (its page and parts too), a relation, or the map itself. */
export function anchorTarget(a: Anchor | null): { kind: 'node' | 'edge'; id: string } | null {
  if (!a || a.kind === 'map') return null;
  return a.kind === 'edge' ? { kind: 'edge', id: a.id } : { kind: 'node', id: a.id };
}

/** Open threads on each concept and relation, by "node:<id>" / "edge:<id>". */
export function openThreadsByTarget(comments: MapComment[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of comments) {
    if (c.threadId || c.resolvedAt) continue;
    const t = anchorTarget(parseAnchor(c.anchor));
    if (t) out.set(`${t.kind}:${t.id}`, (out.get(`${t.kind}:${t.id}`) ?? 0) + 1);
  }
  return out;
}

/** Threads, newest activity first; replies in order. */
export function threadsOf(comments: MapComment[]): CommentThread[] {
  const replies = new Map<string, MapComment[]>();
  for (const c of comments) if (c.threadId) replies.set(c.threadId, [...(replies.get(c.threadId) ?? []), c]);
  const last = (t: CommentThread) => [t.first, ...t.replies].reduce((m, c) => (c.createdAt > m ? c.createdAt : m), '');
  return comments
    .filter((c) => !c.threadId)
    .map((first) => ({ first, replies: (replies.get(first.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }))
    .sort((a, b) => last(b).localeCompare(last(a)));
}

/** Comments by someone else written after `seen` (an ISO time; null: never visited — nothing is "new"). */
export function newSince(comments: MapComment[], seen: string | null, me: string): MapComment[] {
  if (!seen) return [];
  return comments.filter((c) => c.createdAt > seen && c.author?.toLowerCase() !== me.toLowerCase());
}
