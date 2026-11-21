// The concept map's second arrangement, "Even" (Decision 47): no gravity and
// no pull towards a concept's most general neighbour — every concept keeps a
// comfortable distance from the others, set by how far apart they are in the
// graph (stress majorization), then the same clean-up as the clustered view
// (names given their room, crossings taken out) and one more step: no concept
// sits on a line it isn't part of. Last, crossings between relations of the same
// standing are taken out zoom level by zoom level (Decision 54). Pure geometry, like conceptLayout.ts — the
// build works it out once and ships it beside the clustered one.
import type { ConceptLayoutInput } from './conceptLayout';
import {
  alignWide,
  countBoxOverlaps,
  countCrossings,
  countCrowded,
  countNodeOverlaps,
  countStretched,
  createRng,
  edgeLength,
  labelCovers,
  labelRoom,
  passesThrough,
  removeOverlaps,
  stretchForLabels,
  swapNodes,
  untangle,
} from './layoutOptimize';
import type { CrossWeight, LayoutScore, NodeBox, Positions, Segment, SegmentLabels } from './layoutOptimize';

/** Free room between two concepts' boxes along a relation — wider than the clustered view's. */
export const EVEN_GAP = 140;
/** Arrangements tried per component; the best few are cleaned up and the best of those kept. */
export const EVEN_SEEDS = 24;
const STRESS_ITERATIONS = 300;
const CLEAR_ROUNDS = 6;
/** How far off a line a concept is tried: just clear of it, and further. */
const CLEAR_STEPS = [1, 1.6, 2.5];
/** The best arrangements whose crossings are swapped out (slow), and how many passes. */
const SWAP_FINALISTS = 4;
const SWAP_PASSES = 4;
/** Clear space between a line and a concept moved off it. */
const LINE_CLEARANCE = 10;

/** Half-diagonal of a concept's box, name included: how much room it claims. */
const reach = (b: NodeBox) => Math.hypot(b.right - b.left, b.bottom - b.top) / 2;

/**
 * How the last step weighs a crossing (Decision 54), and a line through a concept.
 * Without them (the search before it), each counts 1.
 */
export interface EvenWeights {
  cross: CrossWeight;
  through: number;
}

/** The zoom levels, as importance thresholds (`revealZoom`): the overview's first, then each closer one. */
const ZOOM_LEVELS = [8, 6, 4, 2, -Infinity];
/** Extra cost of a crossing between two relations of the same standing, over one between unlike ones. */
const ALIKE_WEIGHT = 8;
/** A line through a concept: dearer than a concept's crossings could add up to, so never traded for them. */
const THROUGH_WEIGHT = 100;

/** The zoom level a concept first shows at: an index into ZOOM_LEVELS, 0 for the overview. */
const zoomLevel = (importance: number) => ZOOM_LEVELS.findIndex((L) => importance >= L);

/**
 * A relation's standing: the zoom level it shows from (zooming in reveals
 * concepts by importance, a relation once both its ends show) and how thick
 * it's drawn (its more general concept's size, as `edgeWeight`; 0–1, log scale,
 * within the component).
 */
export function relationStanding(input: ConceptLayoutInput, comp: number) {
  const { segments } = input.components[comp];
  const level = (id: string) => zoomLevel(input.importance[id] ?? 1);
  const levels = segments.map(([s, t]) => Math.max(level(s), level(t)));
  const wide = segments.map(([s, t]) => Math.log(Math.max(input.boxes[s].radius, input.boxes[t].radius)));
  const lo = Math.min(...wide), span = Math.max(...wide) - lo || 1;
  return { levels, thickness: wide.map((w) => (w - lo) / span) };
}

/**
 * Weighs a crossing by how alike its two relations are (Decision 54): two of
 * the same standing — shown from the same zoom level, drawn about as thick —
 * are read together as equals, and their crossing costs most (9); one level
 * apart, about half; a landmark's line crossing a detail's costs 1, as the eye
 * reads them apart. The total number of crossings isn't the aim. A table built
 * once per component (relations²); a lookup is all a crossing test adds.
 */
