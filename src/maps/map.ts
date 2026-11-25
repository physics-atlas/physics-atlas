import type { ConceptGraph, GraphEdge, GraphNode } from '../data/types';
import { EDGE_SENTENCE_TEMPLATES, NODE_TYPE_LABELS } from '../data/types';
import { normalizeRelationship } from '../graph/concepts';
import { tagProblems } from '../data/tags';

/**
 * A personal map (Decision 50, .claude/plans/epic-personal-maps.md): concepts,
 * relations and pages in the atlas's own format, plus concepts of the atlas it
 * uses by reference. The same shape the database's map_items hold, so a map
 * from a sample file (Phase 1) and one from the server (Phase 2) are alike.
 */
export interface PersonalMap {
  /** Random, in the address */
  id: string;
  title: string;
  /** What the map is for, in a sentence or two (Markdown + LaTeX) */
  description?: string;
  /** Its own concepts */
  nodes: GraphNode[];
  /** Its own relations — between its concepts, the atlas concepts it uses, or both */
  edges: GraphEdge[];
  /** Atlas concepts it uses, by id: shown as they are on the atlas, kept current with it */
  refs: string[];
  /** Its own concepts' pages, depth 1 first (Markdown + LaTeX) */
  pages?: Record<string, string[]>;
  /** What the course sets out to reach: named sets of the map's learning goals, in order */
  courseGoals?: CourseGoal[];
}

/**
 * A course-level goal: only a name, and the map's learning goals (topic-level
 * goals, its own or the atlas's) that make it up. Not a concept: it isn't on the
 * map itself, and the atlas never has one.
 */
export interface CourseGoal {
  /** Random, fixed */
  id: string;
  name: string;
  /** Learning goals' concept ids, in the order the course takes them */
  goals: string[];
  /** Its place among the map's course goals (smallest first) */
  position: number;
}

export const COURSE_GOAL_LIMITS = { name: 120, goals: 200, perMap: 100 };

/**
 * A learning goal someone has completed in a map, as kept in their own browser
 * (lib/useProgress.ts) — never sent anywhere. Per map: the same atlas goal in two
 * courses is two goals to complete.
 */
export const completedPrefix = (mapId: string) => `map:${mapId}:`;
export const completedKey = (mapId: string, conceptId: string) => completedPrefix(mapId) + conceptId;

/** A course goal as shown: its learning goals the map has now (in order), and the ones it lost. */
export function courseGoalTopics(goal: CourseGoal, graph: ConceptGraph): { topics: GraphNode[]; lost: string[] } {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const topics: GraphNode[] = [];
  const lost: string[] = [];
  for (const id of goal.goals) {
    const n = byId.get(id);
    if (n?.type === 'learning_goal') topics.push(n);
    else lost.push(id);
  }
  return { topics, lost };
}

/** A map ready to show: one graph, and which of its concepts come from the atlas. */
export interface ResolvedMap {
  map: PersonalMap;
  graph: ConceptGraph;
  /** Concepts used from the atlas (by reference) */
  refIds: Set<string>;
  /** The atlas's own relations between two concepts the map uses: they come along */
  refEdgeIds: Set<string>;
  /** References to concepts no longer on the atlas — left out, named here */
  missingRefs: string[];
}

/**
 * The map as one graph: its own concepts, the atlas concepts it uses (as the
 * atlas has them now), the atlas's relations between those, and its own relations. A reference the atlas no longer
 * has is left out, with any relation to it; it's listed in missingRefs.
 */
