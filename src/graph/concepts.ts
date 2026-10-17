import { EDGE_SENTENCE_TEMPLATES } from '../data/types';
import type { ConceptGraph, EdgeType, GraphEdge, GraphNode } from '../data/types';
import { dfsClosure, kahnOrder } from './dag';

export type ConceptMap = Map<string, GraphNode>;

/**
 * Trims, collapses inner whitespace and lowercases a raw `relationship`
 * string, then looks it up against EDGE_SENTENCE_TEMPLATES (case-insensitive,
 * so the casing variants flagged by the validator don't break sentence
 * rendering). Mirrored in scripts/validate-concepts.mjs — keep in sync.
 */
export function normalizeRelationship(raw: string): EdgeType | null {
  const key = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  return key in EDGE_SENTENCE_TEMPLATES ? (key as EdgeType) : null;
}

/**
 * The edge's sentence ({s}/{t} filled with node labels, plus "under the
 * assumption of …" when the edge has conditions) split into text runs
 * and node references, so a view can render the other node's label as a
 * control. Falls back to a plain "{s} — {raw} — {t}" reading only for an
 * unknown relationship type — a case the validator already rejects, so this
 * is a defensive fallback, not a normal path.
 */
export function sentenceParts(
  edge: GraphEdge,
  byId: ConceptMap,
  withConditions = true,
): (string | { id: string; label: string })[] {
  const s = { id: edge.source, label: byId.get(edge.source)?.label ?? edge.source };
  const t = { id: edge.target, label: byId.get(edge.target)?.label ?? edge.target };
  const type = normalizeRelationship(edge.relationship);
  let template = type ? EDGE_SENTENCE_TEMPLATES[type] : `{s} — ${edge.relationship} — {t}`;
  const clause = withConditions ? conditionClause(edge) : null;
  if (clause) template = `${template.replace(/\.$/, '')} ${clause}.`;
  return template
    .split(/(\{s\}|\{t\})/)
    .filter((part) => part !== '')
    .map((part) => (part === '{s}' ? s : part === '{t}' ? t : part));
}

