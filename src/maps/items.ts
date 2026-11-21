import type { GraphEdge, GraphNode } from '../data/types';
import type { PersonalMap } from './map';

// A saved map is rows of the database's map_items (migrations/0001): one per
// concept, relation, page or atlas reference. The server and the browser both
// turn rows into a PersonalMap and apply a save's changes the same way, here.

export type MapItemKind = 'node' | 'edge' | 'page' | 'ref';
export const MAP_ITEM_KINDS: readonly MapItemKind[] = ['node', 'edge', 'page', 'ref'];

/** One change in a save: an item written whole, or removed (body null). A ref's body is {}. */
export interface MapChange {
  kind: MapItemKind;
  id: string;
  body: GraphNode | GraphEdge | string[] | Record<string, never> | null;
}

export interface MapItem {
  kind: MapItemKind;
  id: string;
  body: unknown;
}

/** Key of an item, as map_revisions lists it */
export const itemKey = (kind: MapItemKind, id: string) => `${kind}:${id}`;

const ITEM_ID = /^[A-Za-z0-9_-]{1,120}$/;

/** Why a change can't be stored as it is — null when it's fine. Only its shape: what it means is mapProblems'. */
export function changeProblem(c: unknown): string | null {
  if (!c || typeof c !== 'object') return 'a change that is not an object';
  const { kind, id, body } = c as Partial<MapChange>;
  if (!MAP_ITEM_KINDS.includes(kind as MapItemKind)) return `an unknown kind of item "${String(kind)}"`;
  if (typeof id !== 'string' || !ITEM_ID.test(id)) return `an item id that isn't letters, digits, "_" or "-": "${String(id)}"`;
  if (body === null) return null;
  switch (kind) {
    case 'node':
    case 'edge':
      if (typeof body !== 'object' || Array.isArray(body) || (body as { id?: unknown }).id !== id)
        return `${kind} "${id}" is not one, or its id differs`;
      return null;
    case 'page':
      return Array.isArray(body) && body.every((d) => typeof d === 'string') ? null : `the page of "${id}" isn't a list of depths`;
    case 'ref':
      return typeof body === 'object' && !Array.isArray(body) ? null : `the reference "${id}" has a body`;
  }
  return null;
}

/** The map its items make. */
export function mapFromItems(meta: { id: string; title: string; description?: string }, items: MapItem[]): PersonalMap {
  const map: PersonalMap = { id: meta.id, title: meta.title, nodes: [], edges: [], refs: [], pages: {} };
  if (meta.description) map.description = meta.description;
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  for (const it of sorted) {
    if (it.kind === 'node') map.nodes.push(it.body as GraphNode);
    else if (it.kind === 'edge') map.edges.push(it.body as GraphEdge);
    else if (it.kind === 'ref') map.refs.push(it.id);
    else map.pages![it.id] = it.body as string[];
  }
  return map;
}

/** The map's items. */
export function itemsOf(map: PersonalMap): MapItem[] {
  return [
    ...map.nodes.map((n) => ({ kind: 'node' as const, id: n.id, body: n })),
    ...map.edges.map((e) => ({ kind: 'edge' as const, id: e.id, body: e })),
    ...map.refs.map((id) => ({ kind: 'ref' as const, id, body: {} })),
    ...Object.entries(map.pages ?? {}).map(([id, depths]) => ({ kind: 'page' as const, id, body: depths })),
  ];
}

/** The map after a save's changes. */
export function applyChanges(map: PersonalMap, changes: MapChange[]): PersonalMap {
  const items = new Map(itemsOf(map).map((it) => [itemKey(it.kind, it.id), it]));
  for (const c of changes) {
    const key = itemKey(c.kind, c.id);
    if (c.body === null) items.delete(key);
    else items.set(key, { kind: c.kind, id: c.id, body: c.body });
  }
  return mapFromItems(map, [...items.values()]);
}
