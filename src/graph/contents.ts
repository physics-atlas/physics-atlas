// The atlas as a book: every concept gets a page, and the pages are ordered
// like the map reads — the big concepts are the chapters, each smaller concept
// sits under its most general neighbour (the one it gathers round on the
// map), and reading order walks that tree depth-first. Pure: no React, no DOM.
import type { GraphEdge, GraphNode, NodeType } from '../data/types';
import { assumptionsOf, nodeRadius, normalizeRelationship } from './concepts';
import type { ConceptIndex } from './concepts';
import { TYPE_GROUPS } from './typeColors';

export interface ContentsEntry {
  id: string;
  /** "2", "2.1", "2.1.3" — its place in the book */
  number: string;
  depth: number;
  parent: string | null;
  children: string[];
}

export interface Contents {
  /** The chapters, in order */
  roots: string[];
  byId: Map<string, ContentsEntry>;
  /** Every page in reading order (depth-first) */
  order: string[];
}

/** A concept's size on the map — the same generality the circles use. */
const sizeOf = (n: GraphNode, index: ConceptIndex) => nodeRadius(n, index.degree.get(n.id) ?? 0);

/** Bigger first, then more important, then A→Z: the order chapters and sections come in. */
function byStanding(index: ConceptIndex) {
  return (a: string, b: string) => {
    const na = index.byId.get(a)!, nb = index.byId.get(b)!;
    return (
      sizeOf(nb, index) - sizeOf(na, index) ||
      (nb.importance ?? 0) - (na.importance ?? 0) ||
      na.label.localeCompare(nb.label)
    );
  };
}

/** Everything a concept is connected to: its relations' other ends, and assumptions that link concepts. */
export function neighbourIds(id: string, index: ConceptIndex): string[] {
  const ids = new Set<string>();
  for (const e of index.outgoing.get(id) ?? []) ids.add(e.target);
  for (const e of index.incoming.get(id) ?? []) ids.add(e.source);
  const { assumes, assumedBy } = assumptionsOf(id, index);
  for (const a of assumes) if (a.node) ids.add(a.node.id);
  for (const n of assumedBy) ids.add(n.id);
  ids.delete(id);
  return [...ids].filter((x) => index.byId.has(x));
}

/**
 * The contents of the atlas. A concept's parent is its most general
 * neighbour that's more general than itself; one with none is a chapter.
 * Parents are always strictly bigger, so the tree has no cycles.
 */
export function buildContents(index: ConceptIndex): Contents {
  const order = byStanding(index);
  const parentOf = new Map<string, string | null>();
  for (const id of index.byId.keys()) {
    const own = sizeOf(index.byId.get(id)!, index);
    const bigger = neighbourIds(id, index).filter((n) => sizeOf(index.byId.get(n)!, index) > own);
    parentOf.set(id, bigger.length ? bigger.sort(order)[0] : null);
  }
  const children = new Map<string, string[]>([...index.byId.keys()].map((id) => [id, []]));
  for (const [id, parent] of parentOf) if (parent) children.get(parent)!.push(id);
  for (const list of children.values()) list.sort(order);
  const roots = [...index.byId.keys()].filter((id) => !parentOf.get(id)).sort(order);

  const byId = new Map<string, ContentsEntry>();
  const reading: string[] = [];
  const walk = (id: string, number: string, depth: number) => {
    byId.set(id, { id, number, depth, parent: parentOf.get(id) ?? null, children: children.get(id)! });
    reading.push(id);
    children.get(id)!.forEach((c, i) => walk(c, `${number}.${i + 1}`, depth + 1));
  };
  roots.forEach((id, i) => walk(id, String(i + 1), 0));
  return { roots, byId, order: reading };
}

/** The page before and after this one in reading order, and the one it sits under. */
export function pageNeighbours(id: string, contents: Contents) {
  const i = contents.order.indexOf(id);
  return {
    prev: i > 0 ? contents.order[i - 1] : null,
    next: i >= 0 && i < contents.order.length - 1 ? contents.order[i + 1] : null,
    up: contents.byId.get(id)?.parent ?? null,
  };
}

/** The chapters and sections above a page, outermost first. */
export function trail(id: string, contents: Contents): string[] {
  const out: string[] = [];
  for (let p = contents.byId.get(id)?.parent ?? null; p; p = contents.byId.get(p)?.parent ?? null) out.unshift(p);
  return out;
}

/** What the sidebar shows: which kinds of concept, which kinds of relation, and a name to match. */
export interface PageFilter {
  types: Set<NodeType>;
  relations: Set<string>;
  text: string;
}

const matchesText = (n: GraphNode, text: string) => !text.trim() || n.label.toLowerCase().includes(text.trim().toLowerCase());

export const matchesFilter = (n: GraphNode, f: PageFilter) => f.types.has(n.type) && matchesText(n, f.text);

