import { describe, expect, it } from 'vitest';
import { concepts } from '../data/loadConcepts';
import {
  NEW_CONCEPT,
  afterSubmission,
  conceptId,
  draftDependencies,
  draftEdges,
  draftNode,
  draftProblems,
  draftProposal,
  draftRef,
  draftShape,
  exportFiles,
  hasContent,
  newDraft,
  newEditDraft,
  parseDraft,
  proposalFile,
  proposalId,
  pullRequestText,
  removedFiles,
  slugify,
  withoutDraft,
} from './draft';
import type { Draft, DraftContext } from './draft';
import { proposalProblems, resolveDependencies } from './proposals';
import { fixtureProposals } from './store';

const fixed = () => 0.5;
const at = new Date('2026-10-15T12:00:00Z');
const alone = (...drafts: Draft[]): DraftContext => ({ confirmed: concepts, drafts, proposals: [] });

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
    { key: 'r1', source: NEW_CONCEPT, target: 'structure_formation', relationship: 'is a condition of' },
    {
      key: 'r2',
      source: 'zeldovich_approximation',
      target: NEW_CONCEPT,
      relationship: 'relates',
      description: ' Growth stays linear while $\\delta \\ll 1$. ',
      derivation: '  ',
    },
  ],
});

/** A second draft that builds on the first: it relates to Jeans scale before that's accepted. */
const builds = (on: Draft): Draft => ({
  ...newDraft(() => 0.25, at),
  label: 'Jeans mass',
  type: 'property',
  description: 'Sample: the mass inside a Jeans length.',
  relations: [{ key: 'r1', source: NEW_CONCEPT, target: draftRef(on.suffix), relationship: 'depends on' }],
});

