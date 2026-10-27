import { EDGE_SENTENCE_TEMPLATES } from '../data/types';
import type { Assumption, ConceptGraph, EdgeType, GraphEdge, GraphNode } from '../data/types';
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
 * The edge's sentence ({s}/{t} filled with node labels) split into text runs
 * and node references, so a view can render the other node's label as a
 * control. A type the vocabulary doesn't have yet — one a proposal adds
 * ("Other…" in the editor) — reads as its own words: "{s} is a limit of {t}."
 */
export function sentenceParts(edge: GraphEdge, byId: ConceptMap): (string | { id: string; label: string })[] {
  const s = { id: edge.source, label: byId.get(edge.source)?.label ?? edge.source };
  const t = { id: edge.target, label: byId.get(edge.target)?.label ?? edge.target };
  const type = normalizeRelationship(edge.relationship);
  const template = type ? EDGE_SENTENCE_TEMPLATES[type] : `{s} ${edge.relationship.trim()} {t}.`;
  return template
    .split(/(\{s\}|\{t\})/)
    .filter((part) => part !== '')
    .map((part) => (part === '{s}' ? s : part === '{t}' ? t : part));
}

/** "a", "a and b", "a, b and c" */
export function joinList(items: string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export interface ConceptIndex {
  byId: ConceptMap;
  incoming: Map<string, GraphEdge[]>;
  outgoing: Map<string, GraphEdge[]>;
  degree: Map<string, number>;
  /** id → the concepts whose `assumes` point to it */
  assumedBy: Map<string, string[]>;
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
  const assumedBy = new Map<string, string[]>();
  for (const n of graph.nodes)
    for (const a of assumedConceptIds(n)) assumedBy.set(a, [...(assumedBy.get(a) ?? []), n.id]);
  return { byId, incoming, outgoing, degree, assumedBy };
}

/** The concepts a concept's assumptions point to (most are text only and point nowhere). */
export const assumedConceptIds = (node: GraphNode): string[] =>
  (node.assumes ?? []).flatMap((a) => (a.concept ? [a.concept] : []));

/** One assumption as the card shows it: its words, and the concept it points to if that exists. */
export interface AssumptionItem {
  label: string;
  description?: string;
  node?: GraphNode;
}

export function assumptionItem(a: Assumption, byId: ConceptMap): AssumptionItem {
  const node = a.concept ? byId.get(a.concept) : undefined;
  return {
    label: a.label?.trim() || node?.label || a.concept || '',
    ...(a.description?.trim() ? { description: a.description.trim() } : {}),
    ...(node ? { node } : {}),
  };
}

/** What a concept assumes, and the concepts whose assumptions point to it. */
export function assumptionsOf(id: string, index: ConceptIndex): { assumes: AssumptionItem[]; assumedBy: GraphNode[] } {
  const assumes = (index.byId.get(id)?.assumes ?? []).map((a) => assumptionItem(a, index.byId));
  const assumedBy = (index.assumedBy.get(id) ?? []).map((x) => index.byId.get(x)).filter((n): n is GraphNode => Boolean(n));
  return { assumes, assumedBy };
}

/** Generality: 1 (very specific) – 10 (very general). Sets the circle size. */
export const GENERALITY_MAX = 10;
/** Importance: 1 (minor detail) – 10 (landmark), like generality. Sets how far out a concept stays visible. */
export const IMPORTANCE_MAX = 10;

/** 1–10: authored generality, else a degree estimate (learning goals 1). Drives circle size. */
export function effectiveGenerality(node: GraphNode, degree: number): number {
  if (node.generality !== undefined) return node.generality;
  if (node.type === 'learning_goal') return 1;
  return Math.min(GENERALITY_MAX, 1 + Math.round(2 * Math.sqrt(degree)));
}

/**
 * 1–10: authored importance, else a degree estimate (learning goals 1).
 * Drives the zoom level a concept appears at and the size of its name.
 */
export function effectiveImportance(node: GraphNode, degree: number): number {
  if (node.importance !== undefined) return node.importance;
  if (node.type === 'learning_goal') return 1;
  return Math.min(IMPORTANCE_MAX, 1 + Math.round(2 * Math.sqrt(degree)));
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

/** A relation's line on screen: from this width (two specific concepts)… */
const EDGE_MIN_PX = 1;
/** …to this one (a landmark at either end) — the circles' 7–270 range, damped. */
const EDGE_MAX_PX = 4;

/**
 * How a relation stands out: it takes the larger generality (its on-screen
 * width) and the larger importance (its strength, 0–1, which sets its
 * opacity) of the two concepts it joins. `px` is the narrowest the line gets
 * on screen however far out you zoom.
 */
export function edgeWeight(radii: [number, number], importances: [number, number]): { px: number; strength: number } {
  const r = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, ...radii));
  const generality = Math.log(r / MIN_RADIUS) / Math.log(MAX_RADIUS / MIN_RADIUS);
  const importance = (Math.min(IMPORTANCE_MAX, Math.max(1, ...importances)) - 1) / (IMPORTANCE_MAX - 1);
  return { px: EDGE_MIN_PX + (EDGE_MAX_PX - EDGE_MIN_PX) * generality, strength: importance };
}

