import raw from './concepts.json';
import type { ConceptGraph } from './types';

/**
 * The compiled graph, minus any relation whose concept doesn't exist (the
 * validator reports those as errors; e.g. a merged proposal pointing at one
 * not merged yet). One such relation would otherwise stop the map drawing.
 */
function withoutDangling(graph: ConceptGraph): ConceptGraph {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const dangling = graph.edges.filter((e) => !ids.has(e.source) || !ids.has(e.target));
  if (dangling.length === 0) return graph;
  console.warn(`Skipped relations to concepts that don't exist: ${dangling.map((e) => e.id).join(', ')}`);
  return { ...graph, edges: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
}

export const concepts = withoutDangling(raw as ConceptGraph);