/**
 * The contents tree trimmed to a filter: a page shows when it matches, or
 * when something under it does (then as context, so the tree keeps its
 * shape). Returns the ids to show and which of them match.
 */
export function filterContents(contents: Contents, index: ConceptIndex, f: PageFilter) {
  const matches = new Set<string>();
  const shown = new Set<string>();
  const visit = (id: string): boolean => {
    const own = matchesFilter(index.byId.get(id)!, f);
    let below = false;
    for (const c of contents.byId.get(id)!.children) below = visit(c) || below;
    if (own) matches.add(id);
    if (own || below) shown.add(id);
    return own || below;
  };
  contents.roots.forEach(visit);
  return { shown, matches };
}

/** One relation of the current page, as the neighbours view lists it. */
export interface NeighbourItem {
  edge: GraphEdge;
  /** The concept at the other end */
  other: GraphNode;
  /** The relation type (normalised) */
  relation: string;
}

/**
 * The neighbours view: the current page's relations, out of it and into it,
 * filtered by kind of concept (the other end) and kind of relation, each
 * group A→Z by the other concept's name.
 */
export function neighbourGroups(id: string, index: ConceptIndex, f: PageFilter) {
  const item = (edge: GraphEdge, otherId: string): NeighbourItem | null => {
    const other = index.byId.get(otherId);
    const relation = normalizeRelationship(edge.relationship) ?? edge.relationship.trim();
    if (!other || !matchesFilter(other, f) || !f.relations.has(relation)) return null;
    return { edge, other, relation };
  };
  const list = (edges: GraphEdge[], end: 'source' | 'target') =>
    edges
      .map((e) => item(e, e[end]))
      .filter((x): x is NeighbourItem => Boolean(x))
      .sort((a, b) => a.other.label.localeCompare(b.other.label));
  const { assumes, assumedBy } = assumptionsOf(id, index);
  return {
    out: list(index.outgoing.get(id) ?? [], 'target'),
    in: list(index.incoming.get(id) ?? [], 'source'),
    assumes: assumes.flatMap((a) => (a.node && matchesFilter(a.node, f) ? [a.node] : [])),
    assumedBy: assumedBy.filter((n) => matchesFilter(n, f)),
  };
}

/** The relation types present in the graph, A→Z — the choices of the relation filter. */
export function relationTypes(edges: GraphEdge[]): string[] {
  return [...new Set(edges.map((e) => normalizeRelationship(e.relationship) ?? e.relationship.trim()))].sort();
}

/** The by-type view: type groups → types → concepts A→Z, filtered. Empty types are left out. */
export function typeGroups(index: ConceptIndex, f: PageFilter) {
  const nodes = [...index.byId.values()].filter((n) => matchesFilter(n, f));
  return TYPE_GROUPS.map((g) => ({
    ...g,
    types: g.types
      .map((type) => ({ type, nodes: nodes.filter((n) => n.type === type).sort((a, b) => a.label.localeCompare(b.label)) }))
      .filter((t) => t.nodes.length > 0),
  })).filter((g) => g.types.length > 0);
}

/** One concept reached from a page, and the relations that reach it. */
export interface Reached {
  node: GraphNode;
  /** The relations between it and the concept it was reached from */
  edges: GraphEdge[];
}

/** A concept one step further out, through `via` (a first-order neighbour). */
export interface FurtherReached extends Reached {
  via: GraphNode;
}

const edgesBetween = (a: string, b: string, index: ConceptIndex): GraphEdge[] => [
  ...(index.outgoing.get(a) ?? []).filter((e) => e.target === b),
  ...(index.incoming.get(a) ?? []).filter((e) => e.source === b),
];

/**
 * A page's first and second-order connections: the concepts next to it, and
 * the ones next to those (not the page, not already first-order). A concept
 * reached two ways keeps the first first-order neighbour that reaches it, in
 * the first-order list's order (bigger first, like the contents).
 */
export function connectionsOf(id: string, index: ConceptIndex) {
  const order = byStanding(index);
  const first = neighbourIds(id, index).sort(order);
  const firstSet = new Set(first);
  const second: FurtherReached[] = [];
  const seen = new Set([id, ...first]);
  for (const f of first)
    for (const s of neighbourIds(f, index).sort(order)) {
      if (seen.has(s)) continue;
      seen.add(s);
      second.push({ node: index.byId.get(s)!, via: index.byId.get(f)!, edges: edgesBetween(f, s, index) });
    }
  return {
    first: first.map((f): Reached => ({ node: index.byId.get(f)!, edges: edgesBetween(id, f, index) })),
    second,
    /** For each first-order neighbour, what it adds further out */
    furtherVia: (f: string) => second.filter((s) => s.via.id === f && firstSet.has(f)),
  };
}