export function evenWeights(input: ConceptLayoutInput, comp: number): EvenWeights {
  const { levels, thickness } = relationStanding(input, comp);
  const n = levels.length;
  const table = new Uint8Array(n * n);
  for (let e = 0; e < n; e++)
    for (let f = 0; f < n; f++) {
      const alike = Math.max(0, 1 - Math.abs(levels[e] - levels[f]) / 2) * (1 - Math.abs(thickness[e] - thickness[f]) / 2);
      table[e * n + f] = 1 + Math.round(ALIKE_WEIGHT * alike);
    }
  return { cross: (e, f) => table[e * n + f], through: THROUGH_WEIGHT };
}

/**
 * Lower is better. For this view a line through a concept is as bad as two
 * lines crossing: both come first, then the other tangles, then length. With
 * `weights`, crossings are weighed by how alike their relations are.
 */
export function evenScore(
  segments: Segment[],
  pos: Positions,
  boxes: Record<string, NodeBox>,
  labels: SegmentLabels = [],
  weights?: EvenWeights,
): LayoutScore {
  return {
    crossings: countCrossings(segments, pos, weights?.cross) + (weights?.through ?? 1) * countNodeOverlaps(segments, pos, boxes),
    tangles:
      countBoxOverlaps(pos, boxes) +
      countCrowded(pos, boxes) +
      countStretched(segments, pos, boxes, labels) +
      2 * labelCovers(segments, labels, pos, boxes).size,
    length: edgeLength(segments, pos),
  };
}

const betterScore = (a: LayoutScore, b: LayoutScore) =>
  a.crossings < b.crossings ||
  (a.crossings === b.crossings && (a.tangles < b.tangles || (a.tangles === b.tangles && a.length < b.length - 1e-6)));

/**
 * Stress majorization: every pair of concepts is placed as far apart as the
 * shortest path between them, each relation on it as long as its two concepts
 * and its name need. Nothing pulls towards a centre or a hub.
 */
export function stressLayout(
  ids: string[],
  links: { s: string; t: string; length: number }[],
  boxes: Record<string, NodeBox>,
  rng: () => number,
  iterations = STRESS_ITERATIONS,
): Positions {
  const n = ids.length;
  const at = new Map(ids.map((id, i) => [id, i]));
  const D = Array.from({ length: n }, () => new Float64Array(n).fill(Infinity));
  for (let i = 0; i < n; i++) D[i][i] = 0;
  for (const { s, t, length } of links) {
    const i = at.get(s), j = at.get(t);
    if (i === undefined || j === undefined || i === j) continue;
    D[i][j] = D[j][i] = Math.min(D[i][j], length);
  }
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++) {
      const dik = D[i][k];
      if (dik === Infinity) continue;
      for (let j = 0; j < n; j++) if (dik + D[k][j] < D[i][j]) D[i][j] = dik + D[k][j];
    }
  // However close in the graph, two concepts keep their boxes and a gap apart.
  const r = ids.map((id) => reach(boxes[id]));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) if (i !== j) D[i][j] = Math.max(D[i][j], r[i] + r[j] + EVEN_GAP);
  const mean = links.length ? links.reduce((s, l) => s + l.length, 0) / links.length : EVEN_GAP;
  const side = mean * Math.sqrt(n);
  const x = ids.map(() => (rng() - 0.5) * side);
  const y = ids.map(() => (rng() - 0.5) * side);
  for (let it = 0; it < iterations; it++)
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0, sw = 0;
      for (let j = 0; j < n; j++) {
        const d = D[i][j];
        if (j === i || d === Infinity) continue;
        const w = 1 / (d * d);
        let dx = x[i] - x[j], dy = y[i] - y[j];
        let dist = Math.hypot(dx, dy);
        if (dist < 1e-6) {
          dx = rng() - 0.5;
          dy = rng() - 0.5;
          dist = Math.hypot(dx, dy);
        }
        sx += w * (x[j] + (d * dx) / dist);
        sy += w * (y[j] + (d * dy) / dist);
        sw += w;
      }
      if (sw > 0) {
        x[i] = sx / sw;
        y[i] = sy / sw;
      }
    }
  return Object.fromEntries(ids.map((id, i) => [id, { x: x[i], y: y[i] }]));
}

