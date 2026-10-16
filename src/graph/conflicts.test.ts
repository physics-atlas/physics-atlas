import { describe, expect, it } from 'vitest';
import { concepts } from '../data/loadConcepts';
import type { GraphEdge, GraphNode } from '../data/types';
import { edgeConflicts, labelSimilarity, normalizeLabel, similarLabels } from './conflicts';

const node = (id: string, label: string): GraphNode => ({ id, label, type: 'property', attrs: { description: id } });
const rel = (id: string, source: string, target: string, relationship: string): GraphEdge => ({
  id,
  source,
  target,
  relationship,
});

describe('normalizeLabel', () => {
  it('drops case, accents, punctuation, plurals and a leading article', () => {
    expect(normalizeLabel('The Schrödinger-Poisson eqs.')).toBe('schrodinger poisson equation');
    expect(normalizeLabel("Zel'dovich approximation")).toBe('zeldovich approximation');
    expect(normalizeLabel('Einstein Field Equations')).toBe('einstein field equation');
  });
  it('keeps words that only look plural', () => {
    expect(normalizeLabel('Mass')).toBe('mass');
    expect(normalizeLabel('Gas')).toBe('gas');
  });
});

describe('labelSimilarity', () => {
  it('is 1 for identical strings and 0 for nothing shared', () => {
    expect(labelSimilarity('curvature', 'curvature')).toBe(1);
    expect(labelSimilarity('abc', 'xyz')).toBe(0);
  });
});

describe('similarLabels', () => {
  const nodes = [
    node('einstein_eq', 'Einstein Field Equations'),
    node('structure_formation', 'Structure Formation'),
    node('special_relativity', 'Special Relativity'),
    node('vlasov', 'Vlasov eq.'),
  ];

  it('finds the same concept written differently', () => {
    const [m] = similarLabels('einstein field equation', nodes);
    expect(m.node.id).toBe('einstein_eq');
    expect(m.reason).toBe('same name');
    expect(similarLabels('Vlasov equation', nodes)[0].node.id).toBe('vlasov');
  });
  it('finds a concept by its abbreviation, both ways', () => {
    expect(similarLabels('SR', nodes)[0]).toMatchObject({ reason: 'abbreviation', node: { id: 'special_relativity' } });
    expect(similarLabels('EFE', nodes)[0].node.id).toBe('einstein_eq');
  });
  it('flags close spellings', () => {
    expect(similarLabels('Structur formation', nodes)[0]).toMatchObject({ reason: 'similar name', node: { id: 'structure_formation' } });
  });
  it('stays quiet for short or unrelated input', () => {
    expect(similarLabels('St', nodes)).toEqual([]);
    expect(similarLabels('Jeans scale', nodes)).toEqual([]);
  });
  it('works on the real graph: "Zeldovich approximation" finds the confirmed one', () => {
    expect(similarLabels('Zeldovich approximation', concepts.nodes)[0].node.id).toBe('zeldovich_approximation');
  });
});

describe('edgeConflicts', () => {
  const confirmed = [
    rel('e1', 'a', 'b', 'strict prerequisite for'),
    rel('e2', 'b', 'c', 'Strict prerequisite for'),
    rel('e3', 'c', 'd', 'relates'),
  ];

  it('accepts a new, unrelated relation', () => {
    expect(edgeConflicts(rel('n1', 'new', 'a', 'relates'), { confirmed })).toEqual([]);
  });
  it('flags a duplicate (source, target, type), whatever the casing', () => {
    const [c] = edgeConflicts(rel('n1', 'c', 'd', 'Relates'), { confirmed });
    expect(c).toMatchObject({ kind: 'duplicate', existing: { id: 'e3' }, source: { in: 'confirmed' } });
  });
  it('a different relation type between the same concepts is fine', () => {
    expect(edgeConflicts(rel('n1', 'c', 'd', 'explains'), { confirmed })).toEqual([]);
  });
  it('flags the same relation pointing the other way', () => {
    const conflicts = edgeConflicts(rel('n1', 'd', 'c', 'relates'), { confirmed });
    expect(conflicts).toEqual([expect.objectContaining({ kind: 'reversed', existing: expect.objectContaining({ id: 'e3' }) })]);
  });
  it('finds a strict-prerequisite loop and its path', () => {
    const conflicts = edgeConflicts(rel('n1', 'c', 'a', 'strict prerequisite for'), { confirmed });
    expect(conflicts).toContainEqual({ kind: 'cycle', path: ['a', 'b', 'c'] });
  });
  it('counts the draft’s own relations, but not other proposals, toward a loop', () => {
    const draft = [rel('n1', 'd', 'a', 'strict prerequisite for')];
    const closing = rel('n2', 'c', 'd', 'strict prerequisite for');
    expect(edgeConflicts(closing, { confirmed, draft })).toContainEqual({ kind: 'cycle', path: ['d', 'a', 'b', 'c'] });
    const proposals = [{ edge: draft[0], title: 'Other' }];
    expect(edgeConflicts(closing, { confirmed, proposals }).some((c) => c.kind === 'cycle')).toBe(false);
  });
  it('names the proposal a duplicate comes from', () => {
    const proposals = [{ edge: rel('p1', 'new', 'a', 'relates'), title: 'Sample proposal' }];
    expect(edgeConflicts(rel('n1', 'new', 'a', 'relates'), { confirmed, proposals })[0]).toMatchObject({
      kind: 'duplicate',
      source: { in: 'proposal', title: 'Sample proposal' },
    });
  });
  it('rejects a relation from a concept to itself', () => {
    expect(edgeConflicts(rel('n1', 'a', 'a', 'relates'), { confirmed })).toEqual([{ kind: 'self' }]);
  });
  it('does not compare a relation with itself', () => {
    expect(edgeConflicts(confirmed[2], { confirmed })).toEqual([]);
  });
});
