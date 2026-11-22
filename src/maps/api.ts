import type { MapComment } from './comments';
import type { MapChange } from './items';
import type { PersonalMap } from './map';
import type { GraphNode } from '../data/types';
import type { Proposal } from '../community/types';

// The browser side of the maps backend (server/maps.ts). Every call says what
// happened in words a person can act on; where there's no backend (the dev
// server), it says that too.

export type MapRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export interface MapMember {
  login: string;
  role: MapRole;
}

export interface SavedMap {
  map: PersonalMap;
  revision: number;
  role: MapRole;
  members: MapMember[];
}

export interface MapSummary {
  id: string;
  title: string;
  role: MapRole;
  updatedAt: string;
}

export type MapResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string; problems?: string[]; current?: SavedMap };

export const ROLE_LABELS: Record<MapRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  commenter: 'Commenter',
  viewer: 'Viewer',
};

export const canEdit = (role: MapRole) => role === 'owner' || role === 'editor';

async function call<T>(path: string, init?: RequestInit): Promise<MapResult<T>> {
  try {
    const res = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    });
    if (res.status === 204) return { ok: true, value: undefined as T };
    if (!res.headers.get('content-type')?.includes('application/json'))
      return { ok: false, status: 0, error: 'Personal maps need the site’s backend, which isn’t running here.' };
    const data = await res.json();
    if (res.ok) return { ok: true, value: data as T };
    return { ok: false, status: res.status, error: data.error ?? `The server said ${res.status}.`, problems: data.problems, current: data.current };
  } catch {
    return { ok: false, status: 0, error: 'The site could not be reached. Check the connection and try again.' };
  }
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const listMaps = () => call<{ maps: MapSummary[] }>('/api/maps');
export const createMap = (title: string, description = '') => call<{ id: string }>('/api/maps', post({ title, description }));
export const readMap = (id: string) => call<SavedMap>(`/api/maps/${encodeURIComponent(id)}`);
export const saveMap = (id: string, base: number, changes: MapChange[], meta: { title?: string; description?: string } = {}) =>
  call<SavedMap>(`/api/maps/${encodeURIComponent(id)}/save`, post({ base, changes, ...meta }));
export const addMember = (id: string, login: string, role: MapRole) =>
  call<SavedMap>(`/api/maps/${encodeURIComponent(id)}/members`, post({ login, role }));
export const removeMember = (id: string, login: string) =>
  call<SavedMap | undefined>(`/api/maps/${encodeURIComponent(id)}/members/${encodeURIComponent(login)}`, { method: 'DELETE' });

const commentsPath = (id: string) => `/api/maps/${encodeURIComponent(id)}/comments`;
export const listComments = (id: string) => call<{ comments: MapComment[] }>(commentsPath(id));
/** A new thread (no `thread`) or a reply to one */
export const addComment = (id: string, anchor: string, body: string, thread?: string) =>
  call<{ comments: MapComment[] }>(commentsPath(id), post({ anchor, body, ...(thread ? { thread } : {}) }));
export const resolveThread = (id: string, thread: string, resolved: boolean) =>
  call<{ comments: MapComment[] }>(`${commentsPath(id)}/${encodeURIComponent(thread)}/resolve`, post({ resolved }));
export const deleteComment = (id: string, comment: string) =>
  call<{ comments: MapComment[] }>(`${commentsPath(id)}/${encodeURIComponent(comment)}`, { method: 'DELETE' });

/** What else goes when a concept leaves a map: its relations there, and its place in the course goals. */
function leavingChanges(map: PersonalMap, id: string): MapChange[] {
  return [
    ...map.edges.filter((e) => e.source === id || e.target === id).map((e) => ({ kind: 'edge' as const, id: e.id, body: null })),
    ...(map.courseGoals ?? [])
      .filter((g) => g.goals.includes(id))
      .map((g) => ({ kind: 'goal' as const, id: g.id, body: { ...g, goals: g.goals.filter((x) => x !== id) } })),
  ];
}

/**
 * The changes that take an atlas concept out of a map: the reference, the map's
 * own relations to it (they'd point at nothing), and its place in course goals.
 */
export function removeRefChanges(map: PersonalMap, id: string): MapChange[] {
  return [{ kind: 'ref', id, body: null }, ...leavingChanges(map, id)];
}

/** The changes that delete one of the map's own concepts: it, its page, and what removeRefChanges takes too. */
export function deleteConceptChanges(map: PersonalMap, id: string): MapChange[] {
  return [
    { kind: 'node', id, body: null },
    ...(map.pages?.[id] ? [{ kind: 'page' as const, id, body: null }] : []),
    ...leavingChanges(map, id),
  ];
}

/**
 * A draft from the editor, as a proposal carries it, turned into a save into the
 * map (Phase 2): its concept, relations, removals and page. What a map can't hold
 * yet — new kinds of relation, pictures, removing the atlas's own relations — is
 * named in `problems` instead.
 */
export function proposalChanges(map: PersonalMap, p: Proposal): { changes: MapChange[]; problems: string[] } {
  const problems: string[] = [];
  const own = new Set(map.edges.map((e) => e.id));
  const strip = (n: GraphNode): GraphNode => {
    const { figures: _f, ...rest } = n;
    void _f;
    return rest as GraphNode;
  };
  const changes: MapChange[] = [
    ...[...p.nodes, ...(p.edits ?? [])].map((n) => ({ kind: 'node' as const, id: n.id, body: strip(n) })),
    ...p.edges.map((e) => ({ kind: 'edge' as const, id: e.id, body: e })),
  ];
  for (const id of p.removals ?? []) {
    if (own.has(id)) changes.push({ kind: 'edge', id, body: null });
    else problems.push('A relation from the atlas can’t be removed in a map: it comes with its two concepts.');
  }
  for (const page of p.pages ?? []) {
    const depths = page.depths.filter((d) => d.trim());
    changes.push({ kind: 'page', id: page.concept, body: depths.length ? depths : null });
  }
  if (p.relationTypes?.length)
    problems.push(`A map can’t add new kinds of relation yet (${p.relationTypes.map((t) => `“${t.type}”`).join(', ')}): choose one from the list.`);
  if ([...p.nodes, ...(p.edits ?? [])].some((n) => n.figures?.length)) problems.push('A map can’t hold pictures yet.');
  // A page the map never had, written empty, is no change.
  return { changes: changes.filter((c) => !(c.kind === 'page' && c.body === null && !map.pages?.[c.id])), problems: [...new Set(problems)] };
}
