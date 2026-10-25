import { describe, expect, it } from 'vitest';
import type { ConceptGraph, GraphNode, NodeType } from '../data/types';
import { buildConceptIndex } from './concepts';
import {
  buildContents,
  connectionsOf,
  filterContents,
  neighbourGroups,
  pageNeighbours,
  relationTypes,
  trail,
  typeGroups,
} from './contents';
import type { PageFilter } from './contents';

const concept = (id: string, generality: number, extra: Partial<GraphNode> = {}): GraphNode =>
  ({ id, label: `Sample ${id}`, type: 'property', generality, attrs: { description: id }, ...extra }) as GraphNode;

// Two landmarks (A, B); a and b gather round A, c round B, d under a; lone stands alone.
const graph: ConceptGraph = {
  version: 1,
  nodes: [
    concept('A', 9),
    concept('B', 8, { type: 'theory' }),
    concept('a', 5),
    concept('b', 4, { type: 'phenomenon' }),
    concept('c', 5),
    concept('d', 2, { assumes: [{ concept: 'a' }] }),
    concept('lone', 3),
  ],
  edges: [
    { id: 'e1', source: 'a', target: 'A', relationship: 'is a special case of' },
    { id: 'e2', source: 'A', target: 'b', relationship: 'explains' },
    { id: 'e3', source: 'c', target: 'B', relationship: 'uses' },
    { id: 'e4', source: 'c', target: 'A', relationship: 'uses' },
    { id: 'e5', source: 'A', target: 'B', relationship: 'relates' },
  ],
} as ConceptGraph;
const index = buildConceptIndex(graph);
const contents = buildContents(index);
const all = (): PageFilter => ({
  types: new Set<NodeType>(['property', 'theory', 'phenomenon']),
  relations: new Set(relationTypes(graph.edges)),
  text: '',
});

describe('buildContents', () => {
  it('makes chapters of the concepts with nothing bigger next to them, the rest sit under their most general neighbour', () => {
    expect(contents.roots).toEqual(['A', 'lone']);
    // c is next to both A and B; A is the bigger one.
    expect(contents.byId.get('c')!.parent).toBe('A');
    // B is smaller than A, its neighbour, so it isn't a chapter either.
    expect(contents.byId.get('B')!.parent).toBe('A');
    // An assumption pointing to a concept counts as being next to it.
    expect(contents.byId.get('d')!.parent).toBe('a');
  });
  it('numbers the pages like a book and reads them depth-first, bigger first', () => {
    expect(contents.order).toEqual(['A', 'B', 'a', 'd', 'c', 'b', 'lone']);
    expect(contents.byId.get('A')!.number).toBe('1');
    expect(contents.byId.get('a')!.number).toBe('1.2');
    expect(contents.byId.get('d')!.number).toBe('1.2.1');
    expect(contents.byId.get('lone')!.number).toBe('2');
  });
  it('gives each page its previous, next and up, and the trail above it', () => {
    expect(pageNeighbours('a', contents)).toEqual({ prev: 'B', next: 'd', up: 'A' });
    expect(pageNeighbours('A', contents).prev).toBeNull();
    expect(pageNeighbours('lone', contents).next).toBeNull();
    expect(trail('d', contents)).toEqual(['A', 'a']);
  });
});

describe('filterContents', () => {
  it('keeps the tree: a match shows with the sections above it as context', () => {
    const { shown, matches } = filterContents(contents, index, { ...all(), text: 'sample d' });
    expect([...matches]).toEqual(['d']);
    expect([...shown].sort()).toEqual(['A', 'a', 'd']);
  });
  it('filters by kind of concept', () => {
    const { matches } = filterContents(contents, index, { ...all(), types: new Set<NodeType>(['theory']) });
    expect([...matches]).toEqual(['B']);
  });
});

describe('neighbourGroups', () => {
  it("lists a page's relations out and in, filtered by kind of relation and of concept", () => {
    const g = neighbourGroups('A', index, all());
    expect(g.out.map((i) => i.other.id)).toEqual(['b', 'B']);
    expect(g.in.map((i) => i.other.id)).toEqual(['a', 'c']);
    const onlyUses = neighbourGroups('A', index, { ...all(), relations: new Set(['uses']) });
    expect(onlyUses.out).toEqual([]);
    expect(onlyUses.in.map((i) => i.other.id)).toEqual(['c']);
    const onlyTheories = neighbourGroups('A', index, { ...all(), types: new Set<NodeType>(['theory']) });
    expect(onlyTheories.out.map((i) => i.other.id)).toEqual(['B']);
  });
  it('lists the concepts an assumption links', () => {
    expect(neighbourGroups('d', index, all()).assumes.map((n) => n.id)).toEqual(['a']);
    expect(neighbourGroups('a', index, all()).assumedBy.map((n) => n.id)).toEqual(['d']);
  });
});

describe('typeGroups', () => {
  it('groups concepts by family and kind, leaving out empty kinds', () => {
    const groups = typeGroups(index, all());
    const kinds = groups.flatMap((g) => g.types.map((t) => t.type));
    expect(kinds).toContain('theory');
    expect(kinds).not.toContain('equation');
    const property = groups.flatMap((g) => g.types).find((t) => t.type === 'property')!;
    // A→Z by name, the way a reader's language sorts them.
    const names = property.nodes.map((n) => n.label);
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y)));
    expect(property.nodes.map((n) => n.id).sort()).toEqual(['A', 'a', 'c', 'd', 'lone']);
  });
});

describe('connectionsOf', () => {
  it("lists a page's neighbours, and theirs one step further — each once, not the page itself", () => {
    const { first, second, furtherVia } = connectionsOf('a', index);
    // a: A (a relation) and d (an assumption that points to a).
    expect(first.map((r) => r.node.id).sort()).toEqual(['A', 'd']);
    expect(first.find((r) => r.node.id === 'A')!.edges.map((e) => e.id)).toEqual(['e1']);
    // Through A: B, b, c (never a again).
    expect(second.map((s) => s.node.id).sort()).toEqual(['B', 'b', 'c']);
    expect(second.every((s) => s.via.id === 'A')).toBe(true);
    expect(furtherVia('A').length).toBe(3);
    expect(furtherVia('d')).toEqual([]);
  });
});
