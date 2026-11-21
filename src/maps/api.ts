import type { MapChange } from './items';
import type { PersonalMap } from './map';

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

/**
 * The changes that take an atlas concept out of a map: the reference, and the
 * map's own relations to it (they'd point at nothing).
 */
export function removeRefChanges(map: PersonalMap, id: string): MapChange[] {
  return [
    { kind: 'ref', id, body: null },
    ...map.edges.filter((e) => e.source === id || e.target === id).map((e) => ({ kind: 'edge' as const, id: e.id, body: null })),
  ];
}
