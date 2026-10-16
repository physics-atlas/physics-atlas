import { describe, expect, it } from 'vitest';
import { concepts } from '../data/loadConcepts';
import { buildConceptIndex } from '../graph/concepts';
import {
  NEW_CONCEPT,
  conceptId,
  draftEdges,
  draftLayer,
  draftNode,
  draftProblems,
  draftProposal,
  exportFiles,
  hasContent,
  newDraft,
  parseDraft,
  proposalFile,
  pullRequestText,
  slugify,
} from './draft';
import type { Draft } from './draft';
import { proposalProblems } from './proposals';

const fixed = () => 0.5;
const at = new Date('2026-10-15T12:00:00Z');

/** A complete draft: Jeans scale as a condition of Structure Formation (sample text). */
const jeans = (): Draft => ({
  ...newDraft(fixed, at),
  label: 'Jeans scale',
  type: 'property',
  description: 'Sample: the length scale above which gravity overcomes pressure support.',
  domains: ['Cosmology'],
  claim: 'Sample claim with $\\lambda_J$.',
  evidence: [{ kind: 'arxiv', ref: '2101.01234', note: 'Sample' }],
  author: 'Sample author',
  relations: [
    { key: 'r1', source: NEW_CONCEPT, target: 'structure_formation', relationship: 'is a condition of', conditions: [] },
    {
      key: 'r2',
      source: 'zeldovich_approximation',
      target: NEW_CONCEPT,
      relationship: 'relates',
      conditions: [{ label: ' linear growth ', description: '' }, { label: '  ' }],
    },
  ],
});

describe('ids', () => {
  it('slugifies labels to snake_case ASCII', () => {
    expect(slugify('Schrödinger–Poisson eq. (λ)')).toBe('schrodinger_poisson_eq');
    expect(slugify('  ')).toBe('concept');
    expect(slugify('a'.repeat(30) + ' ' + 'b'.repeat(30))).toBe('a'.repeat(30));
  });
  it('keeps the random suffix when the label changes', () => {
    const d = jeans();
    expect(conceptId(d)).toMatch(/^jeans_scale_[a-z0-9]{4}$/);
    expect(conceptId({ ...d, label: 'Jeans length' })).toBe(`jeans_length_${d.suffix}`);
  });
  it('gives different drafts different suffixes', () => {
    expect(newDraft(() => 0.1).suffix).not.toBe(newDraft(() => 0.9).suffix);
  });
});

describe('what a draft becomes', () => {
  it('a node with only content fields, and relations pointing at its id', () => {
    const d = jeans();
    const id = conceptId(d);
    expect(draftNode(d)).toEqual({
      id,
      label: 'Jeans scale',
      type: 'property',
      attrs: { description: d.description, domain: 'Cosmology' },
    });
    const [e1, e2] = draftEdges(d);
    expect(e1).toEqual({ id: `${id}_e1`, source: id, target: 'structure_formation', relationship: 'is a condition of' });
    expect(e2.target).toBe(id);
    expect(e2.conditions).toEqual([{ label: 'linear growth' }]);
  });
  it('joins several domains the vocabulary way', () => {
    expect(draftNode({ ...jeans(), domains: ['Cosmology', 'Astrophysics'] }).attrs).toMatchObject({
      domain: 'Cosmology / Astrophysics',
    });
  });
  it('an equation carries the equation and empty lists', () => {
    const node = draftNode({ ...jeans(), type: 'equation', equation: ' a = b ' });
    expect(node.attrs).toMatchObject({ equation: 'a = b', variables: [], conditions: [], representations: [] });
  });
  it('the map layer keeps the placeholder id and a visible name', () => {
    const layer = draftLayer({ ...jeans(), label: '' });
    expect(layer.node.id).toBe(NEW_CONCEPT);
    expect(layer.node.label).toBe('New concept');
    expect(layer.edges[0].source).toBe(NEW_CONCEPT);
  });
  it('a proposal the proposed layer accepts', () => {
    expect(proposalProblems(draftProposal(jeans()), concepts)).toEqual([]);
  });
});

describe('draftProblems', () => {
  it('lists every missing field, in words', () => {
    const fields = draftProblems(newDraft(fixed, at), concepts).map((p) => p.field);
    expect(fields).toEqual(['label', 'type', 'description', 'claim', 'relations']);
  });
  it('is empty for a complete draft', () => {
    expect(draftProblems(jeans(), concepts)).toEqual([]);
  });
  it('points at the evidence row that is malformed', () => {
    const d = { ...jeans(), evidence: [jeans().evidence[0], { kind: 'doi' as const, ref: 'not-a-doi' }] };
    expect(draftProblems(d, concepts)).toEqual([
      { field: 'evidence', index: 1, message: "Evidence 2 isn't a valid DOI." },
    ]);
  });
  it('asks for the equation of an equation', () => {
    expect(draftProblems({ ...jeans(), type: 'equation' }, concepts).map((p) => p.field)).toEqual(['equation']);
  });
});

describe('export', () => {
  const files = exportFiles(jeans());

  it('one node file and one file per relation, in the content layout', () => {
    const id = conceptId(jeans());
    expect(files.map((f) => f.path)).toEqual([
      `content/concepts/nodes/${id}.json`,
      `content/concepts/edges/${id}_e1.json`,
      `content/concepts/edges/${id}_e2.json`,
    ]);
  });
  it('never carries a position', () => {
    for (const f of [...files, proposalFile(jeans())])
      expect(f.content).not.toMatch(/"(x|y|position|positions|renderedPosition)"\s*:/);
  });
  it('the proposal file round-trips into a proposal', () => {
    const f = proposalFile(jeans());
    expect(f.path).toMatch(/^content\/proposals-fixtures\/proposal-jeans-scale-[a-z0-9]{4}\.json$/);
    expect(proposalProblems(JSON.parse(f.content), concepts)).toEqual([]);
  });

});

describe('pullRequestText', () => {
  it('has the title, claim, the relations as sentences, evidence links and the files', () => {
    const text = pullRequestText(jeans(), buildConceptIndex(concepts).byId);
    expect(text).toContain('# Add Jeans scale');
    expect(text).toContain('Sample claim with $\\lambda_J$.');
    expect(text).toContain('- Jeans scale is a condition of Structure Formation.');
    expect(text).toContain("- Zel'dovich approximation relates to Jeans scale under the assumption of linear growth.");
    expect(text).toContain('[arXiv:2101.01234](https://arxiv.org/abs/2101.01234) — Sample');
    expect(text).toContain(`content/concepts/nodes/${conceptId(jeans())}.json`);
    expect(text).toContain('Proposed by Sample author.');
  });
});

describe('storage', () => {
  it('reads back what it wrote', () => {
    const d = jeans();
    expect(parseDraft(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it('rejects anything that is not a draft', () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft({ ...jeans(), version: 2 })).toBeNull();
    expect(parseDraft({ ...jeans(), type: 'resource' })).toBeNull();
    expect(parseDraft({ ...jeans(), relations: [{ key: 'r1' }] })).toBeNull();
    expect(parseDraft({ ...jeans(), evidence: [{ kind: 'tweet', ref: 'x' }] })).toBeNull();
  });
  it('knows an empty draft from a started one', () => {
    expect(hasContent(newDraft())).toBe(false);
    expect(hasContent({ ...newDraft(), label: 'x' })).toBe(true);
  });
});
