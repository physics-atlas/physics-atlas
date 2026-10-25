import { describe, expect, it } from 'vitest';
import type { ConceptGraph, GraphNode } from '../data/types';
import {
  conceptLayoutInput,
  conceptNodeBox,
  glyphMeasure,
  packConceptLayout,
  relationLabelBox,
  searchConceptLayout,
  searchSeeds,
} from './conceptLayout';
import { countBoxOverlaps, labelCovers } from './layoutOptimize';

const concept = (id: string, extra: Partial<GraphNode> = {}): GraphNode =>
  ({ id, label: `Sample ${id}`, type: 'property', attrs: { description: id }, ...extra }) as GraphNode;

const graph = (nodes: GraphNode[], edges: [string, string, string][]): ConceptGraph =>
  ({
    version: 1,
    nodes,
    edges: edges.map(([source, target, relationship], i) => ({ id: `e${i}`, source, target, relationship })),
  }) as ConceptGraph;

describe('glyphMeasure', () => {
  it('adds up character widths in proportion to the font size', () => {
    expect(glyphMeasure('', 12, false)).toBe(0);
    expect(glyphMeasure('ab', 20, false)).toBeCloseTo(2 * glyphMeasure('ab', 10, false));
    expect(glyphMeasure('MM', 10, false)).toBeGreaterThan(glyphMeasure('ii', 10, false));
    // An unknown character still takes room.
    expect(glyphMeasure('\u{1F600}', 10, false)).toBeGreaterThan(0);
  });
});

describe('conceptNodeBox', () => {
  it('puts a specific concept\'s name under its circle, wrapping a long one', () => {
    const short = conceptNodeBox(concept('a', { generality: 1, label: 'Sample' }), 0);
    const long = conceptNodeBox(concept('b', { generality: 1, label: 'Sample name long enough to wrap twice over' }), 0);
    expect(short.top).toBe(-short.radius);
    expect(short.bottom).toBeGreaterThan(short.radius);
    expect(long.bottom).toBeGreaterThan(short.bottom);
    expect(long.right - long.left).toBeLessThanOrEqual(140 + 1);
  });
  it('keeps a big concept to its circle — unless its name has a word too long to wrap', () => {
    const big = conceptNodeBox(concept('a', { generality: 8, label: 'Sample' }), 0);
    expect(big).toEqual({ radius: big.radius, left: -big.radius, right: big.radius, top: -big.radius, bottom: big.radius });
    const spill = conceptNodeBox(concept('b', { generality: 6, label: 'Sampleveryverylongunbrokenname' }), 0);
    expect(spill.right).toBeGreaterThan(spill.radius);
  });
});

describe('relationLabelBox', () => {
  it('sizes the name from the smaller end and has room for the arrowhead', () => {
    const toDetail = relationLabelBox('uses', [270, 7], [10, 1])!;
    const betweenBig = relationLabelBox('uses', [270, 270], [10, 10])!;
    expect(toDetail.length).toBeLessThan(betweenBig.length);
    expect(toDetail.arrow).toBeGreaterThan(0);
    expect(relationLabelBox('  ', [7, 7], [1, 1])).toBeUndefined();
  });
});

describe('conceptLayoutInput', () => {
  const sample = graph(
    [
      concept('a', { generality: 8 }),
      concept('b'),
      concept('c', { assumes: [{ concept: 'd' }] }),
      concept('d'),
      // An assumption in words only ties nothing.
      concept('lone', { assumes: [{ label: 'Sample regime' }] }),
    ],
    [
      ['b', 'a', 'uses'],
      ['c', 'a', 'uses'],
    ],
  );
  it('groups concepts by relations and assumptions, the unconnected apart', () => {
    const input = conceptLayoutInput(sample);
    expect(input.components).toHaveLength(1);
    expect(input.components[0].ids.sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(input.components[0].ties).toEqual([['c', 'd']]);
    expect(input.loneIds).toEqual(['lone']);
  });
  it('keys on the data: the same graph matches, a renamed or resized concept does not', () => {
    const key = conceptLayoutInput(sample).key;
    expect(conceptLayoutInput(structuredClone(sample)).key).toBe(key);
    const change = (extra: Partial<GraphNode>): ConceptGraph => ({
      ...sample,
      nodes: sample.nodes.map((n) => (n.id === 'b' ? ({ ...n, ...extra } as GraphNode) : n)),
    });
    expect(conceptLayoutInput(change({ label: 'Sample renamed' })).key).not.toBe(key);
    expect(conceptLayoutInput(change({ generality: 5 })).key).not.toBe(key);
    expect(conceptLayoutInput(change({ importance: 9 })).key).not.toBe(key);
  });
  it('ignores a relation to a concept that does not exist instead of failing', () => {
    const broken = graph([concept('a'), concept('b')], [['a', 'b', 'uses'], ['a', 'gone', 'uses']]);
    expect(conceptLayoutInput(broken).components[0].segments).toEqual([['a', 'b']]);
  });
});

describe('searchConceptLayout', () => {
  it('lays a graph out deterministically, packs it without overlaps and leaves every name readable', () => {
    const sample = graph(
      [concept('hub', { generality: 7 }), concept('a'), concept('b'), concept('c'), concept('x'), concept('y')],
      [
        ['a', 'hub', 'is a special case of'],
        ['b', 'hub', 'uses'],
        ['c', 'hub', 'relates'],
        ['x', 'y', 'uses'],
      ],
    );
    const input = conceptLayoutInput(sample);
    expect(searchSeeds(0, input.components[0].ids).length).toBeGreaterThan(1);
    const components = searchConceptLayout(input);
    expect(searchConceptLayout(input)).toEqual(components);
    const pos = packConceptLayout(input, components, 1.6);
    expect(Object.keys(pos).sort()).toEqual(sample.nodes.map((n) => n.id).sort());
    expect(countBoxOverlaps(pos, input.boxes)).toBe(0);
    input.components.forEach((c, i) => expect(labelCovers(c.segments, c.labels, components[i], input.boxes).size).toBe(0));
  });
});
