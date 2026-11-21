import { describe, expect, it } from 'vitest';
import { clearLines, EVEN_GAP, evenScore, evenWeights, stressLayout, untangleSameLevel } from './evenLayout';
import type { ConceptLayoutInput } from './conceptLayout';
import { countCrossings, countNodeOverlaps, createRng } from './layoutOptimize';
import type { NodeBox, Positions, Segment } from './layoutOptimize';
import { EDGE_LABEL_MIN, relationFontSize } from './concepts';

const box = (radius: number): NodeBox => ({ radius, left: -radius, right: radius, top: -radius, bottom: radius });

describe('the Even arrangement', () => {
  it('spaces a chain evenly: every relation the same length, nothing pulled in', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const boxes = Object.fromEntries(ids.map((id) => [id, box(10)]));
    const links = [
      { s: 'a', t: 'b', length: 200 },
      { s: 'b', t: 'c', length: 200 },
      { s: 'c', t: 'd', length: 200 },
    ];
    const pos = stressLayout(ids, links, boxes, createRng(1));
    const d = (x: string, y: string) => Math.hypot(pos[x].x - pos[y].x, pos[x].y - pos[y].y);
    for (const [s, t] of [['a', 'b'], ['b', 'c'], ['c', 'd']]) expect(d(s, t)).toBeCloseTo(200, -1);
    // A chain comes out straight: the ends are three relations apart.
    expect(d('a', 'd')).toBeCloseTo(600, -1);
  });

  it('keeps unrelated concepts apart by at least their size and a gap', () => {
    const ids = ['hub', 'x', 'y'];
    const boxes = { hub: box(10), x: box(40), y: box(40) };
    const links = [
      { s: 'hub', t: 'x', length: 60 },
      { s: 'hub', t: 'y', length: 60 },
    ];
    const pos = stressLayout(ids, links, boxes, createRng(3));
    const reach = Math.hypot(80, 80) / 2;
    expect(Math.hypot(pos.x.x - pos.y.x, pos.x.y - pos.y.y)).toBeGreaterThan(2 * reach + EVEN_GAP - 20);
  });

  it('moves a concept off a line it sits on, without adding a crossing', () => {
    const boxes = { a: box(10), b: box(10), c: box(10), d: box(10) };
    const segments: Segment[] = [
      ['a', 'b'],
      ['c', 'd'],
    ];
    const pos: Positions = { a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, c: { x: 200, y: 5 }, d: { x: 200, y: 300 } };
    expect(countNodeOverlaps(segments, pos, boxes)).toBe(1);
    const cleared = clearLines(segments, pos, boxes);
    expect(countNodeOverlaps(segments, cleared, boxes)).toBe(0);
    expect(evenScore(segments, cleared, boxes).crossings).toBe(0);
  });
});

describe('crossings between relations of the same standing (Decision 54)', () => {
  // One component: four overview concepts (importance 9) and two details (2); all the same size.
  const ids = ['a', 'b', 'c', 'd', 'x', 'y'];
  const segments: Segment[] = [
    ['a', 'b'],
    ['c', 'd'],
    ['x', 'y'],
  ];
  const input: ConceptLayoutInput = {
    components: [{ ids, segments, labels: [], ties: [] }],
    loneIds: [],
    boxes: Object.fromEntries(ids.map((id) => [id, box(10)])),
    importance: { a: 9, b: 9, c: 9, d: 9, x: 2, y: 2 },
    key: 'test',
  };

  it('weighs a crossing of two overview relations above one of an overview relation and a detail', () => {
    const { cross } = evenWeights(input, 0);
    expect(cross(0, 1)).toBeGreaterThan(cross(0, 2));
    expect(cross(0, 2)).toBe(1);
  });

  it('takes out the overview crossing, moving only what it needs, and never ends worse', () => {
    // a–b and c–d cross at the overview; x–y sits apart.
    const start: Positions = {
      a: { x: 0, y: 0 },
      b: { x: 400, y: 400 },
      c: { x: 400, y: 0 },
      d: { x: 0, y: 400 },
      x: { x: 900, y: 0 },
      y: { x: 900, y: 400 },
    };
    expect(countCrossings(segments.slice(0, 2), start)).toBe(1);
    const pos = untangleSameLevel(input, 0, start);
    expect(countCrossings(segments.slice(0, 2), pos)).toBe(0);
    expect(countNodeOverlaps(segments, pos, input.boxes)).toBe(0);
    const weights = evenWeights(input, 0);
    expect(evenScore(segments, pos, input.boxes, [], weights).crossings).toBeLessThan(
      evenScore(segments, start, input.boxes, [], weights).crossings,
    );
  });
});

describe('relation names', () => {
  it('are never smaller than the minimum, even between the smallest concepts', () => {
    expect(relationFontSize([7, 7], [1, 1])).toBe(EDGE_LABEL_MIN);
  });
});