/** "a", "a and b", "a, b and c" */
export function joinList(items: string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "under the assumption(s) of …" for an edge with conditions, else null. */
export function conditionClause(edge: GraphEdge): string | null {
  const labels = (edge.conditions ?? []).map((c) => c.label);
  if (labels.length === 0) return null;
  return `under the assumption${labels.length > 1 ? 's' : ''} of ${joinList(labels)}`;
}

export interface ConceptIndex {
  byId: ConceptMap;
  incoming: Map<string, GraphEdge[]>;
  outgoing: Map<string, GraphEdge[]>;
  degree: Map<string, number>;
}

/** byId + incoming/outgoing adjacency + degree (in + out), for every node. */
export function buildConceptIndex(graph: ConceptGraph): ConceptIndex {
  const byId: ConceptMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, GraphEdge[]>();
  const outgoing = new Map<string, GraphEdge[]>();
  const degree = new Map<string, number>();
  for (const n of graph.nodes) {
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
    degree.set(n.id, 0);
  }
  for (const e of graph.edges) {
    outgoing.get(e.source)?.push(e);
    incoming.get(e.target)?.push(e);
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  return { byId, incoming, outgoing, degree };
}

/** Generality: 1 (very specific) – 10 (very general). Sets the circle size. */
export const GENERALITY_MAX = 10;
/** Importance: 1 (minor detail) – 50 (landmark). Sets how far out a concept stays visible. */
export const IMPORTANCE_MAX = 50;

/** 1–10: authored generality, else a degree estimate (learning goals 1). Drives circle size. */
export function effectiveGenerality(node: GraphNode, degree: number): number {
  if (node.generality !== undefined) return node.generality;
  if (node.type === 'learning_goal') return 1;
  return Math.min(GENERALITY_MAX, 1 + Math.round(2 * Math.sqrt(degree)));
}

/**
 * 1–50: authored importance, else a degree estimate (learning goals 1).
 * Drives the zoom level a concept appears at and the size of its name.
 */
export function effectiveImportance(node: GraphNode, degree: number): number {
  if (node.importance !== undefined) return node.importance;
  if (node.type === 'learning_goal') return 1;
  return Math.min(IMPORTANCE_MAX, 1 + Math.round(10 * Math.sqrt(degree)));
}

const MIN_RADIUS = 7;
/** Generality 10 is ten times the old largest circle (27 px). */
const MAX_RADIUS = 270;
/** Each generality step multiplies the radius by this (≈ 1.5), so small stays visibly small. */
const STEP = (MAX_RADIUS / MIN_RADIUS) ** (1 / (GENERALITY_MAX - 1));

/** On-canvas circle radius: generality 1–10 → 7…270, ×1.5 per step. */
export function nodeRadius(node: GraphNode, degree: number): number {
  return MIN_RADIUS * STEP ** (effectiveGenerality(node, degree) - 1);
}

/**
 * From this radius (generality 6 and up) the name is written inside the
 * circle, like a region's name on a map: the concept then claims only the
 * room of its circle, so specific concepts can sit close around it.
 */
export const INSIDE_LABEL_RADIUS = 50;

/**
 * Label size: importance 1–50 → 12…18 px, like a map's city names — and for a
 * big circle, in proportion to it (radius ÷ 3, written inside), so the
 * largest concepts can be read far out.
 */
export const labelSize = (importance: number, radius = 0): number => {
  const base = 12 + ((importance - 1) * 6) / (IMPORTANCE_MAX - 1);
  return radius >= INSIDE_LABEL_RADIUS ? Math.max(base, radius / 3) : base;
};

/** At and above this importance a concept shows on the whole-map overview. */
const OVERVIEW_IMPORTANCE = 40;
/** Every this-many importance points below it doubles how close you have to zoom. */
const POINTS_PER_DOUBLING = 8;

/**
 * Map-style level of detail: the zoom, relative to the whole-map overview, at
 * which a concept of this importance appears. Every importance value is its
 * own depth: 40 shows on the overview, 32 at 2× closer, 24 at 4×, 16 at 8×,
 * 1 at about 30×; 50 always shows.
 */
export function revealZoom(importance: number): number {
  const i = Math.min(IMPORTANCE_MAX, Math.max(1, importance));
  if (i >= IMPORTANCE_MAX) return 0;
  return 2 ** ((OVERVIEW_IMPORTANCE - i) / POINTS_PER_DOUBLING);
}

/**
 * The research domains a concept belongs to: `attrs.domain` lists them as
 * "A / B". Mirrored in scripts/validate-concepts.mjs.
 */
export function domainsOf(node: GraphNode): string[] {
  const domain = 'domain' in node.attrs ? node.attrs.domain : undefined;
  return domain ? domain.split(' / ').map((d) => d.trim()) : [];
}

/**
 * The node plus its first-degree connections in both directions (any
 * relation type) — the click sub-graph.
 */
export function neighborsOf(id: string, index: ConceptIndex): string[] {
  const ids = new Set([id]);
  for (const e of index.incoming.get(id) ?? []) ids.add(e.source);
  for (const e of index.outgoing.get(id) ?? []) ids.add(e.target);
  return [...ids];
}

/**
 * The relation types that pull a concept into a goal's path. Deliberately
 * narrow — widening it (e.g. to `depends on`) is a pedagogy call for the author.
 */
export const CURRICULUM_EDGE_TYPES: EdgeType[] = ['strict prerequisite for'];

export type ResourceNode = Extract<GraphNode, { type: 'resource' }>;

export interface ConceptPath {
  /** Steps in learning order, the goal last */
  order: string[];
  /** Steps ∪ their resources — the GraphView highlight set */
  highlight: Set<string>;
  /** `resource` nodes that `helps understand` each step */
  resourcesByStep: Map<string, ResourceNode[]>;
}

/**
 * The concept counterpart of goalPathFor(): closure over CURRICULUM_EDGE_TYPES,
 * ordered by the same kahnOrder() rule as topic curricula.
 */
export function conceptPathFor(goalId: string, index: ConceptIndex): ConceptPath | null {
  if (!index.byId.has(goalId)) return null;
  const prereqsOf = (id: string) =>
    (index.incoming.get(id) ?? [])
      .filter((e) => {
        const type = normalizeRelationship(e.relationship);
        return type !== null && CURRICULUM_EDGE_TYPES.includes(type);
      })
      .map((e) => e.source);
  const closure = dfsClosure(goalId, prereqsOf);
  const order = kahnOrder(
    new Map([...closure].map((id) => [id, prereqsOf(id).filter((p) => closure.has(p))])),
  );
  const highlight = new Set(order);
  const resourcesByStep = new Map<string, ResourceNode[]>();
  for (const id of order) {
    const resources = (index.incoming.get(id) ?? [])
      .filter((e) => normalizeRelationship(e.relationship) === 'helps understand')
      .map((e) => index.byId.get(e.source))
      .filter((n): n is ResourceNode => n?.type === 'resource');
    for (const r of resources) highlight.add(r.id);
    resourcesByStep.set(id, resources);
  }
  return { order, highlight, resourcesByStep };
}
