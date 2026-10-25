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

/**
 * A relation's name as the layout sees it: a box along its line (length ×
 * thickness, model px), centred on the visible part of the line — between the
 * two circles, which is where Cytoscape draws it. Indexed like the segments.
 */
export interface SegmentLabel {
  length: number;
  thickness: number;
  /**
   * How much the target's arrowhead shortens the drawn line (model px). The
   * name sits in the middle of what's drawn, so it shifts by half of this
   * towards the source.
   */
  arrow?: number;
}

export type SegmentLabels = (SegmentLabel | undefined)[];

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
// Pushed-apart boxes end 1px past the margin: stopping exactly on it leaves a
// floating-point overlap (~1e-15) that the score would count as a tangle.
const SLACK = 1;
/** Free length an edge gets beyond its two nodes' footprints — room for the relation name. */
const EDGE_ROOM = 90;
/**
 * Every ideal distance is scaled by this: below 1 the map packs tighter than
 * the label boxes alone would ask for (removeOverlaps still keeps names apart).
 */
export const SPACING = 0.84;
const FORCE_ITERATIONS = 400;

/** Clear space either side of a relation name, along its line. */
const LABEL_MARGIN = 14;
/** How hard a relation too short for its name pushes its ends apart. */
const LABEL_PUSH = 2;

/**
 * Big concepts keep their distance: two circles keep at least this share of
 * the smaller one's radius between their rims — a circle-width between two
 * landmarks, the usual margin between two specific concepts.
 */
const CLEARANCE = 1.5;

/** The least centre-to-centre distance two circles keep (CLEARANCE). */
export const clearance = (radiusA: number, radiusB: number): number =>
  radiusA + radiusB + Math.max(BOX_MARGIN, CLEARANCE * Math.min(radiusA, radiusB));

/**
 * How hard a concept pushes the others away grows with its circle:
 * (radius ÷ the median radius)^MASS_EXP, kept within [MASS_MIN, MASS_MAX].
 * Big concepts spread out; small ones barely push, so they gather around the
 * big concept they hang off instead of drifting to the edge.
 */
const MASS_EXP = 0.5;
const MASS_MIN = 0.3;
const MASS_MAX = 3;
/**
 * A concept's pull towards its most general neighbour, as a multiple of a
 * relation's usual pull — it settles beside that one, not between several.
 */
const PARENT_PULL = 3;
/** Free length a relation gets between its two circles when its name needs less. */
const LINK_GAP = SPACING * EDGE_ROOM;

/** How long a relation must be for its name to fit between its two circles. */
export const labelRoom = (radiusA: number, radiusB: number, label: SegmentLabel | undefined): number =>
  radiusA + radiusB + (label ? label.length + (label.arrow ?? 0) + 2 * LABEL_MARGIN : 0);

interface LabelFrame {
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  /** half the name's length, half its thickness */
  hl: number;
  ht: number;
  /** the line's visible length, between the circles */
  visible: number;
}

function labelFrame(a: Pos, b: Pos, ra: number, rb: number, label: SegmentLabel): LabelFrame | null {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (d < 1e-6) return null;
  const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
  const arrow = label.arrow ?? 0;
  const from = { x: a.x + ux * ra, y: a.y + uy * ra };
  const to = { x: b.x - ux * (rb + arrow), y: b.y - uy * (rb + arrow) };
  return {
    cx: (from.x + to.x) / 2,
    cy: (from.y + to.y) / 2,
    ux,
    uy,
    hl: label.length / 2,
    ht: label.thickness / 2,
    visible: d - ra - rb - arrow,
  };
}

/** Does a circle touch the name's (rotated) box? */
function frameHitsCircle(f: LabelFrame, p: Pos, r: number): boolean {
  const dx = p.x - f.cx, dy = p.y - f.cy;
  const along = Math.max(Math.abs(dx * f.ux + dy * f.uy) - f.hl, 0);
  const across = Math.max(Math.abs(-dx * f.uy + dy * f.ux) - f.ht, 0);
  return along * along + across * across < r * r;
}

