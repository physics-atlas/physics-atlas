import { describe, expect, it } from 'vitest';
import { concepts } from '../data/loadConcepts';
import type { ConceptGraph, GraphNode } from '../data/types';
import {
  badgeText,
  evidenceHref,
  mergedGraph,
  nodeChanges,
  overlayFor,
  proposalByNode,
  proposalProblems,
  proposalsAbout,
} from './proposals';
import { parseInline, parseRichText } from './richText';
import { FixtureStore, fixtureProposals } from './store';
import type { Proposal } from './types';

const confirmed: ConceptGraph = {
  version: 1,
  nodes: [
    { id: 'a', type: 'property', label: 'A', attrs: { description: 'a' } },
    { id: 'b', type: 'property', label: 'B', attrs: { description: 'b' } },
  ],
  edges: [{ id: 'e1', source: 'a', target: 'b', relationship: 'relates' }],
};

const newNode = (id: string, extra: Partial<GraphNode> = {}): GraphNode =>
  ({ id, type: 'process', label: id.toUpperCase(), attrs: { description: id }, ...extra }) as GraphNode;

const proposal = (extra: Partial<Proposal> = {}): Proposal => ({
  id: 'p1',
  title: 'Add N',
  state: 'open',
  author: { name: 'Tester' },
  createdAt: '2026-10-01T00:00:00Z',
  claim: 'N relates to A.',
  evidence: [],
  nodes: [newNode('n')],
  edges: [{ id: 'p1_e1', source: 'n', target: 'a', relationship: 'relates' }],
  tally: { verify: 2, dispute: 1, clarify: 0 },
  ...extra,
});

describe('proposalProblems', () => {
  it('accepts a proposal that fits the confirmed graph', () => {
    expect(proposalProblems(proposal(), confirmed)).toEqual([]);
  });

  it('rejects an id that is already a confirmed concept or relation', () => {
    const p = proposal({ nodes: [newNode('a')], edges: [{ id: 'e1', source: 'a', target: 'b', relationship: 'relates' }] });
    const problems = proposalProblems(p, confirmed).join('\n');
    expect(problems).toMatch(/concept id "a" is taken/);
    expect(problems).toMatch(/relation id "e1" is taken/);
  });

  it('rejects a relation to a concept that is neither confirmed nor proposed', () => {
    const p = proposal({ edges: [{ id: 'p1_e1', source: 'n', target: 'ghost', relationship: 'relates' }] });
    expect(proposalProblems(p, confirmed).join()).toMatch(/points at "ghost"/);
  });

  it('rejects unknown types and relationships', () => {
    const p = proposal({
      nodes: [newNode('n', { type: 'gizmo' as GraphNode['type'] })],
      edges: [{ id: 'p1_e1', source: 'n', target: 'a', relationship: 'teleports to' }],
    });
    const problems = proposalProblems(p, confirmed).join('\n');
    expect(problems).toMatch(/unknown type "gizmo"/);
    expect(problems).toMatch(/unknown relationship "teleports to"/);
  });

  it('requires a dispute summary on a contested proposal', () => {
    expect(proposalProblems(proposal({ state: 'contested' }), confirmed).join()).toMatch(/dispute summary/);
    expect(proposalProblems(proposal({ state: 'contested', dispute: { summary: 'Why' } }), confirmed)).toEqual([]);
  });

  it('checks evidence references', () => {
    const p = proposal({
      evidence: [
        { kind: 'arxiv', ref: '2101.01234' },
        { kind: 'arxiv', ref: 'not-an-id' },
        { kind: 'doi', ref: '10.1103/PhysRevD.1.1' },
        { kind: 'url', ref: 'ftp://x' },
      ],
    });
    const problems = proposalProblems(p, confirmed);
    expect(problems).toHaveLength(2);
    expect(problems.join()).toMatch(/"not-an-id" is not a valid arxiv/);
    expect(problems.join()).toMatch(/"ftp:\/\/x" is not a valid url/);
  });

  it('rejects a proposal that proposes nothing', () => {
    expect(proposalProblems(proposal({ nodes: [], edges: [] }), confirmed).join()).toMatch(/proposes nothing/);
  });
});

describe('overlay and merging', () => {
  it('marks every proposed concept and relation with its status and badge', () => {
    const overlay = overlayFor([proposal(), proposal({ id: 'p2', state: 'contested', nodes: [newNode('m')], edges: [] })]);
    expect(overlay.nodes.map((n) => [n.node.id, n.status, n.badge])).toEqual([
      ['n', 'open', 'Proposed · ✓2 ✗1 ?0'],
      ['m', 'contested', '⚑ Contested · ✓2 ✗1 ?0'],
    ]);
    expect(overlay.edges.map((e) => e.proposalId)).toEqual(['p1']);
  });

  it('merges proposals into one graph without touching the confirmed one', () => {
    const merged = mergedGraph(confirmed, [proposal()]);
    expect(merged.nodes.map((n) => n.id)).toEqual(['a', 'b', 'n']);
    expect(merged.edges).toHaveLength(2);
    expect(confirmed.nodes).toHaveLength(2);
  });

  it('finds the proposal a proposed concept belongs to', () => {
    expect(proposalByNode([proposal()]).get('n')?.id).toBe('p1');
  });

  it('says the status in words', () => {
    expect(badgeText(proposal())).toMatch(/^Proposed/);
    expect(badgeText(proposal({ state: 'contested' }))).toMatch(/^⚑ Contested/);
  });

  it('links evidence to its source', () => {
    expect(evidenceHref({ kind: 'arxiv', ref: '2101.01234' })).toBe('https://arxiv.org/abs/2101.01234');
    expect(evidenceHref({ kind: 'doi', ref: '10.1/x' })).toBe('https://doi.org/10.1/x');
    expect(evidenceHref({ kind: 'equation', ref: 'E = mc^2' })).toBeNull();
  });
});

