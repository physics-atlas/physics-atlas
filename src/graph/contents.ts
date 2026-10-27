// The atlas as a book: every concept gets a page, and the pages are ordered
// like the map reads. The most general concepts are the chapters; every other
// concept sits under the closest concept that outranks it, closeness measured
// along the map's relations — the kinds that nest one topic in another
// (classification, description, derivation) as one step, any other kind as
// two. Reading order walks that tree depth-first. Pure: no React, no DOM.
import { relationCategory } from '../data/types';
import type { GraphEdge, GraphNode, NodeType } from '../data/types';
import { assumptionsOf, effectiveGenerality, effectiveImportance, GENERALITY_MAX, normalizeRelationship } from './concepts';
import type { ConceptIndex } from './concepts';
import { TYPE_GROUPS } from './typeColors';

export interface ContentsEntry {
  id: string;
  /** "2", "2.1", "2.1.3" — its place in the book */
  number: string;
  depth: number;
  parent: string | null;
  /** The concepts between it and its parent along the map, nearest first ([] when they're directly connected) */
  via: string[];
  children: string[];
}

export interface Contents {
  /** The chapters, in order */
  roots: string[];
  byId: Map<string, ContentsEntry>;
  /** Every page in reading order (depth-first) */
  order: string[];
}

/** A relation of a nesting kind is one step between two topics; any other relation, or an assumption, this many. */
export const LOOSE_STEP = 2;

/**
 * Which concept outranks which: more general (the circle's size), then more
 * important, then more connected, then A→Z. A strict order, so two concepts
 * that are just as general don't both become chapters — one goes under the
 * other — and the order chapters and sections come in.
 */
function byStanding(index: ConceptIndex) {
  const rank = (id: string) => {
    const n = index.byId.get(id)!;
    const degree = index.degree.get(id) ?? 0;
    return [effectiveGenerality(n, degree), effectiveImportance(n, degree), degree];
  };
  return (a: string, b: string) => {
    const ra = rank(a), rb = rank(b);
    return rb[0] - ra[0] || rb[1] - ra[1] || rb[2] - ra[2] || index.byId.get(a)!.label.localeCompare(index.byId.get(b)!.label);
  };
}

/** Each concept's links for the contents: the other end and how many steps it is (both directions). */
function contentsLinks(index: ConceptIndex): Map<string, Map<string, number>> {
  const links = new Map<string, Map<string, number>>([...index.byId.keys()].map((id) => [id, new Map()]));
  const link = (a: string, b: string, cost: number) => {
    if (a === b || !links.has(a) || !links.has(b)) return;
    for (const [x, y] of [[a, b], [b, a]]) links.get(x)!.set(y, Math.min(cost, links.get(x)!.get(y) ?? Infinity));
  };
  for (const edges of index.outgoing.values())
    for (const e of edges) {
      const type = normalizeRelationship(e.relationship) ?? e.relationship.trim();
      link(e.source, e.target, relationCategory(type).nests ? 1 : LOOSE_STEP);
    }
  for (const id of index.byId.keys()) for (const a of assumptionsOf(id, index).assumes) if (a.node) link(id, a.node.id, LOOSE_STEP);
  return links;
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

type Placement = { parent: string; via: string[] };

/**
 * The closest concept `accepts` takes, along the contents links (Dijkstra; the
 * map is small) — between two as close, the one that ranks higher — and the
 * concepts on the way to it, nearest first. null when none can be reached.
 */
function closest(
  id: string,
  links: Map<string, Map<string, number>>,
  order: (a: string, b: string) => number,
  accepts: (other: string) => boolean,
): Placement | null {
  const dist = new Map<string, number>([[id, 0]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();
  const found: string[] = [];
  let foundAt = Infinity;
  for (;;) {
    let here: string | null = null;
    for (const [x, d] of dist)
      if (!done.has(x) && (here === null || d < dist.get(here)! || (d === dist.get(here)! && order(x, here) < 0))) here = x;
    if (here === null || dist.get(here)! > foundAt) break;
    done.add(here);
    if (here !== id && accepts(here)) {
      found.push(here);
      foundAt = dist.get(here)!;
      continue; // what's beyond a candidate is farther than it
    }
    for (const [next, cost] of links.get(here)!) {
      const d = dist.get(here)! + cost;
      if (d < (dist.get(next) ?? Infinity)) {
        dist.set(next, d);
        prev.set(next, here);
      }
    }
  }
  if (!found.length) return null;
  const parent = found.sort(order)[0];
  const via: string[] = [];
  for (let x = prev.get(parent); x && x !== id; x = prev.get(x)) via.unshift(x);
  return { parent, via };
}

/**
 * The contents of the atlas. The concepts of the greatest generality are the
 * chapters. Every other concept goes under the closest concept that is more
 * general than it — closest along the relations, a nesting kind one step and
 * any other kind LOOSE_STEP (contentsLinks); between two as close, the one
 * that ranks higher (byStanding). Only when nothing more general can be
 * reached does the tie-break decide: it goes under the closest concept just
 * as general that outranks it, so two equals don't both become chapters. A
 * concept that nothing reachable outranks is a chapter too (the top of a part
 * of the map with no landmark). A parent always outranks its child, so the
 * tree has no cycles.
 */
export function buildContents(index: ConceptIndex): Contents {
  const order = byStanding(index);
  const links = contentsLinks(index);
  const generality = (id: string) => effectiveGenerality(index.byId.get(id)!, index.degree.get(id) ?? 0);
  const parentOf = new Map<string, Placement | null>();
  for (const id of index.byId.keys()) {
    const own = generality(id);
    parentOf.set(
      id,
      own >= GENERALITY_MAX
        ? null
        : (closest(id, links, order, (x) => generality(x) > own) ?? closest(id, links, order, (x) => order(x, id) < 0)),
    );
  }
  const children = new Map<string, string[]>([...index.byId.keys()].map((id) => [id, []]));
  for (const [id, p] of parentOf) if (p) children.get(p.parent)!.push(id);
  for (const list of children.values()) list.sort(order);
  const roots = [...index.byId.keys()].filter((id) => !parentOf.get(id)).sort(order);

  const byId = new Map<string, ContentsEntry>();
  const reading: string[] = [];
  const walk = (id: string, number: string, depth: number) => {
    const p = parentOf.get(id) ?? null;
    byId.set(id, { id, number, depth, parent: p?.parent ?? null, via: p?.via ?? [], children: children.get(id)! });
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