/** Does an axis-aligned box touch the name's (rotated) box? Separating axes: x, y, along, across. */
function frameHitsRect(f: LabelFrame, x1: number, y1: number, x2: number, y2: number): boolean {
  const hx = (x2 - x1) / 2, hy = (y2 - y1) / 2;
  const dx = (x1 + x2) / 2 - f.cx, dy = (y1 + y2) / 2 - f.cy;
  // The name's half-extents projected onto x and y.
  const fx = f.hl * Math.abs(f.ux) + f.ht * Math.abs(f.uy);
  const fy = f.hl * Math.abs(f.uy) + f.ht * Math.abs(f.ux);
  if (Math.abs(dx) > hx + fx || Math.abs(dy) > hy + fy) return false;
  // The box's half-extents projected onto the name's own axes.
  const along = Math.abs(dx * f.ux + dy * f.uy), across = Math.abs(-dx * f.uy + dy * f.ux);
  const ba = hx * Math.abs(f.ux) + hy * Math.abs(f.uy), bc = hx * Math.abs(f.uy) + hy * Math.abs(f.ux);
  return along <= f.hl + ba && across <= f.ht + bc;
}

/** Less than this below a circle is its border, not a name (names are 12px and up). */
const NAME_BELOW_MIN = 4;

/** Does this node — its circle, or its own name under it — cover the relation name? */
const coversName = (f: LabelFrame, p: Pos, b: NodeBox): boolean =>
  frameHitsCircle(f, p, b.radius) ||
  // A name under the circle — not just its border, which a measured box includes.
  (b.bottom > b.radius + NAME_BELOW_MIN && frameHitsRect(f, p.x + b.left, p.y + b.radius, p.x + b.right, p.y + b.bottom));

/**
 * For each relation with a name, the nodes covering it: a circle over the
 * name, or a concept's own name (under a small circle) over it. A line too
 * short for its name lists its own ends. Only nodes in `pos` count.
 */
export function labelCovers(
  segments: Segment[],
  labels: SegmentLabels,
  pos: Positions,
  boxes: Record<string, NodeBox>,
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  segments.forEach(([s, t], i) => {
    const label = labels[i];
    if (!label || !pos[s] || !pos[t]) return;
    const f = labelFrame(pos[s], pos[t], boxes[s].radius, boxes[t].radius, label);
    if (!f) return;
    const covers = f.visible < label.length ? [s, t] : [];
    for (const id in pos) {
      if (covers.includes(id)) continue;
      if (coversName(f, pos[id], boxes[id])) covers.push(id);
    }
    if (covers.length) out.set(i, covers);
  });
  return out;
}

const ccw = (a: Pos, b: Pos, c: Pos) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);

/** Do two relations cross? (Two that share a concept never count.) */
function crosses([s1, t1]: Segment, [s2, t2]: Segment, pos: Positions): boolean {
  if (s1 === s2 || s1 === t2 || t1 === s2 || t1 === t2) return false;
  const a = pos[s1], b = pos[t1], c = pos[s2], d = pos[t2];
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

export function countCrossings(segments: Segment[], pos: Positions): number {
  let n = 0;
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) if (crosses(segments[i], segments[j], pos)) n++;
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
  for (const seg of segments) for (const id in pos) if (passesThrough(seg, id, pos, boxes)) n++;
  return n;
}

/** Does the relation pass through a concept (its circle or name, padded 4px) it doesn't end at? */
function passesThrough([s, t]: Segment, id: string, pos: Positions, boxes: Record<string, NodeBox>): boolean {
  if (id === s || id === t) return false;
  const p = pos[id], box = boxes[id];
  return segmentHitsRect(pos[s], pos[t], p.x + box.left - 4, p.y + box.top - 4, p.x + box.right + 4, p.y + box.bottom + 4);
}

/** x/y overlap of two nodes' margin-padded boxes (both > 0 means they overlap). */
function overlapOf(a: string, b: string, pos: Positions, boxes: Record<string, NodeBox>, margin: number) {
  const pa = pos[a], pb = pos[b], ba = boxes[a], bb = boxes[b];
  return {
    x: Math.min(pa.x + ba.right, pb.x + bb.right) - Math.max(pa.x + ba.left, pb.x + bb.left) + margin,
    y: Math.min(pa.y + ba.bottom, pb.y + bb.bottom) - Math.max(pa.y + ba.top, pb.y + bb.top) + margin,
  };
}

function boxesOverlap(a: string, b: string, pos: Positions, boxes: Record<string, NodeBox>, margin = BOX_MARGIN) {
  const o = overlapOf(a, b, pos, boxes, margin);
  return o.x > 0 && o.y > 0;
}

