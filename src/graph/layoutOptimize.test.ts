import { describe, expect, it } from 'vitest';
import {
  alignWide,
  arrangeComponent,
  countBoxOverlaps,
  countCrossings,
  countNodeOverlaps,
  createRng,
  forceLayout,
  labelCovers,
  labelRoom,
  layoutKey,
  placeNew,
  removeOverlaps,
  stretchForLabels,
} from './layoutOptimize';
import type { NodeBox, Positions, Segment } from './layoutOptimize';

const box = (r = 10, labelW = 60, labelH = 16): NodeBox => ({
  radius: r,
  left: -labelW / 2,
  right: labelW / 2,
  top: -r,
  bottom: r + labelH,
});

describe('relation names', () => {
  const name = { length: 120, thickness: 14 };
  it('sit on the visible part of the line: free when it is long enough, covered by what sits on them', () => {
    const boxes = { a: box(40, 0, 0), b: box(10, 0, 0), c: box(10, 0, 0) };
    const pos: Positions = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, c: { x: 0, y: 500 } };
    expect(labelCovers([['a', 'b']], [name], pos, boxes).size).toBe(0);
    // Centred between the circles (x 40…290), not between the centres.
    pos.c = { x: 165, y: 12 };
    expect(labelCovers([['a', 'b']], [name], pos, boxes).get(0)).toEqual(['c']);
    pos.c = { x: 165, y: 40 };
    expect(labelCovers([['a', 'b']], [name], pos, boxes).size).toBe(0);
  });
  it('a line too short for its name is covered by its own ends, and a concept name below a circle counts too', () => {
    const boxes = { a: box(40, 0, 0), b: box(10, 0, 0), c: box(10, 80, 20) };
    expect(labelCovers([['a', 'b']], [name], { a: { x: 0, y: 0 }, b: { x: 120, y: 0 } }, boxes).get(0)).toEqual(['a', 'b']);
    // c's circle is clear of the name, but its own name (below it) runs into it.
    const pos: Positions = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, c: { x: 165, y: -30 } };
    expect(labelCovers([['a', 'b']], [name], pos, boxes).get(0)).toEqual(['c']);
  });
  it('the stretch pass finishes the job, moving only what may move', () => {
    const boxes = { a: box(30), b: box(30), c: box(30) };
    const segments: Segment[] = [['a', 'b'], ['b', 'c']];
    const labels = [{ length: 300, thickness: 20, arrow: 25 }, undefined];
    const pos: Positions = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, c: { x: 100, y: 200 } };
    const out = stretchForLabels(pos, segments, labels, boxes);
    expect(Math.hypot(out.a.x - out.b.x, out.a.y - out.b.y)).toBeGreaterThanOrEqual(labelRoom(30, 30, labels[0]) - 0.5);
    const onlyA = stretchForLabels(pos, segments, labels, boxes, new Set(['a']));
    expect(onlyA.b).toEqual(pos.b);
    expect(labelCovers(segments, labels, onlyA, boxes).size).toBe(0);
  });
  it('the force layout gives a relation the room its name needs', () => {
    const boxes = { a: box(30), b: box(30) };
    const long = { length: 400, thickness: 20 };
    const pos = forceLayout(['a', 'b'], [['a', 'b']], boxes, createRng(3), 400, { labels: [long] });
    const d = Math.hypot(pos.a.x - pos.b.x, pos.a.y - pos.b.y);
    expect(d).toBeGreaterThanOrEqual(labelRoom(30, 30, long) * 0.97);
    const plain = forceLayout(['a', 'b'], [['a', 'b']], boxes, createRng(3));
    expect(Math.hypot(plain.a.x - plain.b.x, plain.a.y - plain.b.y)).toBeLessThan(d);
  });
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