/** A relation name's size (model px) between two specific concepts. */
export const EDGE_LABEL_FONT = 11;

/**
 * A relation name grows with its line, but less: up to 2.5× for a landmark's
 * relations (the line's generality, 0–1), nudged ±10% by importance. Bigger
 * than that and the names alone force very long lines between big concepts.
 * The layout sizes each relation's room from this (GraphView).
 */
export function edgeLabelSize(px: number, strength: number): number {
  const generality = (px - EDGE_MIN_PX) / (EDGE_MAX_PX - EDGE_MIN_PX);
  const size = EDGE_LABEL_FONT * (1 + 1.5 * generality) * (0.9 + 0.2 * strength);
  return Math.round(10 * Math.max(EDGE_LABEL_FONT, size)) / 10;
}

/**
 * A relation name's size, from the *smaller* of its two concepts (the line
 * itself takes the larger, edgeWeight): a specific concept only shows once
 * you zoom in to it, so its relation's name needn't be overview-sized — and a
 * smaller name lets it sit close to the big concept it hangs off.
 */
export function relationFontSize(radii: [number, number], importances: [number, number]): number {
  const r = Math.min(...radii), i = Math.min(...importances);
  const { px, strength } = edgeWeight([r, r], [i, i]);
  return edgeLabelSize(px, strength);
}

/**
 * From this radius (generality 6 and up) the name is written inside the
 * circle, like a region's name on a map: the concept then claims only the
 * room of its circle, so specific concepts can sit close around it.
 */
export const INSIDE_LABEL_RADIUS = 50;

/**
 * Label size: importance 1–10 → 12…18 px, like a map's city names — and for a
 * big circle, in proportion to it (radius ÷ 3, written inside), so the
 * largest concepts can be read far out.
 */
export const labelSize = (importance: number, radius = 0): number => {
  const base = 12 + ((importance - 1) * 6) / (IMPORTANCE_MAX - 1);
  return radius >= INSIDE_LABEL_RADIUS ? Math.max(base, radius / 3) : base;
};

/** At and above this importance a concept shows on the whole-map overview. */
const OVERVIEW_IMPORTANCE = 8;
/**
 * Every this-many importance points below it doubles how close you have to
 * zoom — so each step down is about 1.5× closer. (The 1–50 scale this replaced
 * had 40 and 8: dividing every value by 5 kept each concept at its depth.)
 */
const POINTS_PER_DOUBLING = 1.6;

/**
 * Map-style level of detail: the zoom, relative to the whole-map overview, at
 * which a concept of this importance appears. Every importance value is its
 * own depth: 8 shows on the overview, 6 at about 2.4× closer, 4 at 5.7×, 2 at
 * 13×, 1 at about 21×; 10 always shows.
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
 * Splits off the fun layer: fluff concepts and every relation touching one.
 * `base` is the map everyone sees; fun mode draws `fluff` on top of it, placed
 * around what it connects to, so turning fun mode on never moves the map.
 */
export function splitFluff(graph: ConceptGraph): { base: ConceptGraph; fluff: ConceptGraph } {
  const fluffIds = new Set(graph.nodes.filter((n) => n.type === 'fluff').map((n) => n.id));
  const touches = (e: GraphEdge) => fluffIds.has(e.source) || fluffIds.has(e.target);
  return {
    base: { ...graph, nodes: graph.nodes.filter((n) => !fluffIds.has(n.id)), edges: graph.edges.filter((e) => !touches(e)) },
    fluff: { ...graph, nodes: graph.nodes.filter((n) => fluffIds.has(n.id)), edges: graph.edges.filter(touches) },
  };
}

/** What a concept with no relations says in fun mode — the first is the classic; each concept keeps its own. */
export const LONELY_LINES = [
  "I'm lonely, please connect me with someone!",
  'No relations yet… want to be my first?',
  "Psst — I'd love a connection.",
];

export function lonelyLine(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return LONELY_LINES[h % LONELY_LINES.length];
}

/**
 * The node plus its first-degree connections in both directions (any
 * relation type) — the click sub-graph.
 */
export function neighborsOf(id: string, index: ConceptIndex): string[] {
  const ids = new Set([id]);
  for (const e of index.incoming.get(id) ?? []) ids.add(e.source);
  for (const e of index.outgoing.get(id) ?? []) ids.add(e.target);
  // The concepts its assumptions point to, and those pointing to it, belong to its sub-view too.
  const { assumes, assumedBy } = assumptionsOf(id, index);
  for (const a of assumes) if (a.node) ids.add(a.node.id);
  for (const n of assumedBy) ids.add(n.id);
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
 * A goal's learning path: the closure over CURRICULUM_EDGE_TYPES, in
 * kahnOrder() — prerequisites first, ties by depth then id.
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