export function resolveMap(map: PersonalMap, atlas: ConceptGraph): ResolvedMap {
  const atlasById = new Map(atlas.nodes.map((n) => [n.id, n]));
  const refIds = new Set(map.refs.filter((id) => atlasById.has(id)));
  const missingRefs = map.refs.filter((id) => !atlasById.has(id));
  const nodes = [...map.nodes, ...[...refIds].map((id) => atlasById.get(id)!)];
  const present = new Set(nodes.map((n) => n.id));
  const atlasEdges = atlas.edges.filter((e) => refIds.has(e.source) && refIds.has(e.target));
  const own = map.edges.filter((e) => present.has(e.source) && present.has(e.target));
  return {
    map,
    graph: { version: atlas.version, nodes, edges: [...atlasEdges, ...own] },
    refIds,
    refEdgeIds: new Set(atlasEdges.map((e) => e.id)),
    missingRefs,
  };
}

const SNAKE = /^[a-z0-9]+(_[a-z0-9]+)*$/;

/**
 * What stops a map from being shown as written — empty when it's fine. A map
 * whose reference the atlas has since lost is still fine (resolveMap drops it).
 */
export function mapProblems(map: PersonalMap, atlas: ConceptGraph): string[] {
  const out: string[] = [];
  const where = `map "${map.id}"`;
  if (!map.title?.trim()) out.push(`${where}: no title`);
  const atlasIds = new Set(atlas.nodes.map((n) => n.id));
  const own = new Set<string>();
  for (const n of map.nodes) {
    if (!SNAKE.test(n.id)) out.push(`${where}: concept id "${n.id}" must be snake_case`);
    if (own.has(n.id)) out.push(`${where}: concept id "${n.id}" is used twice`);
    if (atlasIds.has(n.id)) out.push(`${where}: concept id "${n.id}" is an atlas concept — use it by reference instead`);
    if (!(n.type in NODE_TYPE_LABELS)) out.push(`${where}: concept "${n.id}" has an unknown type "${n.type}"`);
    if (!n.label?.trim()) out.push(`${where}: concept "${n.id}" has no name`);
    for (const message of tagProblems(n.tags)) out.push(`${where}: concept "${n.id}" ${message}`);
    own.add(n.id);
  }
  const refs = new Set(map.refs);
  for (const id of map.refs) if (own.has(id)) out.push(`${where}: "${id}" is both its own concept and a reference`);
  const atlasEdgeIds = new Set(atlas.edges.map((e) => e.id));
  const edgeIds = new Set<string>();
  for (const e of map.edges) {
    if (edgeIds.has(e.id)) out.push(`${where}: relation id "${e.id}" is used twice`);
    edgeIds.add(e.id);
    if (atlasEdgeIds.has(e.id)) out.push(`${where}: relation id "${e.id}" is an atlas relation's`);
    for (const end of [e.source, e.target])
      if (!own.has(end) && !refs.has(end)) out.push(`${where}: relation "${e.id}" points at "${end}", which isn't in the map`);
    if (!normalizeRelationship(e.relationship) && !(e.relationship in EDGE_SENTENCE_TEMPLATES))
      out.push(`${where}: relation "${e.id}" has an unknown relationship "${e.relationship}"`);
  }
  const goals = map.courseGoals ?? [];
  if (goals.length > COURSE_GOAL_LIMITS.perMap) out.push(`${where}: more than ${COURSE_GOAL_LIMITS.perMap} course goals`);
  for (const g of goals) {
    if (!g.name?.trim() || g.name.length > COURSE_GOAL_LIMITS.name) out.push(`${where}: course goal "${g.id}" needs a name of at most ${COURSE_GOAL_LIMITS.name} characters`);
    if (g.goals.length > COURSE_GOAL_LIMITS.goals) out.push(`${where}: course goal "${g.name}" has more than ${COURSE_GOAL_LIMITS.goals} learning goals`);
    if (new Set(g.goals).size !== g.goals.length) out.push(`${where}: course goal "${g.name}" lists a learning goal twice`);
  }
  for (const id of Object.keys(map.pages ?? {})) {
    if (!own.has(id)) out.push(`${where}: a page for "${id}", which isn't one of its own concepts`);
    if ((map.pages![id] ?? []).some((d) => !d.trim())) out.push(`${where}: the page for "${id}" has an empty depth`);
  }
  return out;
}