/** Pairs of nodes whose label-inclusive boxes (plus a margin) overlap. */
export function countBoxOverlaps(pos: Positions, boxes: Record<string, NodeBox>, margin = BOX_MARGIN): number {
  const ids = Object.keys(pos);
  let n = 0;
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      if (boxesOverlap(ids[i], ids[j], pos, boxes, margin)) n++;
    }
  return n;
}

/** Pairs of circles closer than their clearance — big concepts crowding each other. */
/** A relation's ideal length: both circles plus a short gap, or what its name needs if that's more. */
export const idealLength = (radiusA: number, radiusB: number, label: SegmentLabel | undefined): number =>
  Math.max(radiusA + radiusB + LINK_GAP, labelRoom(radiusA, radiusB, label));

/**
 * A relation stretched past this many times its ideal length reads as a
 * stray line across the map: it counts as a tangle, and once more for each
 * further multiple — so the search won't trade a few crossings for one.
 */
const STRETCH_LIMIT = 2.5;

function stretchCost([s, t]: Segment, label: SegmentLabel | undefined, pos: Positions, boxes: Record<string, NodeBox>) {
  const d = Math.hypot(pos[s].x - pos[t].x, pos[s].y - pos[t].y);
  return Math.floor(d / (STRETCH_LIMIT * idealLength(boxes[s].radius, boxes[t].radius, label)));
}

/** Relations stretched far past their ideal length, weighted by how far (STRETCH_LIMIT). */
export function countStretched(
  segments: Segment[],
  pos: Positions,
  boxes: Record<string, NodeBox>,
  labels: SegmentLabels = [],
): number {
  return segments.reduce((n, seg, e) => n + stretchCost(seg, labels[e], pos, boxes), 0);
}

export function countCrowded(pos: Positions, boxes: Record<string, NodeBox>): number {
  const ids = Object.keys(pos);
  let n = 0;
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) if (crowds(ids[i], ids[j], pos, boxes)) n++;
  return n;
}

function crowds(a: string, b: string, pos: Positions, boxes: Record<string, NodeBox>): boolean {
  const pa = pos[a], pb = pos[b];
  return Math.hypot(pa.x - pb.x, pa.y - pb.y) < clearance(boxes[a].radius, boxes[b].radius) - 0.5;
}

export function edgeLength(segments: Segment[], pos: Positions): number {
  return segments.reduce((sum, [s, t]) => sum + Math.hypot(pos[s].x - pos[t].x, pos[s].y - pos[t].y), 0);
}

/** Lower is better: visual tangles first, total edge length as the tie-break. */
export interface LayoutScore {
  tangles: number;
  length: number;
}

/** A covered relation name costs more than a crossing: it can't be read at all. */
const COVERED_LABEL_WEIGHT = 2;

export function scoreLayout(
  segments: Segment[],
  pos: Positions,
  boxes: Record<string, NodeBox>,
  labels: SegmentLabels = [],
): LayoutScore {
  return {
    tangles:
      countCrossings(segments, pos) +
      countNodeOverlaps(segments, pos, boxes) +
      countBoxOverlaps(pos, boxes) +
      countCrowded(pos, boxes) +
      countStretched(segments, pos, boxes, labels) +
      COVERED_LABEL_WEIGHT * labelCovers(segments, labels, pos, boxes).size,
    length: edgeLength(segments, pos),
  };
}

export const better = (a: LayoutScore, b: LayoutScore) =>
  a.tangles < b.tangles || (a.tangles === b.tangles && a.length < b.length - 1e-6);

const copy = (pos: Positions): Positions =>
  Object.fromEntries(Object.entries(pos).map(([id, p]) => [id, { ...p }]));

/** Half-diagonal of a node's label-inclusive box: how much room it claims. */
const reach = (b: NodeBox) => Math.hypot(b.right - b.left, b.bottom - b.top) / 2;

export interface ForceOptions {
  /** Nodes that keep these positions: they push and pull but never move. */
  fixed?: Positions;
  /** Starting positions for movable nodes (otherwise random). */
  start?: Positions;
  /** Largest first step; small for a local settle around a good start. */
  temperature?: number;
  /** Relation names (indexed like the segments): each relation gets the length its name needs. */
  labels?: SegmentLabels;
  /**
   * Pairs pulled together like relations but never drawn — a concept and what
   * it assumes — so they sit near each other. Not scored: there's no line to cross.
   */
  ties?: Segment[];
}