const vlasov = () => concepts.nodes.find((n) => n.id === 'vlasov_equation')!;

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
    expect(draftNode(d, concepts)).toEqual({
      id,
      label: 'Jeans scale',
      type: 'property',
      attrs: { description: d.description, domain: 'Cosmology' },
    });
    const [e1, e2] = draftEdges(d, alone(d));
    expect(e1).toEqual({ id: `${id}_e1`, source: id, target: 'structure_formation', relationship: 'is a condition of' });
    expect(e2.target).toBe(id);
    // Trimmed, and an empty derivation is left out.
    expect(e2.description).toBe('Growth stays linear while $\\delta \\ll 1$.');
    expect('derivation' in e2).toBe(false);
  });
  it('joins several domains the vocabulary way', () => {
    expect(draftNode({ ...jeans(), domains: ['Cosmology', 'Astrophysics'] }, concepts).attrs).toMatchObject({
      domain: 'Cosmology / Astrophysics',
    });
  });
  it('what it assumes is exported in words, pointing to a concept where one is linked', () => {
    const d: Draft = {
      ...jeans(),
      assumes: [
        { label: ' Sample: a weak field ', description: ' Sample detail. ' },
        // The same words again, the same concept twice, and an empty row.
        { label: 'sample: A WEAK FIELD', description: '' },
        { label: '', description: '', concept: 'structure_formation' },
        { label: '', description: '', concept: 'structure_formation' },
        { label: '  ', description: '' },
      ],
    };
    expect(draftNode(d, concepts).assumes).toEqual([
      { label: 'Sample: a weak field', description: 'Sample detail.' },
      { concept: 'structure_formation' },
    ]);
    expect('assumes' in draftNode(jeans(), concepts)).toBe(false);
    expect(draftProblems(d, alone(d))).toEqual([]);
    const gone: Draft = { ...jeans(), assumes: [{ label: '', description: '', concept: 'nowhere' }] };
    expect(draftProblems(gone, alone(gone)).map((p) => [p.field, p.index])).toEqual([['assumes', 0]]);
    const unnamed: Draft = { ...jeans(), assumes: [{ label: '', description: 'Sample detail.' }] };
    expect(draftProblems(unnamed, alone(unnamed)).map((p) => p.field)).toEqual(['assumes']);
  });
  it('an edit starts from what the concept assumes, and gives it back unchanged', () => {
    const zeldovich = concepts.nodes.find((n) => n.id === 'zeldovich_approximation')!;
    const z = newEditDraft(zeldovich, fixed, at);
    expect(z.assumes.length).toBe(zeldovich.assumes?.length ?? 0);
    expect(draftNode(z, concepts)).toEqual(zeldovich);
  });
  it("reads an older draft's assumptions (concept ids) as ones pointing to those concepts", () => {
    const old = parseDraft({ ...jeans(), assumes: ['structure_formation'] });
    expect(old?.assumes).toEqual([{ label: '', description: '', concept: 'structure_formation' }]);
  });
  it('a formalism carries its formulas: the LaTeX, a name and variables when given', () => {
    const d: Draft = {
      ...jeans(),
      type: 'formalism',
      formulas: [
        { name: ' A vector in a basis ', equation: ' v = v^i e_i ', variables: [{ symbol: 'e_i', meaning: 'Basis vectors' }] },
        { name: '', equation: '', variables: [] },
      ],
    };
    expect(draftNode(d, concepts).attrs).toMatchObject({
      formulas: [{ name: 'A vector in a basis', equation: 'v = v^i e_i', variables: [{ symbol: 'e_i', meaning: 'Basis vectors' }] }],
    });
    const nameOnly = { ...d, formulas: [{ name: 'To do', equation: '', variables: [] }] };
    expect(draftProblems(nameOnly, alone(nameOnly)).map((p) => [p.field, p.index])).toEqual([['formulas', 0]]);
    // Formulas only belong to formalisms.
    expect('formulas' in draftNode({ ...d, type: 'property' }, concepts).attrs).toBe(false);
  });
  it('an equation carries the equation and empty lists', () => {
    const node = draftNode({ ...jeans(), type: 'equation', equation: ' a = b ' }, concepts);
    expect(node.attrs).toMatchObject({ equation: 'a = b', variables: [], conditions: [], representations: [] });
  });
  it('an equation carries its variables and other representations, each with their own', () => {
    const d: Draft = {
      ...jeans(),
      type: 'equation',
      equation: 'F = ma',
      variables: [{ symbol: ' F ', meaning: ' Force ' }, { symbol: '', meaning: '' }],
      representations: [
        { name: 'As momentum', equation: 'F = \\dot p', variables: [{ symbol: 'p', meaning: 'Momentum' }] },
        { name: 'Name only, formula to come', equation: '', variables: [] },
        { name: '', equation: '', variables: [] },
      ],
    };
    expect(draftNode(d, concepts).attrs).toMatchObject({
      variables: [{ symbol: 'F', meaning: 'Force' }],
      representations: [
        { name: 'As momentum', equation: 'F = \\dot p', variables: [{ symbol: 'p', meaning: 'Momentum' }] },
        { name: 'Name only, formula to come' },
      ],
    });
    expect(draftProblems(d, alone(d))).toEqual([]);
    const half = { ...d, variables: [{ symbol: 'F', meaning: '' }], representations: [{ name: '', equation: 'x', variables: [] }] };
    expect(draftProblems(half, alone(half)).map((p) => [p.field, p.index])).toEqual([
      ['variables', undefined],
      ['representations', 0],
    ]);
  });
  it('an edit of an equation starts from its variables and representations', () => {
    const e = newEditDraft(concepts.nodes.find((n) => n.id === 'einstein_eq')!, fixed, at);
    expect(e.variables[0]).toEqual({ symbol: 'G_{\\mu\\nu}', meaning: 'Einstein tensor (spacetime curvature)' });
    expect(e.representations[0]).toEqual({ name: 'Tensor (index) notation', equation: '', variables: [] });
    // Unchanged, it changes nothing.
    expect(draftNode(e, concepts)).toEqual(concepts.nodes.find((n) => n.id === 'einstein_eq'));
  });
  it('the map shape is a ghost under the draft ref, with a visible name', () => {
    const d = { ...jeans(), label: '' };
    const shape = draftShape(d, alone(d));
    expect(shape.ghost?.id).toBe(draftRef(d.suffix));
    expect(shape.ghost?.label).toBe('New concept');
    expect(shape.edges[0].source).toBe(draftRef(d.suffix));
  });
  it('a proposal the proposed layer accepts', () => {
    const d = jeans();
    expect(proposalProblems(draftProposal(d, alone(d)), concepts)).toEqual([]);
  });
});

describe('draftProblems', () => {
  it('lists every missing field, in words', () => {
    const d = newDraft(fixed, at);
    expect(draftProblems(d, alone(d)).map((p) => p.field)).toEqual(['label', 'type', 'description', 'relations']);
  });
  it('is empty for a complete draft', () => {
    expect(draftProblems(jeans(), alone(jeans()))).toEqual([]);
  });
  it('points at the evidence row that is malformed', () => {
    const d = { ...jeans(), evidence: [jeans().evidence[0], { kind: 'doi' as const, ref: 'not-a-doi' }] };
    expect(draftProblems(d, alone(d))).toEqual([{ field: 'evidence', index: 1, message: "Evidence 2 isn't a valid DOI." }]);
  });
  it('asks for the equation of an equation', () => {
    const d = { ...jeans(), type: 'equation' as const };
    expect(draftProblems(d, alone(d)).map((p) => p.field)).toEqual(['equation']);
  });
});

