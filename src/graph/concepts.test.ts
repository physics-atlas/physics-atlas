import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '../data/types';
import {
  buildConceptIndex,
  conditionClause,
  domainsOf,
  effectiveGenerality,
  effectiveImportance,
  joinList,
  labelSize,
  neighborsOf,
  nodeRadius,
  normalizeRelationship,
  revealZoom,
  sentenceParts,
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

  it('adds the assumptions an edge holds under before the full stop', () => {
    const edge = rel('e1', 'z', 's', 'approximates', { conditions: [{ label: 'linear potential' }] });
    const text = sentenceParts(edge, byId)
      .map((p) => (typeof p === 'string' ? p : p.label))
      .join('');
    expect(text).toBe('Z approximates S under the assumption of linear potential.');
  });

  it('can leave the assumptions out', () => {
    const edge = rel('e1', 'z', 's', 'approximates', { conditions: [{ label: 'linear potential' }] });
    expect(sentenceParts(edge, byId, false).at(-1)).toBe('.');
  });
});

describe('conditions', () => {
  it('joinList reads naturally', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['a'])).toBe('a');
    expect(joinList(['a', 'b'])).toBe('a and b');
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c');
  });

  it('conditionClause is singular or plural', () => {
    expect(conditionClause(rel('e', 'a', 'b', 'relates'))).toBeNull();
    expect(conditionClause(rel('e', 'a', 'b', 'relates', { conditions: [{ label: 'x' }, { label: 'y' }] }))).toBe(
      'under the assumptions of x and y',
    );
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
    const both = concept('a', { importance: 40, generality: 2 });
    expect(effectiveImportance(both, 0)).toBe(40);
    expect(effectiveGenerality(both, 0)).toBe(2);
    expect(effectiveImportance(concept('a', { generality: 9 }), 0)).toBe(1);
    expect(effectiveGenerality(concept('a', { importance: 50 }), 0)).toBe(1);
    expect(effectiveImportance(concept('a'), 100)).toBe(50);
    expect(effectiveGenerality(concept('a'), 100)).toBe(10);
  });
  it('treats an unrated learning goal as minor and specific', () => {
    const goal = { id: 'g', label: 'G', type: 'learning_goal', attrs: { description: 'g' } } as GraphNode;
    expect(effectiveImportance(goal, 10)).toBe(1);
    expect(effectiveGenerality(goal, 10)).toBe(1);
  });
  it('sizes the circle by generality: 1–10 → radius 7–270, the same factor per step', () => {
    const r = (g: number) => nodeRadius(concept('a', { generality: g, importance: 50 }), 0);
    expect(r(1)).toBeCloseTo(7);
    expect(r(10)).toBeCloseTo(270);
    expect(r(6) / r(5)).toBeCloseTo(r(2) / r(1));
    expect(r(2) / r(1)).toBeCloseTo(1.5, 1);
  });
  it('sizes names by importance (12–18 px), and big circles get names to match', () => {
    expect(labelSize(1)).toBe(12);
    expect(labelSize(50)).toBe(18);
    expect(labelSize(1, 270)).toBe(90);
    expect(labelSize(50, 7)).toBe(18);
  });
  it('gives every importance its own depth: 50 always, 40 on the overview, each 8 below twice as close', () => {
    expect(revealZoom(50)).toBe(0);
    expect(revealZoom(40)).toBe(1);
    expect(revealZoom(32)).toBe(2);
    expect(revealZoom(24)).toBe(4);
    expect(revealZoom(1)).toBeCloseTo(29.2, 0);
    for (let i = 1; i < 49; i++) expect(revealZoom(i)).toBeGreaterThan(revealZoom(i + 1));
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