describe('the sample fixtures', () => {
  // Every file as written — the store would silently leave a broken one out.
  it.each(fixtureProposals().map((p) => [p.id, p] as const))('%s fits the real confirmed graph', (_id, p) => {
    expect(proposalProblems(p, concepts, fixtureProposals())).toEqual([]);
  });

  it('include the five samples the test guide walks through', async () => {
    const ids = (await new FixtureStore(concepts).list()).map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'sample-jeans-scale',
        'sample-nonlinear-growth',
        'sample-ultralight-bound',
        'sample-jeans-mass',
        'sample-edit-vlasov',
      ]),
    );
  });

  it('keep a dependent’s relation while what it depends on is open, and drop it once that’s gone', async () => {
    const all = fixtureProposals();
    const withDep = await new FixtureStore(concepts, all).list();
    expect(withDep.find((p) => p.id === 'sample-jeans-mass')?.edges).toHaveLength(2);
    const rejected = await new FixtureStore(concepts, all.filter((p) => p.id !== 'sample-jeans-scale')).list();
    const mass = rejected.find((p) => p.id === 'sample-jeans-mass')!;
    expect(mass.edges.map((e) => e.target)).toEqual(['structure_formation']);
    expect(mass.dropped).toEqual([{ edge: expect.objectContaining({ id: 's4_e1' }), dependency: 'sample-jeans-scale' }]);
  });

  it('draw an edit on the confirmed concept, with its removals', async () => {
    const list = await new FixtureStore(concepts).list();
    const overlay = overlayFor(list);
    expect(overlay.edits).toEqual([expect.objectContaining({ id: 'vlasov_equation', proposalId: 'sample-edit-vlasov' })]);
    expect(overlay.edits[0].badge).toBe('✎ Edit proposed · ✓1 ✗0 ?0');
    expect(overlay.removals.map((m) => m.id)).toEqual(['e62']);
    expect(proposalsAbout('vlasov_equation', list, concepts.edges).map((p) => p.id)).toEqual(['sample-edit-vlasov']);
    const edit = list.find((p) => p.id === 'sample-edit-vlasov')!;
    expect(nodeChanges(concepts.nodes.find((n) => n.id === 'vlasov_equation')!, edit.edits![0])).toEqual([
      { field: 'Generality', before: '4', after: '6' },
    ]);
  });

  it('come out of the store oldest first, covering both states', async () => {
    const list = await new FixtureStore(concepts).list();
    expect(list.map((p) => p.createdAt)).toEqual([...list.map((p) => p.createdAt)].sort());
    expect(new Set(list.map((p) => p.state))).toEqual(new Set(['open', 'contested']));
  });

  it('leaves a proposal out of the store when it does not fit', async () => {
    const broken = proposal({ id: 'broken', edges: [{ id: 'b_e1', source: 'n', target: 'nothing_here', relationship: 'relates' }] });
    const store = new FixtureStore(confirmed, [proposal(), broken]);
    const warn = console.warn;
    console.warn = () => {};
    try {
      expect((await store.list()).map((p) => p.id)).toEqual(['p1']);
    } finally {
      console.warn = warn;
    }
  });
});

describe('parseRichText', () => {
  it('splits paragraphs on blank lines and joins soft line breaks', () => {
    const blocks = parseRichText('one\ntwo\n\nthree');
    expect(blocks).toEqual([
      { kind: 'paragraph', inlines: [{ kind: 'text', value: 'one two' }] },
      { kind: 'paragraph', inlines: [{ kind: 'text', value: 'three' }] },
    ]);
  });

  it('reads a paragraph made of $$…$$ as display math', () => {
    expect(parseRichText('$$ E = mc^2 $$')).toEqual([{ kind: 'math', tex: 'E = mc^2' }]);
  });

  it('reads inline math, emphasis and code', () => {
    expect(parseInline('Mass $m > 10^{-22}$ is **strong**, *soft* and `code`.')).toEqual([
      { kind: 'text', value: 'Mass ' },
      { kind: 'math', value: 'm > 10^{-22}' },
      { kind: 'text', value: ' is ' },
      { kind: 'strong', value: 'strong' },
      { kind: 'text', value: ', ' },
      { kind: 'em', value: 'soft' },
      { kind: 'text', value: ' and ' },
      { kind: 'code', value: 'code' },
      { kind: 'text', value: '.' },
    ]);
  });

  it('keeps an escaped dollar as text', () => {
    expect(parseInline('costs \\$5 and $x$')).toEqual([
      { kind: 'text', value: 'costs $5 and ' },
      { kind: 'math', value: 'x' },
    ]);
  });

  it('leaves unmatched markers as plain text', () => {
    expect(parseInline('a * b and $ alone')).toEqual([{ kind: 'text', value: 'a * b and $ alone' }]);
  });
});