describe('export', () => {
  const files = exportFiles(jeans(), alone(jeans()));

  it('one node file and one file per relation, in the content layout', () => {
    const id = conceptId(jeans());
    expect(files.map((f) => f.path)).toEqual([
      `content/concepts/nodes/${id}.json`,
      `content/concepts/edges/${id}_e1.json`,
      `content/concepts/edges/${id}_e2.json`,
    ]);
  });
  it('never carries a position', () => {
    for (const f of [...files, proposalFile(jeans(), alone(jeans()))])
      expect(f.content).not.toMatch(/"(x|y|position|positions|renderedPosition)"\s*:/);
  });
  it('the proposal file round-trips into a proposal', () => {
    const f = proposalFile(jeans(), alone(jeans()));
    expect(f.path).toMatch(/^content\/proposals-fixtures\/proposal-jeans-scale-[a-z0-9]{4}\.json$/);
    expect(proposalProblems(JSON.parse(f.content), concepts)).toEqual([]);
  });
});

describe('pullRequestText', () => {
  it('has the title, claim, the relations as sentences, evidence links and the files', () => {
    const text = pullRequestText(jeans(), alone(jeans()));
    expect(text).toContain('# Add Jeans scale');
    expect(text).toContain('Sample claim with $\\lambda_J$.');
    expect(text).toContain('- Jeans scale is a condition of Structure Formation.');
    expect(text).toContain("- Zel'dovich approximation relates to Jeans scale.");
    expect(text).toContain('[arXiv:2101.01234](https://arxiv.org/abs/2101.01234) — Sample');
    expect(text).toContain(`content/concepts/nodes/${conceptId(jeans())}.json`);
    expect(text).toContain('Proposed by Sample author.');
    expect(text).not.toContain('## Depends on');
  });
  it('leaves the claim section out when there is no claim', () => {
    const d = { ...jeans(), claim: '  ' };
    const text = pullRequestText(d, alone(d));
    expect(text).not.toContain('## Claim');
    expect(text).toContain('## What it adds');
  });
});

describe('generality and importance', () => {
  it('are exported when set, and left out (for the curator) when not', () => {
    expect(draftNode({ ...jeans(), generality: 7, importance: 5 }, concepts)).toMatchObject({ generality: 7, importance: 5 });
    const unset = draftNode(jeans(), concepts);
    expect('generality' in unset || 'importance' in unset).toBe(false);
  });
  it('must be whole numbers in range', () => {
    const bad = { ...jeans(), generality: 11, importance: 2.5 };
    expect(draftProblems(bad, alone(bad)).map((p) => p.field)).toEqual(['generality', 'importance']);
    const edge = { ...jeans(), generality: 10, importance: 10 };
    expect(draftProblems(edge, alone(edge))).toEqual([]);
    const old = { ...jeans(), importance: 30 };
    expect(draftProblems(old, alone(old)).map((p) => p.field)).toEqual(['importance']);
  });
  it('the ghost shows the chosen size, a mid size until then, and never an out-of-range one', () => {
    const size = (d: Draft) => draftShape(d, alone(d)).ghost?.generality;
    expect(size({ ...jeans(), generality: 9 })).toBe(9);
    expect(size(jeans())).toBe(5);
    expect(size({ ...jeans(), generality: 99 })).toBe(10);
  });
});

describe('the claim is optional', () => {
  it('a draft without one exports, and its proposal has no claim field', () => {
    const d = { ...jeans(), claim: '' };
    expect(draftProblems(d, alone(d))).toEqual([]);
    const p = draftProposal(d, alone(d));
    expect('claim' in p).toBe(false);
    expect(proposalProblems(p, concepts)).toEqual([]);
  });
});

