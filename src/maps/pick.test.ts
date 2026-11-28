import { describe, expect, it } from 'vitest';
import type { ConceptGraph, GraphEdge, GraphNode } from '../data/types';
import { LINK_STEPS, pickChanges, pickReport } from './pick';

const node = (id: string, type = 'property'): GraphNode => ({ id, label: `Sample ${id}`, type, attrs: { description: 'Sample.' } }) as GraphNode;
const edge = (source: string, target: string): GraphEdge => ({ id: `${source}-${target}`, source, target, relationship: 'requires' });
const graph = (ids: string[], edges: [string, string][] = []): ConceptGraph => ({
  version: 1,
  nodes: ids.map((id) => node(id)),
  edges: edges.map(([a, b]) => edge(a, b)),
});

// a — b — c — d — e — f — g, and h alone; x only through fluff.
const atlas: ConceptGraph = {
  version: 1,
  nodes: [...'abcdefgh'.split('').map((id) => node(id)), node('x'), node('fun', 'fluff')],
  edges: [...['ab', 'bc', 'cd', 'de', 'ef', 'fg'].map((p) => edge(p[0], p[1])), edge('a', 'fun'), edge('fun', 'x')],
};

describe('picking several concepts from the atlas', () => {
  it('counts a pick connected through the map or another pick', () => {
    const map = graph(['a']);
    const r = pickReport(atlas, map, ['b', 'c']);
    expect(r.unconnected).toEqual([]);
  });

  it('names an unconnected pick and the fewest concepts that would link it', () => {
    const r = pickReport(atlas, graph(['a']), ['d']);
    expect(r.unconnected).toEqual(['d']);
    expect(r.linking.get('d')).toEqual(['c', 'b']);
    expect([...r.linkIds].sort()).toEqual(['b', 'c']);
  });

  it('links through another pick without offering it again', () => {
    const r = pickReport(atlas, graph(['a']), ['e', 'c']);
    expect(r.unconnected).toEqual(['e', 'c']);
    expect(r.linking.get('c')).toEqual(['b']);
    expect(r.linking.get('e')).toEqual(['d', 'b']);
  });

  it('offers nothing when the link is too long, or none exists, or only through fluff', () => {
    const r = pickReport(atlas, graph(['a']), ['g', 'h', 'x']);
    expect(LINK_STEPS).toBe(3);
    expect(r.linking.get('g')).toEqual([]);
    expect(r.linking.get('h')).toEqual([]);
    expect(r.linking.get('x')).toEqual([]);
  });

  it('uses the map’s own relations too', () => {
    const map: ConceptGraph = { version: 1, nodes: [node('a'), node('own')], edges: [edge('own', 'h')] };
    expect(pickReport(atlas, map, ['h']).unconnected).toEqual([]);
  });

  it('in an empty map, hangs the picks around their largest group', () => {
    const r = pickReport(atlas, graph([]), ['h', 'a', 'b']);
    expect(r.unconnected).toEqual(['h']);
    expect(pickReport(atlas, graph([]), ['h']).unconnected).toEqual([]);
  });

  it('saves the picks as chosen: linked, alone or left out, each once', () => {
    const map = graph(['a']);
    const picked = ['d', 'h', 'c', 'g'];
    const r = pickReport(atlas, map, picked);
    const ids = (choices: Parameters<typeof pickChanges>[3]) => pickChanges(map, picked, r, choices).map((c) => c.id).sort();
    // g links through the picks d and c, then f, e and b.
    expect(ids({})).toEqual(['b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(ids({ d: 'alone', h: 'leave', c: 'alone', g: 'alone' })).toEqual(['c', 'd', 'g']);
    expect(pickChanges(map, picked, r, {}).every((c) => c.kind === 'ref' && JSON.stringify(c.body) === '{}')).toBe(true);
  });
});
