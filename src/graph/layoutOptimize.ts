// Pure geometry for the concept-map layout search (no Cytoscape here):
// cytoscape draws edges as straight lines between node centres, so crossings
// are counted geometrically — dagre's own objective only sees adjacent ranks
// and misses long edges.

export interface Pos {
  x: number;
  y: number;
}

export type Positions = Record<string, Pos>;
/** [sourceId, targetId] */
export type Segment = [string, string];

export interface NodeBox {
  /** Circle radius — what an edge must not pass through */
  radius: number;
  /** Label-inclusive extent, as offsets from the node centre (left/top ≤ 0) */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const ccw = (a: Pos, b: Pos, c: Pos) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);

export function countCrossings(segments: Segment[], pos: Positions): number {
  let n = 0;
  for (let i = 0; i < segments.length; i++) {
    const [s1, t1] = segments[i];
    for (let j = i + 1; j < segments.length; j++) {
      const [s2, t2] = segments[j];
      if (s1 === s2 || s1 === t2 || t1 === s2 || t1 === t2) continue;
      const a = pos[s1], b = pos[t1], c = pos[s2], d = pos[t2];
      if (ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d)) n++;
    }
  }
  return n;
}

/** Edges that pass through a circle they don't end at — they read as false connections. */
export function countNodeOverlaps(
  segments: Segment[],
  pos: Positions,
  boxes: Record<string, NodeBox>,
): number {
  let n = 0;
  for (const [s, t] of segments) {
    const a = pos[s], b = pos[t];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    for (const id in pos) {
      if (id === s || id === t) continue;
      const p = pos[id];
      const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      if (Math.hypot(a.x + u * dx - p.x, a.y + u * dy - p.y) < boxes[id].radius + 4) n++;
    }
  }
  return n;
}

export function edgeLength(segments: Segment[], pos: Positions): number {
  return segments.reduce((sum, [s, t]) => sum + Math.hypot(pos[s].x - pos[t].x, pos[s].y - pos[t].y), 0);
}

/** Lower is better: visual tangles first, total edge length as the tie-break. */
export interface LayoutScore {
  tangles: number;
  length: number;
}

export function scoreLayout(
  segments: Segment[],
  pos: Positions,
  boxes: Record<string, NodeBox>,
): LayoutScore {
  return {
    tangles: countCrossings(segments, pos) + countNodeOverlaps(segments, pos, boxes),
    length: edgeLength(segments, pos),
  };
}

export const better = (a: LayoutScore, b: LayoutScore) =>
  a.tangles < b.tangles || (a.tangles === b.tangles && a.length < b.length - 1e-6);

/**
 * Greedy clean-up after dagre: swap neighbours within a rank whenever that
 * lowers the score. The pair is re-packed inside its old outer extent, so a
 * swap never pushes into the next node.
 */
export function sweepRanks(
  segments: Segment[],
  start: Positions,
  boxes: Record<string, NodeBox>,
  maxPasses = 12,
): { pos: Positions; score: LayoutScore } {
  const pos: Positions = Object.fromEntries(Object.entries(start).map(([id, p]) => [id, { ...p }]));
  const ranks = new Map<number, string[]>();
  for (const id in pos) {
    const y = Math.round(pos[id].y);
    ranks.set(y, [...(ranks.get(y) ?? []), id]);
  }
  let score = scoreLayout(segments, pos, boxes);
  for (let pass = 0, improved = true; improved && pass < maxPasses; pass++) {
    improved = false;
    for (const ids of ranks.values()) {
      ids.sort((a, b) => pos[a].x - pos[b].x);
      for (let i = 0; i + 1 < ids.length; i++) {
        const a = ids[i], b = ids[i + 1];
        const wa = boxes[a].right - boxes[a].left, wb = boxes[b].right - boxes[b].left;
        const oldA = pos[a].x, oldB = pos[b].x;
        const gap = oldB - wb / 2 - (oldA + wa / 2);
        const left = oldA - wa / 2;
        pos[b] = { ...pos[b], x: left + wb / 2 };
        pos[a] = { ...pos[a], x: left + wb + gap + wa / 2 };
        const next = scoreLayout(segments, pos, boxes);
        if (better(next, score)) {
          score = next;
          improved = true;
          ids[i] = b;
          ids[i + 1] = a;
        } else {
          pos[a] = { ...pos[a], x: oldA };
          pos[b] = { ...pos[b], x: oldB };
        }
      }
    }
  }
  return { pos, score };
}

