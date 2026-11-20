import { describe, expect, it } from 'vitest';
import { concepts } from '../data/loadConcepts';
import { pageMathProblems } from '../lib/pageMaths';
import { parsePage } from '../lib/pageText';
import { SAMPLE_MAPS, sampleMap } from './fixtures';
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

describe('the sample maps', () => {
  it.each(SAMPLE_MAPS.map((m) => [m.id, m] as const))('%s fits the atlas, uses only atlas concepts that exist, and its pages show', (_id, m) => {
    expect(mapProblems(m, concepts)).toEqual([]);
    expect(resolveMap(m, concepts).missingRefs).toEqual([]);
    for (const depths of Object.values(m.pages ?? {}))
      for (const d of depths) {
        expect(parsePage(d).problems).toEqual([]);
        expect(pageMathProblems(d)).toEqual([]);
      }
  });

  it('include the sample course map, every own text marked as a sample', () => {
    const m = sampleMap('sample-course')!;
    expect(m.title).toMatch(/^Sample/);
    for (const n of m.nodes) expect('description' in n.attrs ? n.attrs.description : '').toMatch(/^Sample/);
  });
});
