import type { ConceptGraph } from '../data/types';
import type { MapChange } from './items';

// Picking several concepts from the atlas for a personal map (Decision 58). A pick
// is connected when relations (the atlas's, and the map's own) lead from it to the
// map, through the map and the other picks. A pick that isn't would float alone
// on the map: it's marked while picking, the atlas concepts that would link it are
// shown, and on confirming each one is added with them, added alone, or left out.

/** The most in-between concepts offered to link one pick; further than that, none are. */
export const LINK_STEPS = 3;

export type PickChoice = 'link' | 'alone' | 'leave';

export interface PickReport {
  /** Picks no relation leads from to the map (through the map and the other picks), in the order picked */
  unconnected: string[];
  /** For each unconnected pick: the fewest atlas concepts that would link it, from the pick towards the map (empty: none within LINK_STEPS) */
  linking: Map<string, string[]>;
  /** Every concept some unconnected pick's link goes through */
  linkIds: Set<string>;
}

function neighbours(graphs: ConceptGraph[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!out.has(a)) out.set(a, new Set());
    out.get(a)!.add(b);
  };
  for (const g of graphs)
    for (const e of g.edges) {
      add(e.source, e.target);
      add(e.target, e.source);
    }
  return out;
}

/** What a set of picks would leave unconnected in the map, and what would link it. */
export function pickReport(atlas: ConceptGraph, map: ConceptGraph, picked: string[]): PickReport {
  const adj = neighbours([atlas, map]);
  const inMap = new Set(map.nodes.map((n) => n.id));
  const members = new Set([...inMap, ...picked]);
  const spread = (start: Iterable<string>) => {
    const seen = new Set(start);
    const queue = [...seen];
    while (queue.length) {
      const id = queue.shift()!;
      for (const m of adj.get(id) ?? [])
        if (members.has(m) && !seen.has(m)) {
          seen.add(m);
          queue.push(m);
        }
    }
    return seen;
  };
  // An empty map: the picks hang together around the largest group of them (ties: the first picked).
  let reached = new Set<string>();
  if (inMap.size) reached = spread(inMap);
  else
    for (const id of picked) {
      if (reached.has(id)) continue;
      const group = spread([id]);
      if (group.size > reached.size) reached = group;
    }
  const unconnected = picked.filter((id) => !reached.has(id));

  const fluff = new Set(atlas.nodes.filter((n) => n.type === 'fluff').map((n) => n.id));
  const linking = new Map<string, string[]>();
  for (const id of unconnected) {
    const from = new Map<string, string>([[id, id]]);
    const queue: [string, number][] = [[id, 0]];
    let end: string | null = null;
    while (queue.length && !end) {
      const [at, steps] = queue.shift()!;
      for (const m of adj.get(at) ?? []) {
        if (from.has(m) || fluff.has(m)) continue;
        from.set(m, at);
        if (reached.has(m)) {
          end = m;
          break;
        }
        const between = steps + (members.has(m) ? 0 : 1);
        if (between <= LINK_STEPS) queue.push([m, between]);
      }
    }
    const path: string[] = [];
    for (let at = end ? from.get(end)! : id; at !== id; at = from.get(at)!) if (!members.has(at)) path.unshift(at);
    linking.set(id, end && path.length <= LINK_STEPS ? path : []);
  }
  return { unconnected, linking, linkIds: new Set([...linking.values()].flat()) };
}

/**
 * The save that adds the picks: one reference each, with the linking concepts of
 * those to be linked, less those left out — each concept once, none already in the map.
 */
export function pickChanges(map: ConceptGraph, picked: string[], report: PickReport, choices: Record<string, PickChoice>): MapChange[] {
  const inMap = new Set(map.nodes.map((n) => n.id));
  const out = new Set<string>();
  for (const id of picked) {
    const choice = report.unconnected.includes(id) ? (choices[id] ?? defaultChoice(report, id)) : 'alone';
    if (choice === 'leave') continue;
    if (choice === 'link') for (const l of report.linking.get(id) ?? []) out.add(l);
    out.add(id);
  }
  return [...out].filter((id) => !inMap.has(id)).map((id) => ({ kind: 'ref' as const, id, body: {} }));
}

/** Linked when something links it, otherwise added alone — shown, and changeable, before saving. */
export const defaultChoice = (report: PickReport, id: string): PickChoice =>
  (report.linking.get(id)?.length ?? 0) > 0 ? 'link' : 'alone';