/**
 * Spring-electrical layout (Fruchterman–Reingold) of one connected
 * component. Big concepts push harder and keep their clearance; each
 * relation is as long as its two circles and its name need, and a concept
 * is pulled hardest towards its most general neighbour.
 */
export function forceLayout(
  ids: string[],
  segments: Segment[],
  boxes: Record<string, NodeBox>,
  rng: () => number,
  iterations = FORCE_ITERATIONS,
  { fixed = {}, start = {}, temperature, labels = [], ties = [] }: ForceOptions = {},
): Positions {
  const n = ids.length;
  const r = ids.map((id) => reach(boxes[id]));
  const radius = ids.map((id) => boxes[id].radius);
  // Closer than this, a pair pushes apart hard: their boxes, and for big
  // circles the clearance between them.
  const contactAt = (i: number, j: number) =>
    Math.max(SPACING * (r[i] + r[j]) + BOX_MARGIN, clearance(radius[i], radius[j]));
  const meanK = SPACING * (EDGE_ROOM + (2 * r.reduce((s, v) => s + v, 0)) / Math.max(n, 1));
  // Long-range repulsion: one typical spacing, scaled by both concepts' mass.
  const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0;
  const typicalK = SPACING * (EDGE_ROOM + 2 * median(r));
  const medianRadius = Math.max(median(radius), 1);
  const mass = radius.map((v) => Math.min(MASS_MAX, Math.max(MASS_MIN, (v / medianRadius) ** MASS_EXP)));
  const side = meanK * Math.sqrt(n);
  const initial = ids.map((id) => fixed[id] ?? start[id] ?? { x: (rng() - 0.5) * side, y: (rng() - 0.5) * side });
  const x = initial.map((p) => p.x);
  const y = initial.map((p) => p.y);
  const pinned = ids.map((id) => id in fixed);
  const at = new Map(ids.map((id, i) => [id, i]));
  // A relation's ideal length: both circles plus a short gap, or — when its
  // name needs more — plus the name. `room` is the least it may be.
  const pairs = [...segments, ...ties.filter(([s, t]) => at.has(s) && at.has(t))].map(
    ([s, t]) => [at.get(s)!, at.get(t)!] as const,
  );
  // Each concept's most general neighbour, if it's bigger than the concept itself.
  const parent = ids.map(() => -1);
  for (const [i, j] of pairs)
    for (const [a, b] of [[i, j], [j, i]] as const)
      if (radius[b] > radius[a] && (parent[a] < 0 || radius[b] > radius[parent[a]])) parent[a] = b;
  const links = pairs.map(([i, j], e) => {
    const room = labelRoom(radius[i], radius[j], labels[e]);
    const pull = parent[i] === j || parent[j] === i ? PARENT_PULL : 1;
    return { i, j, room, pull, ideal: idealLength(radius[i], radius[j], labels[e]) };
  });
  const t0 = temperature ?? side / 4;
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
        // Repulsion typicalK²·massᵢ·massⱼ/d, applied along the unit vector
        // (dx, dy) / d, plus a contact push while the pair is too close.
        const near = contactAt(i, j);
        const contact = d < near ? (near - d) / d : 0;
        const f = (typicalK * typicalK * mass[i] * mass[j]) / (d * d) + contact;
        fx[i] += dx * f;
        fy[i] += dy * f;
        fx[j] -= dx * f;
        fy[j] -= dy * f;
      }
    for (const { i, j, room, pull, ideal } of links) {
      if (i === j) continue;
      const dx = x[i] - x[j], dy = y[i] - y[j];
      const d = Math.max(Math.hypot(dx, dy), 1e-3);
      // Attraction pull·d²/ideal along the unit vector — but while the line is
      // too short for its name, a firm push apart instead (pulling would win).
      const f = d < room ? -LABEL_PUSH * ((room - d) / d) : (pull * d) / ideal;
      fx[i] -= dx * f;
      fy[i] -= dy * f;
      fx[j] += dx * f;
      fy[j] += dy * f;
    }
    for (let i = 0; i < n; i++) {
      const m = Math.hypot(fx[i], fy[i]);
      if (pinned[i] || m < 1e-9) continue;
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

/**
 * Pushes overlapping label boxes apart along their smaller overlap axis.
 * With `movable`, only those nodes move: a pair with one movable node moves
 * it the whole way, a pair with none is left alone.
 */
export function removeOverlaps(
  pos: Positions,
  boxes: Record<string, NodeBox>,
  maxPasses = 60,
  movable?: Set<string>,
): Positions {
  const out = copy(pos);
  const ids = Object.keys(out);
  const canMove = (id: string) => !movable || movable.has(id);
  const centre = (id: string) => ({
    x: out[id].x + (boxes[id].left + boxes[id].right) / 2,
    y: out[id].y + (boxes[id].top + boxes[id].bottom) / 2,
  });
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j];
        const ma = canMove(a), mb = canMove(b);
        if (!ma && !mb) continue;
        // Each side's share of the push: half each, or all of it for the only movable one.
        const sa = ma ? (mb ? 0.5 : 1) : 0, sb = mb ? (ma ? 0.5 : 1) : 0;
        const o = overlapOf(a, b, out, boxes, BOX_MARGIN);
        if (o.x <= 0 || o.y <= 0) {
          // Clear boxes — but two big circles also keep their clearance.
          const dx = out[b].x - out[a].x, dy = out[b].y - out[a].y;
          const d = Math.hypot(dx, dy);
          const short = clearance(boxes[a].radius, boxes[b].radius) - d;
          if (short <= 0) continue;
          moved = true;
          const ux = d > 1e-6 ? dx / d : 1, uy = d > 1e-6 ? dy / d : 0;
          out[a].x -= ux * (short + SLACK) * sa;
          out[a].y -= uy * (short + SLACK) * sa;
          out[b].x += ux * (short + SLACK) * sb;
          out[b].y += uy * (short + SLACK) * sb;
          continue;
        }
        moved = true;
        const ca = centre(a), cb = centre(b);
        if (o.x < o.y) {
          const dir = ca.x <= cb.x ? -1 : 1;
          out[a].x += dir * (o.x + SLACK) * sa;
          out[b].x -= dir * (o.x + SLACK) * sb;
        } else {
          const dir = ca.y <= cb.y ? -1 : 1;
          out[a].y += dir * (o.y + SLACK) * sa;
          out[b].y -= dir * (o.y + SLACK) * sb;
        }
      }
    if (!moved) break;
  }
  return out;
}

