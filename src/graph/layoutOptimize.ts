// Pure geometry for the concept-map layout search (no Cytoscape here):
// cytoscape draws edges as straight lines between node centres, so crossings
// are counted geometrically. Edge direction plays no part in the layout — a
// relation may point any way on screen; only legibility is scored.

export interface Pos {
  x: number;
  y: number;
}

export type Positions = Record<string, Pos>;
/** [sourceId, targetId] */
export type Segment = [string, string];

export interface NodeBox {
  /** Circle radius */
  radius: number;
  /** Label-inclusive extent, as offsets from the node centre (left/top ≤ 0) */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const BOX_MARGIN = 10;
/** Free length an edge gets beyond its two nodes' footprints — room for the relation name. */
const EDGE_ROOM = 90;
const FORCE_ITERATIONS = 400;

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

/** Liang–Barsky: does segment a→b pass through the rectangle? */
function segmentHitsRect(a: Pos, b: Pos, x1: number, y1: number, x2: number, y2: number): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, a.x - x1) && clip(dx, x2 - a.x) && clip(-dy, a.y - y1) && clip(dy, y2 - a.y) && t0 < t1;
}

/**
 * Edges that pass through a node (circle or name) they don't end at — they
 * read as false connections or cover the name.
 */
export function countNodeOverlaps(
  segments: Segment[],
  pos: Positions,
  boxes: Record<string, NodeBox>,
): number {
  let n = 0;
  for (const [s, t] of segments) {
    const a = pos[s], b = pos[t];
    for (const id in pos) {
      if (id === s || id === t) continue;
      const p = pos[id], box = boxes[id];
      if (segmentHitsRect(a, b, p.x + box.left - 4, p.y + box.top - 4, p.x + box.right + 4, p.y + box.bottom + 4))
        n++;
    }
  }
  return n;
}

/** x/y overlap of two nodes' margin-padded boxes (both > 0 means they overlap). */
function overlapOf(a: string, b: string, pos: Positions, boxes: Record<string, NodeBox>, margin: number) {
  const pa = pos[a], pb = pos[b], ba = boxes[a], bb = boxes[b];
  return {
    x: Math.min(pa.x + ba.right, pb.x + bb.right) - Math.max(pa.x + ba.left, pb.x + bb.left) + margin,
    y: Math.min(pa.y + ba.bottom, pb.y + bb.bottom) - Math.max(pa.y + ba.top, pb.y + bb.top) + margin,
  };
}

/** Pairs of nodes whose label-inclusive boxes (plus a margin) overlap. */
export function countBoxOverlaps(pos: Positions, boxes: Record<string, NodeBox>, margin = BOX_MARGIN): number {
  const ids = Object.keys(pos);
  let n = 0;
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const o = overlapOf(ids[i], ids[j], pos, boxes, margin);
      if (o.x > 0 && o.y > 0) n++;
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
    tangles:
      countCrossings(segments, pos) + countNodeOverlaps(segments, pos, boxes) + countBoxOverlaps(pos, boxes),
    length: edgeLength(segments, pos),
  };
}

export const better = (a: LayoutScore, b: LayoutScore) =>
  a.tangles < b.tangles || (a.tangles === b.tangles && a.length < b.length - 1e-6);

const copy = (pos: Positions): Positions =>
  Object.fromEntries(Object.entries(pos).map(([id, p]) => [id, { ...p }]));

/** Half-diagonal of a node's label-inclusive box: how much room it claims. */
const reach = (b: NodeBox) => Math.hypot(b.right - b.left, b.bottom - b.top) / 2;

/**
 * Spring-electrical layout (Fruchterman–Reingold) of one connected
 * component. Each pair's ideal distance grows with the two label boxes, so
 * long names get the room they need.
 */