describe('several drafts, and relations between them', () => {
  const a = jeans();
  const b = builds(a);
  const ctx = alone(a, b);

  it('a relation into another draft points at its concept id once exported', () => {
    expect(draftEdges(b, ctx)[0]).toMatchObject({ source: conceptId(b), target: conceptId(a) });
  });
  it('and makes the proposal depend on that draft', () => {
    expect(draftDependencies(b, ctx)).toEqual([{ id: proposalId(a), title: 'Add Jeans scale' }]);
    expect(draftProposal(b, ctx).dependsOn).toEqual([proposalId(a)]);
    expect(draftProposal(a, ctx).dependsOn).toBeUndefined();
    expect(draftProblems(b, ctx)).toEqual([]);
  });
  it('on the map, the relation joins the two ghosts', () => {
    expect(draftShape(b, ctx).edges[0]).toMatchObject({ source: draftRef(b.suffix), target: draftRef(a.suffix) });
  });
  it('a relation into someone else’s open proposal depends on it too', () => {
    const sample = fixtureProposals().find((p) => p.id === 'sample-jeans-scale')!;
    const c = { ...builds(a), relations: [{ key: 'r1', source: NEW_CONCEPT, target: 'jeans_scale_s1', relationship: 'relates' }] };
    const withSample: DraftContext = { confirmed: concepts, drafts: [c], proposals: [sample] };
    expect(draftProposal(c, withSample).dependsOn).toEqual(['sample-jeans-scale']);
    expect(draftProblems(c, withSample)).toEqual([]);
  });
  it('the pull request says what it depends on, and what happens on a rejection', () => {
    const text = pullRequestText(b, ctx);
    expect(text).toContain('## Depends on');
    expect(text).toContain(`- Add Jeans scale (\`${proposalId(a)}\`)`);
    expect(text).toContain('If one is rejected, the relations pointing at it are removed');
  });
  it('discarding a draft removes the relations other drafts had into it', () => {
    const { drafts, removed } = withoutDraft([a, b], a.suffix);
    expect(removed).toBe(1);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].relations).toEqual([]);
  });
  it('once one is submitted, the others point at its proposed concept and still depend on it', () => {
    const rest = afterSubmission([a, b], a.suffix);
    expect(rest.map((d) => d.suffix)).toEqual([b.suffix]);
    expect(rest[0].relations[0].target).toBe(conceptId(a));
    const submitted = { ...draftProposal(a, ctx), pr: { number: 12, url: 'https://github.com/o/r/pull/12' } };
    const later: DraftContext = { confirmed: concepts, drafts: rest, proposals: [submitted] };
    expect(draftProposal(rest[0], later).dependsOn).toEqual([proposalId(a)]);
    expect(draftProblems(rest[0], later)).toEqual([]);
  });
  it('a relation whose other end is gone is flagged, not exported', () => {
    const lone = alone(b);
    expect(draftEdges(b, lone)).toEqual([]);
    expect(draftProblems(b, lone)).toContainEqual({
      field: 'relations',
      index: 0,
      message: "Relation 1 points at a concept that's no longer proposed — remove it.",
    });
  });
});

describe('when a dependency is rejected', () => {
  const a = jeans();
  const b = builds(a);
  const ctx = alone(a, b);
  const pa = draftProposal(a, ctx);
  const pb = { ...draftProposal(b, ctx), edges: [...draftProposal(b, ctx).edges, { id: 'pb_e2', source: conceptId(b), target: 'structure_formation', relationship: 'relates' }] };

  it('while it is open, the dependent proposal is valid and keeps its relations', () => {
    expect(proposalProblems(pb, concepts, [pa, pb])).toEqual([]);
    expect(resolveDependencies([pa, pb], concepts).find((p) => p.id === pb.id)?.edges).toHaveLength(2);
  });
  it('once it is gone, its relations are dropped and the rest stands', () => {
    expect(proposalProblems(pb, concepts, [pb])).toEqual([]);
    const [left] = resolveDependencies([pb], concepts);
    expect(left.edges.map((e) => e.target)).toEqual(['structure_formation']);
    expect(left.dropped).toEqual([{ edge: draftProposal(b, ctx).edges[0], dependency: proposalId(a) }]);
  });
  it('a new concept stays even when all its relations go; a proposal of only relations is left out', () => {
    const [orphan] = resolveDependencies([draftProposal(b, ctx)], concepts);
    expect(orphan.nodes).toHaveLength(1);
    expect(orphan.edges).toEqual([]);
    const onlyRelations = { ...draftProposal(b, ctx), nodes: [], edges: [{ ...draftProposal(b, ctx).edges[0], source: 'kinetic_theory' }] };
    expect(resolveDependencies([onlyRelations], concepts)).toEqual([]);
  });
  it('using another proposal’s concept without depending on it is a problem', () => {
    const sneaky = { ...pb, dependsOn: undefined };
    expect(proposalProblems(sneaky, concepts, [pa, sneaky]).join()).toContain('list it in dependsOn');
  });
});