/** How far around a new node the existing graph takes part in placing it. */
const PLACE_RADIUS = 600;
const PLACE_ITERATIONS = 150;

/**
 * Places new nodes into an existing layout without moving any existing node.
 * A new node starts at the centre of its already-placed neighbours (chains
 * of new nodes follow their anchor), settles in a local force run against
 * the fixed nodes around it, then is pushed clear of every name it overlaps.
 * Unconnected new nodes go in a column to the right of the graph.
 */
export function placeNew(
  fixed: Positions,
  newIds: string[],
  segments: Segment[],
  boxes: Record<string, NodeBox>,
  rng: () => number,
  labels: SegmentLabels = [],
): Positions {
  if (newIds.length === 0) return {};
  const isNew = new Set(newIds);
  const touchingIdx = segments.map((_, i) => i).filter((i) => isNew.has(segments[i][0]) || isNew.has(segments[i][1]));
  const touching = touchingIdx.map((i) => segments[i]);
  const neighbours = (id: string) =>
    touching.flatMap(([s, t]) => (s === id ? [t] : t === id ? [s] : []));

  const start: Positions = {};
  for (let pass = 0; pass < newIds.length; pass++)
    for (const id of newIds) {
      if (start[id]) continue;
      const anchors = neighbours(id)
        .map((n) => fixed[n] ?? start[n])
        .filter((p): p is Pos => Boolean(p));
      if (anchors.length === 0) continue;
      start[id] = {
        x: anchors.reduce((s, p) => s + p.x, 0) / anchors.length + (rng() - 0.5) * 60,
        y: anchors.reduce((s, p) => s + p.y, 0) / anchors.length + (rng() - 0.5) * 60,
      };
    }
  const fixedIds = Object.keys(fixed);
  const right = fixedIds.length ? Math.max(...fixedIds.map((id) => fixed[id].x + boxes[id].right)) : 0;
  let column = fixedIds.length ? Math.min(...fixedIds.map((id) => fixed[id].y)) : 0;
  for (const id of newIds)
    if (!start[id]) {
      start[id] = { x: right + EDGE_ROOM - boxes[id].left, y: column };
      column += boxes[id].bottom - boxes[id].top + EDGE_ROOM;
    }

  // Only the neighbourhood takes part: far-away nodes would push the new
  // ones outwards for no visible benefit.
  const near = fixedIds.filter(
    (id) =>
      touching.some(([s, t]) => s === id || t === id) ||
      newIds.some((n) => Math.hypot(fixed[id].x - start[n].x, fixed[id].y - start[n].y) < PLACE_RADIUS),
  );
  const ids = [...near, ...newIds];
  const inRun = new Set(ids);
  const inRunIdx = touchingIdx.filter((i) => inRun.has(segments[i][0]) && inRun.has(segments[i][1]));
  const settled = forceLayout(
    ids,
    inRunIdx.map((i) => segments[i]),
    boxes,
    rng,
    PLACE_ITERATIONS,
    {
      fixed: Object.fromEntries(near.map((id) => [id, fixed[id]])),
      start,
      temperature: EDGE_ROOM,
      labels: inRunIdx.map((i) => labels[i]),
    },
  );
  const clear = removeOverlaps(
    { ...fixed, ...Object.fromEntries(newIds.map((id) => [id, settled[id]])) },
    boxes,
    60,
    isNew,
  );
  // Only the new nodes move: they make the room their relations' names need.
  const roomy = stretchForLabels(clear, touching, touchingIdx.map((i) => labels[i]), boxes, isNew);
  return Object.fromEntries(newIds.map((id) => [id, roomy[id]]));
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
  labels: SegmentLabels = [],
): { pos: Positions; score: LayoutScore } {
  const pos = copy(start);
  const ids = Object.keys(pos);
  // A swap only changes what involves its two nodes: the relations at either
  // of them ("moved"), and the terms that name one of them. Each trial scores
  // just that part before and after, instead of the whole layout — the same
  // score as scoreLayout, for a fraction of the work.
  const incident = new Map(ids.map((id) => [id, [] as number[]]));
  segments.forEach(([s, t], e) => {
    incident.get(s)?.push(e);
    if (t !== s) incident.get(t)?.push(e);
  });
  const frameOf = (e: number) => {
    const [s, t] = segments[e], label = labels[e];
    return label ? labelFrame(pos[s], pos[t], boxes[s].radius, boxes[t].radius, label) : null;
  };
  // Each relation name's frame, how many nodes cover it, and whether its line
  // is too short for it (covered by its own ends) — kept up to date on a swap.
  const frames = segments.map((_, e) => frameOf(e));
  const hitsOf = (f: LabelFrame | null) => (f ? ids.filter((id) => coversName(f, pos[id], boxes[id])).length : 0);
  const isShort = (f: LabelFrame | null, e: number) => Boolean(f && f.visible < labels[e]!.length);
  const hits = frames.map(hitsOf);
  const short = frames.map(isShort);
  const hitBy = (e: number, id: string) => (frames[e] && coversName(frames[e]!, pos[id], boxes[id]) ? 1 : 0);
  const span = ([s, t]: Segment) => Math.hypot(pos[s].x - pos[t].x, pos[s].y - pos[t].y);

  /** The terms that involve a or b; the moved relations' names in full. */
  const local = (a: string, b: string, moved: number[], isMoved: Set<number>) => {
    let tangles = 0, length = 0;
    const movedFrames = moved.map(frameOf);
    const movedHits = movedFrames.map(hitsOf);
    moved.forEach((e, k) => {
      for (let f = 0; f < segments.length; f++)
        if ((!isMoved.has(f) || f > e) && crosses(segments[e], segments[f], pos)) tangles++;
      for (const id of ids) if (passesThrough(segments[e], id, pos, boxes)) tangles++;
      if (movedHits[k] > 0 || isShort(movedFrames[k], e)) tangles += COVERED_LABEL_WEIGHT;
      tangles += stretchCost(segments[e], labels[e], pos, boxes);
      length += span(segments[e]);
    });
    segments.forEach((seg, e) => {
      if (isMoved.has(e)) return;
      if (passesThrough(seg, a, pos, boxes)) tangles++;
      if (passesThrough(seg, b, pos, boxes)) tangles++;
    });
    for (const id of ids)
      for (const x of [a, b])
        if (id !== a && id !== b && (x === a || id !== a)) {
          if (boxesOverlap(x, id, pos, boxes)) tangles++;
          if (crowds(x, id, pos, boxes)) tangles++;
        }
    if (boxesOverlap(a, b, pos, boxes)) tangles++;
    if (crowds(a, b, pos, boxes)) tangles++;
    return { tangles, length, movedFrames, movedHits };
  };

  let score = scoreLayout(segments, pos, boxes, labels);
  for (let pass = 0, improved = true; improved && pass < maxPasses; pass++) {
    improved = false;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j];
        const isMoved = new Set([...incident.get(a)!, ...incident.get(b)!]);
        const moved = [...isMoved];
        // The other names: only a's and b's cover can change.
        const was = segments.map((_, e) => (isMoved.has(e) ? 0 : hitBy(e, a) + hitBy(e, b)));
        const before = local(a, b, moved, isMoved);
        [pos[a], pos[b]] = [pos[b], pos[a]];
        const after = local(a, b, moved, isMoved);
        let names = 0;
        const nextHits = hits.map((h, e) => {
          if (isMoved.has(e)) return h;
          const next = h - was[e] + hitBy(e, a) + hitBy(e, b);
          names += COVERED_LABEL_WEIGHT * (Number(next > 0 || short[e]) - Number(h > 0 || short[e]));
          return next;
        });
        const next = {
          tangles: score.tangles + after.tangles - before.tangles + names,
          length: score.length + after.length - before.length,
        };
        if (better(next, score)) {
          score = next;
          improved = true;
          nextHits.forEach((h, e) => (hits[e] = h));
          moved.forEach((e, k) => {
            frames[e] = after.movedFrames[k];
            hits[e] = after.movedHits[k];
            short[e] = isShort(frames[e], e);
          });
        } else {
          [pos[a], pos[b]] = [pos[b], pos[a]];
        }
      }
  }
  return { pos, score: scoreLayout(segments, pos, boxes, labels) };
}

