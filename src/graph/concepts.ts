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

/**
 * 1–5: authored importance, else authored generality, else a degree estimate
 * (learning goals 1). Drives circle size and the zoom level a node appears at.
 */
export function effectiveImportance(node: GraphNode, degree: number): number {
  if (node.importance !== undefined) return node.importance;
  if (node.type === 'learning_goal') return 1;
  if (node.generality !== undefined) return node.generality;
  return Math.min(5, 1 + Math.round(Math.sqrt(degree)));
}

/** On-canvas circle radius: importance 1–5 → 7…27. */
export function nodeRadius(node: GraphNode, degree: number): number {
  return 7 + (effectiveImportance(node, degree) - 1) * 5;
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
