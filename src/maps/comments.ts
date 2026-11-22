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

export type Anchor =
  | { kind: 'map' }
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'page'; id: string; depth: number };

export function parseAnchor(anchor: string): Anchor | null {
  if (anchor === 'map') return { kind: 'map' };
  const m = /^(node|edge):([^:]{1,200})$/.exec(anchor);
  if (m) return { kind: m[1] as 'node' | 'edge', id: m[2] };
  const p = /^page:([^:]{1,200}):([1-9]\d?)$/.exec(anchor);
  return p ? { kind: 'page', id: p[1], depth: Number(p[2]) } : null;
}

export function anchorKey(a: Anchor): string {
  return a.kind === 'map' ? 'map' : a.kind === 'page' ? `page:${a.id}:${a.depth}` : `${a.kind}:${a.id}`;
}

/** Whether the anchor names something the map has now (a concept, its relation, a concept's page). */
export function anchorInMap(a: Anchor, resolved: ResolvedMap): boolean {
  if (a.kind === 'map') return true;
  if (a.kind === 'edge') return resolved.graph.edges.some((e) => e.id === a.id);
  return resolved.graph.nodes.some((n) => n.id === a.id);
}

/** What a thread is about, in words: "Force", "Force is a … of …", "Force — page, depth 2". */
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
  return a.kind === 'page' ? `${label} — page, depth ${a.depth}` : label;
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
