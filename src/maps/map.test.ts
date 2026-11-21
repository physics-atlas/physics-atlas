import { describe, expect, it } from 'vitest';
import { concepts } from '../data/loadConcepts';
import { applyChanges, changeProblem, itemsOf, mapFromItems } from './items';
import { removeRefChanges } from './api';
import { mapProblems, resolveMap } from './map';
import type { PersonalMap } from './map';

const map = (extra: Partial<PersonalMap> = {}): PersonalMap => ({
  id: 'm',
  title: 'Sample map',
  refs: ['tangent_vector', 'parallel_transport'],
  nodes: [{ id: 'goal', type: 'learning_goal', label: 'Sample goal', attrs: { description: 'Sample.' } }],
  edges: [{ id: 'm_e1', source: 'goal', target: 'parallel_transport', relationship: 'is a learning goal of' }],
  ...extra,
});

describe('a personal map as one graph', () => {
  it('has its own concepts, the atlas concepts it uses as the atlas has them, and its relations', () => {
    const r = resolveMap(map(), concepts);
    expect(r.graph.nodes.map((n) => n.id).sort()).toEqual(['goal', 'parallel_transport', 'tangent_vector']);
    expect(r.graph.nodes.find((n) => n.id === 'tangent_vector')).toBe(concepts.nodes.find((n) => n.id === 'tangent_vector'));
    expect([...r.refIds].sort()).toEqual(['parallel_transport', 'tangent_vector']);
  });

  it('brings the atlas relations between two concepts it uses, and no others', () => {
    const r = resolveMap(map(), concepts);
    const between = concepts.edges.filter((e) => r.refIds.has(e.source) && r.refIds.has(e.target)).map((e) => e.id);
    expect(between.length).toBeGreaterThan(0);
    expect([...r.refEdgeIds].sort()).toEqual(between.sort());
    expect(r.graph.edges.every((e) => r.graph.nodes.some((n) => n.id === e.source) && r.graph.nodes.some((n) => n.id === e.target))).toBe(true);
  });

  it('leaves out a reference the atlas no longer has, with its relations, and names it', () => {
    const m = map({ refs: ['tangent_vector', 'gone_from_the_atlas'], edges: [{ id: 'm_e1', source: 'goal', target: 'gone_from_the_atlas', relationship: 'relates' }] });
    const r = resolveMap(m, concepts);
    expect(r.missingRefs).toEqual(['gone_from_the_atlas']);
    expect(r.graph.edges.some((e) => e.id === 'm_e1')).toBe(false);
  });
});

describe('mapProblems', () => {
  it('accepts a map that fits', () => {
    expect(mapProblems(map(), concepts)).toEqual([]);
  });

  it('refuses an own concept with an atlas id, a relation to nothing, an unknown relationship and a page of a non-concept', () => {
    const problems = mapProblems(
      map({
        nodes: [{ id: 'tangent_vector', type: 'property', label: 'Copy', attrs: { description: 'Sample.' } }],
        edges: [
          { id: 'm_e1', source: 'tangent_vector', target: 'nowhere', relationship: 'relates' },
          { id: 'm_e2', source: 'parallel_transport', target: 'tangent_vector', relationship: 'teleports to' },
        ],
        pages: { nowhere: ['Sample.'] },
      }),
      concepts,
    ).join('\n');
    expect(problems).toMatch(/"tangent_vector" is an atlas concept/);
    expect(problems).toMatch(/points at "nowhere"/);
    expect(problems).toMatch(/unknown relationship "teleports to"/);
    expect(problems).toMatch(/a page for "nowhere"/);
  });
});

describe('a saved map, as items (Phase 2)', () => {
  it('turns into the same map, and back', () => {
    const m = map({ pages: { goal: ['Sample page.'] } });
    const back = mapFromItems(m, itemsOf(m));
    expect(back.refs.sort()).toEqual([...m.refs].sort());
    expect(back.nodes).toEqual(m.nodes);
    expect(back.edges).toEqual(m.edges);
    expect(back.pages).toEqual(m.pages);
  });

  it('applies a save: written whole, or removed', () => {
    const next = applyChanges(map(), [
      { kind: 'ref', id: 'four_velocity', body: {} },
      { kind: 'node', id: 'goal', body: { ...map().nodes[0], label: 'Sample goal, renamed' } },
      { kind: 'ref', id: 'tangent_vector', body: null },
    ]);
    expect(next.refs).toEqual(['four_velocity', 'parallel_transport']);
    expect(next.nodes[0].label).toBe('Sample goal, renamed');
  });

  it('takes an atlas concept out with the map’s own relations to it', () => {
    const changes = removeRefChanges(map(), 'parallel_transport');
    expect(changes).toEqual([
      { kind: 'ref', id: 'parallel_transport', body: null },
      { kind: 'edge', id: 'm_e1', body: null },
    ]);
    expect(mapProblems(applyChanges(map(), changes), concepts)).toEqual([]);
  });

  it('refuses a change it can’t store', () => {
    expect(changeProblem({ kind: 'ref', id: 'four_velocity', body: {} })).toBeNull();
    expect(changeProblem({ kind: 'topic', id: 'x', body: {} })).toMatch(/unknown kind/);
    expect(changeProblem({ kind: 'node', id: 'a b', body: {} })).toMatch(/item id/);
    expect(changeProblem({ kind: 'node', id: 'a', body: { id: 'b' } })).toMatch(/id differs/);
    expect(changeProblem({ kind: 'page', id: 'a', body: 'text' })).toMatch(/list of depths/);
  });
});
