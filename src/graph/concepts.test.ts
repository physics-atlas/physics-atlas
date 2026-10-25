import { describe, expect, it } from 'vitest';
import { EDGE_SENTENCE_TEMPLATES, RELATION_CATEGORIES, relationCategory } from '../data/types';
import type { GraphEdge, GraphNode } from '../data/types';
import {
  buildConceptIndex,
  assumptionsOf,
  domainsOf,
  edgeWeight,
  effectiveGenerality,
  effectiveImportance,
  joinList,
  labelSize,
  LONELY_LINES,
  lonelyLine,
  neighborsOf,
  nodeRadius,
  normalizeRelationship,
  relationFontSize,
  revealZoom,
  sentenceParts,
  splitFluff,
} from './concepts';

const concept = (id: string, extra: Partial<GraphNode> = {}, domain?: string): GraphNode =>
  ({ id, label: id.toUpperCase(), type: 'property', attrs: { description: id, domain }, ...extra }) as GraphNode;

const rel = (id: string, source: string, target: string, relationship: string, extra: Partial<GraphEdge> = {}) => ({
  id,
  source,
  target,
  relationship,
  ...extra,
});

describe('normalizeRelationship', () => {
  it('ignores case and extra whitespace', () => {
    expect(normalizeRelationship('  Strict   Prerequisite for ')).toBe('strict prerequisite for');
  });
  it('rejects unknown relations', () => {
    expect(normalizeRelationship('teleports to')).toBeNull();
  });
});

describe('sentenceParts', () => {
  const byId = new Map([
    ['z', concept('z')],
    ['s', concept('s')],
  ]);

  it('reads an edge as a sentence with the two concepts as references', () => {
    const parts = sentenceParts(rel('e1', 'z', 's', 'approximates'), byId);
    expect(parts).toEqual([{ id: 'z', label: 'Z' }, ' approximates ', { id: 's', label: 'S' }, '.']);
  });

});

describe('assumptions and lists', () => {
  it('joinList reads naturally', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['a'])).toBe('a');
    expect(joinList(['a', 'b'])).toBe('a and b');
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c');
  });

  it('a concept assumes things in words; one pointing to a concept links both ways and joins its sub-view', () => {
    const graph = {
      version: 1,
      nodes: [
        concept('z', {
          assumes: [{ label: 'Sample regime', description: 'Sample detail.' }, { concept: 'lp' }, { label: 'Gone', concept: 'gone' }],
        }),
        concept('lp'),
        concept('s'),
      ],
      edges: [rel('e1', 'z', 's', 'approximates')],
    };
    const index = buildConceptIndex(graph);
    const { assumes, assumedBy } = assumptionsOf('z', index);
    // In words, the linked concept's name when it has none of its own.
    expect(assumes.map((a) => a.label)).toEqual(['Sample regime', 'LP', 'Gone']);
    expect(assumes[0].description).toBe('Sample detail.');
    expect(assumes.map((a) => a.node?.id)).toEqual([undefined, 'lp', undefined]);
    expect(assumedBy).toEqual([]);
    expect(assumptionsOf('lp', index).assumedBy.map((n) => n.id)).toEqual(['z']);
    expect(neighborsOf('z', index).sort()).toEqual(['lp', 's', 'z']);
    expect(neighborsOf('lp', index).sort()).toEqual(['lp', 'z']);
  });
});

describe('domainsOf', () => {
  it('splits "A / B" into domains', () => {
    expect(domainsOf(concept('a', {}, 'General relativity / Astrophysics'))).toEqual([
      'General relativity',
      'Astrophysics',
    ]);
  });
  it('is empty when the concept has no domain', () => {
    expect(domainsOf(concept('a'))).toEqual([]);
  });
});