describe('editing a confirmed concept', () => {
  const edit = (): Draft => ({ ...newEditDraft(vlasov(), fixed, at), generality: 6 });

  it('opens pre-filled from the concept', () => {
    const d = newEditDraft(vlasov(), fixed, at);
    expect(d).toMatchObject({ editOf: 'vlasov_equation', label: vlasov().label, type: vlasov().type, generality: vlasov().generality });
    expect(d.description).toBe((vlasov().attrs as { description: string }).description);
  });
  it('needs a change before it can be exported', () => {
    const d = newEditDraft(vlasov(), fixed, at);
    expect(draftProblems(d, alone(d)).map((p) => p.message)).toEqual([
      'Change something — a field, a new relation, or a relation to remove.',
    ]);
  });
  it('becomes an edit proposal: the changed concept under its own id', () => {
    const d = edit();
    const p = draftProposal(d, alone(d));
    expect(p.nodes).toEqual([]);
    expect(p.edits?.[0]).toMatchObject({ id: 'vlasov_equation', generality: 6 });
    expect(p.title).toBe(`Edit ${vlasov().label}`);
    expect(proposalProblems(p, concepts)).toEqual([]);
  });
  it('keeps the fields the form does not show, in the file’s own key order', () => {
    const before = concepts.nodes.find((n) => n.id === 'lorentz_invariance')!;
    const d = { ...newEditDraft(before, fixed, at), importance: 5 };
    const after = draftNode(d, concepts);
    expect(after.review).toBe(before.review);
    expect(Object.keys(after)).toEqual(Object.keys(before));
  });
  it('can remove confirmed relations; the export lists the files to delete', () => {
    const e62 = concepts.edges.find((e) => e.id === 'e62')!;
    const d = { ...edit(), removals: [e62.id] };
    expect(draftProposal(d, alone(d)).removals).toEqual(['e62']);
    expect(removedFiles(d)).toEqual(['content/concepts/edges/e62.json']);
    const text = pullRequestText(d, alone(d));
    expect(text).toContain('- Generality: “');
    expect(text).toContain('- Removes: Structure Formation relates to Vlasov eq.');
    expect(text).toContain('- Delete `content/concepts/edges/e62.json`');
  });
  it('new relations get ids that two edits of one concept can’t share', () => {
    const d = { ...edit(), relations: [{ key: 'r1', source: NEW_CONCEPT, target: 'kinetic_theory', relationship: 'relates' }] };
    expect(draftEdges(d, alone(d))[0].id).toBe(`vlasov_equation_${d.suffix}_e1`);
  });
  it('on the map, the subject is the confirmed concept itself', () => {
    const d = edit();
    const shape = draftShape(d, alone(d));
    expect(shape.ghost).toBeUndefined();
    expect(shape.subjectId).toBe('vlasov_equation');
    expect(shape.subject?.generality).toBe(6);
  });
});

describe('storage', () => {
  it('reads back what it wrote', () => {
    const d = jeans();
    expect(parseDraft(JSON.parse(JSON.stringify(d)))).toEqual(d);
    const e = { ...newEditDraft(vlasov(), fixed, at), removals: ['e62'] };
    expect(parseDraft(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });
  it('reads a Phase 2 (version 1) draft as today’s', () => {
    const { removals: _r, variables: _v, representations: _p, ...old } = jeans();
    void _r;
    void _v;
    void _p;
    expect(parseDraft({ ...old, version: 1 })).toEqual(jeans());
  });
  it('moves an older draft’s importance from the 1–50 scale to the same depth on 1–10', () => {
    expect(parseDraft({ ...jeans(), version: 2, importance: 30 })?.importance).toBe(6);
    expect(parseDraft({ ...jeans(), version: 2, importance: 2 })?.importance).toBe(1);
    expect(parseDraft({ ...jeans(), importance: 6 })?.importance).toBe(6);
  });
  it('rejects anything that is not a draft', () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft({ ...jeans(), version: 4 })).toBeNull();
    expect(parseDraft({ ...jeans(), variables: [{ symbol: 'x' }] })).toBeNull();
    expect(parseDraft({ ...jeans(), representations: [{ name: 'x' }] })).toBeNull();
    expect(parseDraft({ ...jeans(), type: 'resource' })).toBeNull();
    expect(parseDraft({ ...jeans(), relations: [{ key: 'r1' }] })).toBeNull();
    expect(parseDraft({ ...jeans(), evidence: [{ kind: 'tweet', ref: 'x' }] })).toBeNull();
    expect(parseDraft({ ...jeans(), generality: 'big' })).toBeNull();
  });
  it('knows an empty draft from a started one', () => {
    expect(hasContent(newDraft())).toBe(false);
    expect(hasContent({ ...newDraft(), label: 'x' })).toBe(true);
    expect(hasContent(newEditDraft(vlasov()))).toBe(true);
  });
});