/**
 * Moves each concept a line passes through off it, sideways: spots on either
 * side, far enough for its circle and name to clear the line (and further),
 * are tried, and it goes to the one that scores best — a move is only made
 * when the whole layout gets better, so no new crossing is traded for it.
 */
export function clearLines(
  segments: Segment[],
  start: Positions,
  boxes: Record<string, NodeBox>,
  labels: SegmentLabels = [],
  weights?: EvenWeights,
): Positions {
  let pos: Positions = Object.fromEntries(Object.entries(start).map(([id, p]) => [id, { ...p }]));
  let score = evenScore(segments, pos, boxes, labels, weights);
  for (let round = 0; round < CLEAR_ROUNDS; round++) {
    let moved = false;
    for (const seg of segments)
      for (const id in pos) {
        if (!passesThrough(seg, id, pos, boxes)) continue;
        const a = pos[seg[0]], b = pos[seg[1]], box = boxes[id];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1e-6) continue;
        const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
        const here = pos[id];
        const cx = here.x + (box.left + box.right) / 2, cy = here.y + (box.top + box.bottom) / 2;
        const side = (cx - a.x) * nx + (cy - a.y) * ny;
        const half = (Math.abs(nx) * (box.right - box.left)) / 2 + (Math.abs(ny) * (box.bottom - box.top)) / 2;
        let best: { at: { x: number; y: number }; score: LayoutScore } | null = null;
        for (const sign of [1, -1])
          for (const k of CLEAR_STEPS) {
            const shift = sign * k * (half + LINE_CLEARANCE) - side;
            const at = { x: here.x + nx * shift, y: here.y + ny * shift };
            pos[id] = at;
            const next = evenScore(segments, pos, boxes, labels, weights);
            if (betterScore(next, best?.score ?? score)) best = { at, score: next };
          }
        pos[id] = best ? best.at : here;
        if (best) {
          score = best.score;
          moved = true;
        }
      }
    if (!moved) break;
    const separated = removeOverlaps(pos, boxes);
    const s = evenScore(segments, separated, boxes, labels, weights);
    if (betterScore(s, score) || countBoxOverlaps(pos, boxes) > 0) {
      pos = separated;
      score = s;
    }
  }
  return pos;
}

/** A relation's length in this view: its two concepts' boxes and a gap, or what its name needs. */
function linksOf(input: ConceptLayoutInput, comp: number) {
  const c = input.components[comp];
  const { boxes } = input;
  const lengthOf = (s: string, t: string, e?: number) =>
    Math.max(
      reach(boxes[s]) + reach(boxes[t]) + EVEN_GAP,
      e === undefined ? 0 : labelRoom(boxes[s].radius, boxes[t].radius, c.labels[e]) + EVEN_GAP / 2,
    );
  return [
    ...c.segments.map(([s, t], e) => ({ s, t, length: lengthOf(s, t, e) })),
    // What a concept assumes sits near it, though no line is drawn.
    ...c.ties.map(([s, t]) => ({ s, t, length: lengthOf(s, t) })),
  ];
}

/** One evenly spaced arrangement of one component, from one seed. */
export function arrangeEvenComponent(input: ConceptLayoutInput, comp: number, seed: number) {
  const c = input.components[comp];
  const { boxes } = input;
  const laid = stressLayout(c.ids, linksOf(input, comp), boxes, createRng(seed));
  const pos = stretchForLabels(removeOverlaps(alignWide(laid), boxes), c.segments, c.labels, boxes);
  return { pos, score: evenScore(c.segments, pos, boxes, c.labels) };
}

/**
 * Cleans one arrangement up: swaps concepts' places to take crossings out
 * (cheap here — the spacing stays even), gives names their room, then moves
 * concepts off lines. With `withUntangle`, the slower crossing search runs too.
 */