describe('generality (size) and importance (zoom visibility)', () => {
  it('each uses its authored value, else a degree estimate — never the other', () => {
    const both = concept('a', { importance: 8, generality: 2 });
    expect(effectiveImportance(both, 0)).toBe(8);
    expect(effectiveGenerality(both, 0)).toBe(2);
    expect(effectiveImportance(concept('a', { generality: 9 }), 0)).toBe(1);
    expect(effectiveGenerality(concept('a', { importance: 10 }), 0)).toBe(1);
    expect(effectiveImportance(concept('a'), 100)).toBe(10);
    expect(effectiveGenerality(concept('a'), 100)).toBe(10);
  });
  it('treats an unrated learning goal as minor and specific', () => {
    const goal = { id: 'g', label: 'G', type: 'learning_goal', attrs: { description: 'g' } } as GraphNode;
    expect(effectiveImportance(goal, 10)).toBe(1);
    expect(effectiveGenerality(goal, 10)).toBe(1);
  });
  it('sizes the circle by generality: 1–10 → radius 7–270, the same factor per step', () => {
    const r = (g: number) => nodeRadius(concept('a', { generality: g, importance: 10 }), 0);
    expect(r(1)).toBeCloseTo(7);
    expect(r(10)).toBeCloseTo(270);
    expect(r(6) / r(5)).toBeCloseTo(r(2) / r(1));
    expect(r(2) / r(1)).toBeCloseTo(1.5, 1);
  });
  it('sizes names by importance (12–18 px), and big circles get names to match', () => {
    expect(labelSize(1)).toBe(12);
    expect(labelSize(10)).toBe(18);
    expect(labelSize(1, 270)).toBe(90);
    expect(labelSize(10, 7)).toBe(18);
  });
  it('gives every importance its own depth: 10 always, 8 on the overview, each step below ~1.5× closer', () => {
    expect(revealZoom(10)).toBe(0);
    expect(revealZoom(8)).toBe(1);
    expect(revealZoom(6)).toBeCloseTo(2.38, 2);
    expect(revealZoom(1)).toBeCloseTo(20.7, 1);
    for (let i = 1; i < 9; i++) expect(revealZoom(i)).toBeGreaterThan(revealZoom(i + 1));
  });
  it('keeps every concept at the depth it had on the old 1–50 scale (a fifth of it)', () => {
    const old = (i: number) => 2 ** ((40 - i) / 8);
    for (const i of [1, 2, 4, 6, 8]) expect(revealZoom(i)).toBeCloseTo(old(5 * i), 6);
  });
  it('weights a relation by the larger generality and importance of its two ends, damped to 1–4 px', () => {
    expect(edgeWeight([7, 7], [1, 1])).toEqual({ px: 1, strength: 0 });
    expect(edgeWeight([7, 270], [10, 1])).toEqual({ px: 4, strength: 1 });
    // Either end carries it, and a mid-size end lands in between.
    expect(edgeWeight([270, 7], [1, 10])).toEqual(edgeWeight([7, 270], [10, 1]));
    const mid = edgeWeight([7, nodeRadius(concept('a', { generality: 5 }), 0)], [1, 5.5]);
    expect(mid.px).toBeGreaterThan(2);
    expect(mid.px).toBeLessThan(3);
    expect(mid.strength).toBeCloseTo(0.5);
  });
  it("sizes a relation's name by its smaller end: a landmark's tie to a detail keeps a detail-sized name", () => {
    expect(relationFontSize([7, 270], [1, 10])).toBe(relationFontSize([7, 7], [1, 1]));
    expect(relationFontSize([270, 270], [10, 10])).toBeGreaterThan(relationFontSize([270, 7], [10, 1]));
    expect(relationFontSize([270, 120], [10, 6])).toBe(relationFontSize([120, 120], [6, 6]));
  });
});

describe('fun mode', () => {
  it('splits fluff and every relation touching it off the map everyone sees', () => {
    const graph = {
      version: 1,
      nodes: [concept('a'), concept('b'), concept('cat', { type: 'fluff' } as Partial<GraphNode>)],
      edges: [rel('e1', 'a', 'b', 'relates'), rel('e2', 'cat', 'a', 'relates')],
    };
    const { base, fluff } = splitFluff(graph);
    expect(base.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(base.edges.map((e) => e.id)).toEqual(['e1']);
    expect(fluff.nodes.map((n) => n.id)).toEqual(['cat']);
    expect(fluff.edges.map((e) => e.id)).toEqual(['e2']);
  });
  it('gives each lonely concept one of its lines, always the same one', () => {
    expect(LONELY_LINES).toContain(lonelyLine('bosons'));
    expect(lonelyLine('bosons')).toBe(lonelyLine('bosons'));
    expect(new Set(['bec', 'bosons', 'caustics', 'lg_a', 'lg_b', 'x', 'y'].map(lonelyLine)).size).toBeGreaterThan(1);
  });
});

describe('neighborsOf', () => {
  it('returns the concept plus its direct connections in both directions', () => {
    const index = buildConceptIndex({
      version: 1,
      nodes: ['a', 'b', 'c', 'd'].map((id) => concept(id)),
      edges: [rel('e1', 'a', 'b', 'relates'), rel('e2', 'c', 'a', 'relates'), rel('e3', 'c', 'd', 'relates')],
    });
    expect(neighborsOf('a', index).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('relation categories', () => {
  it('put every relation type in exactly one broader category', () => {
    const placed = RELATION_CATEGORIES.flatMap((c) => c.types);
    expect([...placed].sort()).toEqual(Object.keys(EDGE_SENTENCE_TEMPLATES).sort());
    expect(new Set(placed).size).toBe(placed.length);
  });
  it('group the two directions of a relation together', () => {
    expect(relationCategory('is derived from').key).toBe(relationCategory('is derived by').key);
    expect(relationCategory('describes').key).toBe(relationCategory('described by').key);
    expect(relationCategory('relates').key).toBe(relationCategory('links').key);
    expect(relationCategory('no such relation').key).toBe('association');
  });
});
