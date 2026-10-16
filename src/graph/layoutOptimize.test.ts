import { describe, expect, it } from 'vitest';
import {
  alignWide,
  arrangeComponent,
  countBoxOverlaps,
  countCrossings,
  countNodeOverlaps,
  createRng,
  layoutKey,
  placeNew,
  removeOverlaps,
} from './layoutOptimize';
import type { NodeBox, Positions, Segment } from './layoutOptimize';

const box = (r = 10, labelW = 60, labelH = 16): NodeBox => ({
  radius: r,
  left: -labelW / 2,
  right: labelW / 2,
  top: -r,
  bottom: r + labelH,
});

describe('countCrossings', () => {
  it('counts an X once and ignores edges that share an endpoint', () => {
    const pos: Positions = { a: { x: 0, y: 0 }, b: { x: 10, y: 10 }, c: { x: 0, y: 10 }, d: { x: 10, y: 0 } };
    expect(countCrossings([['a', 'b'], ['c', 'd']], pos)).toBe(1);
    expect(countCrossings([['a', 'b'], ['a', 'c']], pos)).toBe(0);
  });
});

describe('countNodeOverlaps', () => {
  it('counts an edge passing through a third node', () => {
    const pos: Positions = { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 100, y: 0 } };
    const boxes = { a: box(), b: box(), c: box() };
    expect(countNodeOverlaps([['a', 'b']], pos, boxes)).toBe(1);
    pos.c = { x: 100, y: 200 };
    expect(countNodeOverlaps([['a', 'b']], pos, boxes)).toBe(0);
  });
});

describe('removeOverlaps', () => {
  it('leaves no overlapping names, without moving the input', () => {
    const pos: Positions = { a: { x: 0, y: 0 }, b: { x: 5, y: 3 }, c: { x: -4, y: 2 } };
    const boxes = { a: box(), b: box(), c: box() };
    const out = removeOverlaps(pos, boxes);
    expect(countBoxOverlaps(out, boxes)).toBe(0);
    expect(pos.a).toEqual({ x: 0, y: 0 });
  });
});

describe('alignWide', () => {
  it('rotates a vertical chain so its long axis is horizontal', () => {
    const pos: Positions = { a: { x: 0, y: 0 }, b: { x: 1, y: 100 }, c: { x: -1, y: 200 } };
    const out = alignWide(pos);
    const xs = Object.values(out).map((p) => p.x);
    const ys = Object.values(out).map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(Math.max(...ys) - Math.min(...ys));
  });
});

describe('arrangeComponent', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const segments: Segment[] = [
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'd'],
    ['d', 'a'],
    ['a', 'e'],
  ];
  const boxes = Object.fromEntries(ids.map((id) => [id, box()]));

  it('is deterministic for a seed', () => {
    const one = arrangeComponent(ids, segments, boxes, createRng(7));
    const two = arrangeComponent(ids, segments, boxes, createRng(7));
    expect(one.pos).toEqual(two.pos);
  });

  it('leaves no overlapping names and no crossings on a simple cycle', () => {
    const { pos } = arrangeComponent(ids, segments, boxes, createRng(1));
    expect(countBoxOverlaps(pos, boxes)).toBe(0);
    expect(countCrossings(segments, pos)).toBe(0);
  });
});

describe('layoutKey', () => {
  it('ignores the order nodes and edges are listed in', () => {
    const k1 = layoutKey(['a', 'b'], [['a', 'b'], ['b', 'c']], 'v');
    const k2 = layoutKey(['b', 'a'], [['b', 'c'], ['a', 'b']], 'v');
    expect(k1).toBe(k2);
    expect(layoutKey(['a', 'b'], [['a', 'b']], 'other')).not.toBe(layoutKey(['a', 'b'], [['a', 'b']], 'v'));
  });
});

describe('removeOverlaps with a movable set', () => {
  it('moves only the movable node, the whole way', () => {
    const pos: Positions = { fixed: { x: 0, y: 0 }, mover: { x: 4, y: 2 } };
    const boxes = { fixed: box(), mover: box() };
    const out = removeOverlaps(pos, boxes, 60, new Set(['mover']));
    expect(out.fixed).toEqual({ x: 0, y: 0 });
    expect(countBoxOverlaps(out, boxes)).toBe(0);
  });

  it('leaves a pair alone when neither may move', () => {
    const pos: Positions = { a: { x: 0, y: 0 }, b: { x: 4, y: 2 } };
    const out = removeOverlaps(pos, { a: box(), b: box() }, 60, new Set());
    expect(out).toEqual(pos);
  });
});

describe('placeNew', () => {
  // A confirmed row a — b — c — d, 200px apart, plus a far-away z.
  const fixed: Positions = {
    a: { x: 0, y: 0 },
    b: { x: 200, y: 0 },
    c: { x: 400, y: 0 },
    d: { x: 600, y: 0 },
    z: { x: 3000, y: 3000 },
  };
  const ids = [...Object.keys(fixed), 'n1', 'n2', 'lone'];
  const boxes = Object.fromEntries(ids.map((id) => [id, box()]));
  const confirmed: Segment[] = [
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'd'],
  ];
  // n1 hangs off c; n2 hangs off n1 (a chain of two new nodes); lone has no edges.
  const segments: Segment[] = [...confirmed, ['c', 'n1'], ['n1', 'n2']];
  const place = () => placeNew(fixed, ['n1', 'n2', 'lone'], segments, boxes, createRng(3));

  it('never moves an existing node and returns only the new ones', () => {
    const before = structuredClone(fixed);
    const out = place();
    expect(fixed).toEqual(before);
    expect(Object.keys(out).sort()).toEqual(['lone', 'n1', 'n2']);
  });

  it('puts a new node near the concept it connects to', () => {
    const out = place();
    const dist = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
    expect(dist(out.n1, fixed.c)).toBeLessThan(dist(out.n1, fixed.a));
    expect(dist(out.n1, fixed.c)).toBeLessThan(500);
    // the chained node follows its new anchor rather than drifting off
    expect(dist(out.n2, out.n1)).toBeLessThan(500);
  });

  it('keeps every name clear of every other name', () => {
    const out = place();
    expect(countBoxOverlaps({ ...fixed, ...out }, boxes)).toBe(0);
  });

  it('puts an unconnected new node to the right of the graph', () => {
    const out = place();
    expect(out.lone.x).toBeGreaterThan(fixed.z.x);
  });

  it('is deterministic for a seed', () => {
    expect(place()).toEqual(place());
  });

  it('does nothing when there is nothing new', () => {
    expect(placeNew(fixed, [], segments, boxes, createRng(1))).toEqual({});
  });
});
