import { describe, expect, it } from 'vitest';
import {
  alignWide,
  arrangeComponent,
  countBoxOverlaps,
  countCrossings,
  countNodeOverlaps,
  createRng,
  layoutKey,
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