export function forceLayout(
  ids: string[],
  segments: Segment[],
  boxes: Record<string, NodeBox>,
  rng: () => number,
  iterations = FORCE_ITERATIONS,
): Positions {
  const n = ids.length;
  const r = ids.map((id) => reach(boxes[id]));
  const k = (i: number, j: number) => EDGE_ROOM + r[i] + r[j];
  const meanK = EDGE_ROOM + (2 * r.reduce((s, v) => s + v, 0)) / Math.max(n, 1);
  const side = meanK * Math.sqrt(n);
  const x = ids.map(() => (rng() - 0.5) * side);
  const y = ids.map(() => (rng() - 0.5) * side);
  const at = new Map(ids.map((id, i) => [id, i]));
  const links = segments.map(([s, t]) => [at.get(s)!, at.get(t)!] as const);
  const t0 = side / 4;
  for (let it = 0; it < iterations; it++) {
    const temp = t0 * (1 - it / iterations) + 1;
    const fx = new Array<number>(n).fill(0);
    const fy = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        let dx = x[i] - x[j], dy = y[i] - y[j];
        let d = Math.hypot(dx, dy);
        if (d < 1e-3) {
          dx = rng() - 0.5;
          dy = rng() - 0.5;
          d = Math.hypot(dx, dy);
        }
        // Repulsion k²/d, applied along the unit vector (dx, dy) / d.
        const f = (k(i, j) * k(i, j)) / (d * d);
        fx[i] += dx * f;
        fy[i] += dy * f;
        fx[j] -= dx * f;
        fy[j] -= dy * f;
      }
    for (const [i, j] of links) {
      if (i === j) continue;
      const dx = x[i] - x[j], dy = y[i] - y[j];
      // Attraction d²/k along the unit vector.
      const f = Math.hypot(dx, dy) / k(i, j);
      fx[i] -= dx * f;
      fy[i] -= dy * f;
      fx[j] += dx * f;
      fy[j] += dy * f;
    }
    for (let i = 0; i < n; i++) {
      const m = Math.hypot(fx[i], fy[i]);
      if (m < 1e-9) continue;
      const step = Math.min(m, temp) / m;
      x[i] += fx[i] * step;
      y[i] += fy[i] * step;
    }
  }
  return Object.fromEntries(ids.map((id, i) => [id, { x: x[i], y: y[i] }]));
}

/** Rotates a component so its long axis runs horizontally — it then packs well into a wide viewport. */
export function alignWide(pos: Positions): Positions {
  const ids = Object.keys(pos);
  if (ids.length < 2) return copy(pos);
  const mx = ids.reduce((s, id) => s + pos[id].x, 0) / ids.length;
  const my = ids.reduce((s, id) => s + pos[id].y, 0) / ids.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const id of ids) {
    const dx = pos[id].x - mx, dy = pos[id].y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const angle = -0.5 * Math.atan2(2 * sxy, sxx - syy);
  const c = Math.cos(angle), s = Math.sin(angle);
  return Object.fromEntries(
    ids.map((id) => {
      const dx = pos[id].x - mx, dy = pos[id].y - my;
      return [id, { x: dx * c - dy * s, y: dx * s + dy * c }];
    }),
  );
}

/** Pushes overlapping label boxes apart along their smaller overlap axis. */
export function removeOverlaps(pos: Positions, boxes: Record<string, NodeBox>, maxPasses = 60): Positions {
  const out = copy(pos);
  const ids = Object.keys(out);
  const centre = (id: string) => ({
    x: out[id].x + (boxes[id].left + boxes[id].right) / 2,
    y: out[id].y + (boxes[id].top + boxes[id].bottom) / 2,
  });
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j];
        const o = overlapOf(a, b, out, boxes, BOX_MARGIN);
        if (o.x <= 0 || o.y <= 0) continue;
        moved = true;
        const ca = centre(a), cb = centre(b);
        if (o.x < o.y) {
          const dir = ca.x <= cb.x ? -1 : 1;
          out[a].x += (dir * o.x) / 2;
          out[b].x -= (dir * o.x) / 2;
        } else {
          const dir = ca.y <= cb.y ? -1 : 1;
          out[a].y += (dir * o.y) / 2;
          out[b].y -= (dir * o.y) / 2;
        }
      }
    if (!moved) break;
  }
  return out;
}

/**
 * Greedy clean-up: swap the positions of any two nodes whenever that lowers
 * the score — untangles crossings the force layout settled into.
 */
export function swapNodes(
  segments: Segment[],
  start: Positions,
  boxes: Record<string, NodeBox>,
  maxPasses = 4,
): { pos: Positions; score: LayoutScore } {
  const pos = copy(start);
  const ids = Object.keys(pos);
  let score = scoreLayout(segments, pos, boxes);
  for (let pass = 0, improved = true; improved && pass < maxPasses; pass++) {
    improved = false;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j];
        [pos[a], pos[b]] = [pos[b], pos[a]];
        const next = scoreLayout(segments, pos, boxes);
        if (better(next, score)) {
          score = next;
          improved = true;
        } else {
          [pos[a], pos[b]] = [pos[b], pos[a]];
        }
      }
  }
  return { pos, score };
}

/** One full arrangement of a component: force layout → widen → de-overlap → swap clean-up. */
export function arrangeComponent(
  ids: string[],
  segments: Segment[],
  boxes: Record<string, NodeBox>,
  rng: () => number,
): { pos: Positions; score: LayoutScore } {
  const spread = removeOverlaps(alignWide(forceLayout(ids, segments, boxes, rng)), boxes);
  const pos = removeOverlaps(swapNodes(segments, spread, boxes).pos, boxes);
  return { pos, score: scoreLayout(segments, pos, boxes) };
}

/** Deterministic PRNG (Park–Miller) so the search is reproducible. */
export function createRng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
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
 * rows bottom-aligned. Every possible row break is tried; the one that fits
 * a viewport of the given aspect (width / height) at the largest scale wins.
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
