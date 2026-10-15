import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '../data/types';
import {
  buildConceptIndex,
  conditionClause,
  domainsOf,
  effectiveImportance,
  joinList,
  neighborsOf,
  nodeRadius,
  normalizeRelationship,
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

describe('importance and size', () => {
  it('prefers authored importance, then generality, then degree', () => {
    expect(effectiveImportance(concept('a', { importance: 4, generality: 1 }), 0)).toBe(4);
    expect(effectiveImportance(concept('a', { generality: 2 }), 9)).toBe(2);
    expect(effectiveImportance(concept('a'), 0)).toBe(1);
    expect(effectiveImportance(concept('a'), 100)).toBe(5);
  });
  it('treats an unrated learning goal as minor', () => {
    const goal = { id: 'g', label: 'G', type: 'learning_goal', attrs: { description: 'g' } } as GraphNode;
    expect(effectiveImportance(goal, 10)).toBe(1);
  });
  it('maps importance 1–5 to radius 7–27', () => {
    expect(nodeRadius(concept('a', { importance: 1 }), 0)).toBe(7);
    expect(nodeRadius(concept('a', { importance: 5 }), 0)).toBe(27);
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