/** One full arrangement of a component: force layout → widen → de-overlap → swap clean-up. */
export function arrangeComponent(
  ids: string[],
  segments: Segment[],
  boxes: Record<string, NodeBox>,
  rng: () => number,
  labels: SegmentLabels = [],
  ties: Segment[] = [],
): { pos: Positions; score: LayoutScore } {
  const laid = forceLayout(ids, segments, boxes, rng, FORCE_ITERATIONS, { labels, ties });
  const spread = removeOverlaps(alignWide(laid), boxes);
  const swapped = removeOverlaps(swapNodes(segments, spread, boxes, 4, labels).pos, boxes);
  const pos = stretchForLabels(swapped, segments, labels, boxes);
  return { pos, score: scoreLayout(segments, pos, boxes, labels) };
}

const STRETCH_ROUNDS = 6;

/**
 * The force layout gets most relations their room, not all — a node pulled
 * by many neighbours gives way. This finishes the job: every relation still
 * too short for its name moves its (movable) ends apart along its line, then
 * names that now overlap are pushed apart again; a few rounds settle it.
 */
export function stretchForLabels(
  start: Positions,
  segments: Segment[],
  labels: SegmentLabels,
  boxes: Record<string, NodeBox>,
  movable?: Set<string>,
): Positions {
  let pos = copy(start);
  const canMove = (id: string) => !movable || movable.has(id);
  for (let round = 0; round < STRETCH_ROUNDS; round++) {
    let short = false;
    segments.forEach(([s, t], i) => {
      const a = pos[s], b = pos[t];
      if (!labels[i] || !a || !b || s === t) return;
      const room = labelRoom(boxes[s].radius, boxes[t].radius, labels[i]);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d >= room - 0.5 || (!canMove(s) && !canMove(t))) return;
      short = true;
      const ux = d > 1e-6 ? (b.x - a.x) / d : 1, uy = d > 1e-6 ? (b.y - a.y) / d : 0;
      const gap = room - d + SLACK;
      const share = canMove(s) && canMove(t) ? gap / 2 : gap;
      if (canMove(s)) pos[s] = { x: a.x - ux * share, y: a.y - uy * share };
      if (canMove(t)) pos[t] = { x: b.x + ux * share, y: b.y + uy * share };
    });
    if (!short) break;
    pos = removeOverlaps(pos, boxes, 60, movable);
  }
  return pos;
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