/** Deterministic PRNG (Park–Miller) so the search is reproducible. */
export function createRng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function shuffled<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Rect {
  x1: number;
  y1: number;
  w: number;
  h: number;
}

function extent(pos: Positions, boxes: Record<string, NodeBox>): Rect {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const id in pos) {
    const p = pos[id], b = boxes[id];
    x1 = Math.min(x1, p.x + b.left);
    x2 = Math.max(x2, p.x + b.right);
    y1 = Math.min(y1, p.y + b.top);
    y2 = Math.max(y2, p.y + b.bottom);
  }
  return { x1, y1, w: x2 - x1, h: y2 - y1 };
}

function shelves(rects: Rect[], rowWidth: number, gap: number): number[][] {
  const rows: number[][] = [[]];
  let x = 0;
  rects.forEach((r, i) => {
    if (x > 0 && x + r.w > rowWidth) {
      rows.push([]);
      x = 0;
    }
    rows[rows.length - 1].push(i);
    x += r.w + gap;
  });
  return rows;
}

const rowSize = (row: number[], rects: Rect[], gap: number) => ({
  w: row.reduce((s, i) => s + rects[i].w, 0) + gap * (row.length - 1),
  h: Math.max(...row.map((i) => rects[i].h)),
});

/**
 * Lays separately-arranged components out side by side so unrelated
 * sub-graphs never interleave. Shelf packing, largest first (as given),
 * rows bottom-aligned — fundamentals sit at the bottom of every component
 * (rankDir BT). Every possible row break is tried; the one that fits a
 * viewport of the given aspect (width / height) at the largest scale wins.
 */
export function packComponents(
  components: Positions[],
  boxes: Record<string, NodeBox>,
  aspect: number,
  gap: number,
): Positions {
  const rects = components.map((pos) => extent(pos, boxes));
  let rows = shelves(rects, Infinity, gap);
  let bestScale = -1;
  let prefix = -gap;
  for (const r of rects) {
    prefix += r.w + gap;
    const candidate = shelves(rects, Math.max(prefix, ...rects.map((q) => q.w)), gap);
    const sizes = candidate.map((row) => rowSize(row, rects, gap));
    const w = Math.max(...sizes.map((z) => z.w));
    const h = sizes.reduce((s, z) => s + z.h, 0) + gap * (sizes.length - 1);
    const scale = Math.min(aspect / w, 1 / h);
    if (scale > bestScale) {
      bestScale = scale;
      rows = candidate;
    }
  }
  const width = Math.max(...rows.map((row) => rowSize(row, rects, gap).w));
  const out: Positions = {};
  let y = 0;
  for (const row of rows) {
    const size = rowSize(row, rects, gap);
    let left = (width - size.w) / 2;
    for (const i of row) {
      const r = rects[i];
      const dx = left - r.x1, dy = y + size.h - r.h - r.y1;
      for (const id in components[i]) out[id] = { x: components[i][id].x + dx, y: components[i][id].y + dy };
      left += r.w + gap;
    }
    y += size.h + gap;
  }
  return out;
}

/** A stable key for a node/edge set — the layout cache is valid while it matches. */
export function layoutKey(ids: string[], segments: Segment[], variant: string): string {
  const text = [variant, ...[...ids].sort(), '|', ...segments.map(([s, t]) => `${s}>${t}`).sort()].join(',');
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