export function refineEven(input: ConceptLayoutInput, comp: number, start: Positions, withUntangle = false) {
  const c = input.components[comp];
  const { boxes } = input;
  let pos = start;
  let score = evenScore(c.segments, pos, boxes, c.labels);
  const tryStep = (next: Positions) => {
    const s = evenScore(c.segments, next, boxes, c.labels);
    if (betterScore(s, score)) {
      pos = next;
      score = s;
    }
  };
  const settle = (p: Positions) => stretchForLabels(removeOverlaps(p, boxes), c.segments, c.labels, boxes);
  tryStep(settle(swapNodes(c.segments, pos, boxes, SWAP_PASSES, c.labels).pos));
  tryStep(clearLines(c.segments, pos, boxes, c.labels));
  if (withUntangle) {
    tryStep(untangle(c.segments, pos, boxes, c.labels).pos);
    tryStep(clearLines(c.segments, pos, boxes, c.labels));
  }
  return { pos, score };
}

export const evenSeeds = (comp: number, ids: string[]): number[] =>
  ids.length >= 3 ? Array.from({ length: EVEN_SEEDS }, (_, k) => 101 + comp + 6151 * k) : [101 + comp];

/** The whole search, every component: what the build ships for the Even view. */
export function searchEvenLayout(input: ConceptLayoutInput): Positions[] {
  return input.components.map((c, i) => {
    const order = (a: { score: LayoutScore }, b: { score: LayoutScore }) =>
      betterScore(a.score, b.score) ? -1 : betterScore(b.score, a.score) ? 1 : 0;
    // Lines through concepts are cleared later; to choose where to start, crossings count most.
    const crossings = (p: Positions) => countCrossings(c.segments, p);
    const finalists = evenSeeds(i, c.ids)
      .map((seed) => arrangeEvenComponent(input, i, seed))
      .sort((a, b) => crossings(a.pos) - crossings(b.pos) || order(a, b))
      .slice(0, SWAP_FINALISTS)
      .map((f) => refineEven(input, i, f.pos))
      .sort(order);
    return untangleSameLevel(input, i, refineEven(input, i, finalists[0].pos, true).pos);
  });
}

/**
 * The last step (Decision 54): takes crossings out one zoom level at a time —
 * first among the concepts the overview shows, then, with those held in place,
 * moving only what the next level adds, and so on — then moves concepts off
 * lines again. A crossing depends on its two relations' four concepts only,
 * so a level held in place can't gain one between its own relations later.
 * Kept only if it lowers the crossings between relations of the same standing
 * (`evenWeights`) without a line through a concept. Each pass sees only its
 * level's relations: a few seconds.
 */
export function untangleSameLevel(input: ConceptLayoutInput, comp: number, start: Positions): Positions {
  const c = input.components[comp];
  const { boxes } = input;
  const weights = evenWeights(input, comp);
  const importance = (id: string) => input.importance[id] ?? 1;
  let pos = start;
  let held = Infinity;
  for (const level of ZOOM_LEVELS) {
    const shown = new Set(c.ids.filter((id) => importance(id) >= level));
    const movable = new Set([...shown].filter((id) => importance(id) < held));
    held = level;
    const visible = c.segments.flatMap((seg, e) => (shown.has(seg[0]) && shown.has(seg[1]) ? [e] : []));
    if (!movable.size || !visible.length) continue;
    const segments = visible.map((e) => c.segments[e]);
    const labels = visible.map((e) => c.labels[e]);
    pos = untangle(segments, pos, boxes, labels, undefined, movable).pos;
  }
  pos = clearLines(c.segments, pos, boxes, c.labels, weights);
  return betterScore(evenScore(c.segments, pos, boxes, c.labels, weights), evenScore(c.segments, start, boxes, c.labels, weights))
    ? pos
    : start;
}

/**
 * A quick arrangement — one seed, concepts moved off lines, no swaps (they
 * take seconds) — for the browser when the build shipped none for this graph.
 */
export function quickEvenLayout(input: ConceptLayoutInput): Positions[] {
  return input.components.map((c, i) => {
    const first = arrangeEvenComponent(input, i, evenSeeds(i, c.ids)[0]).pos;
    return clearLines(c.segments, first, input.boxes, c.labels);
  });
}
