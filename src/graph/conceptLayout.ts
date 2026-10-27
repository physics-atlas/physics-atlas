// The concept map's layout as a pure function of the graph — no Cytoscape,
// no DOM — so the build works it out once (scripts/build-layout.mjs →
// src/data/conceptLayout.json) and every visitor gets it ready-made. Names
// are sized from a measured glyph table (glyphWidths.json) rather than the
// visitor's own font, so the result is the same on every machine.
import glyphs from './glyphWidths.json';
import type { ConceptGraph, GraphEdge, GraphNode } from '../data/types';
import {
  assumedConceptIds,
  buildConceptIndex,
  edgeWeight,
  EDGE_LABEL_FONT,
  effectiveImportance,
  INSIDE_LABEL_RADIUS,
  labelSize,
  nodeRadius,
  normalizeRelationship,
  relationFontSize,
} from './concepts';
import { arrangeComponent, better, clearance, createRng, layoutKey, packComponents, SPACING, untangle } from './layoutOptimize';
import type { NodeBox, Positions, Segment, SegmentLabel, SegmentLabels } from './layoutOptimize';

/** A line's width in model px when zoomed in. */
export const EDGE_WIDTH = 1.5;
/** Where a relation name wraps, at EDGE_LABEL_FONT — it widens in step with the font. */
export const EDGE_LABEL_MAX = 220;
/** Cytoscape hides a name smaller than this on screen ('min-zoomed-font-size'). */
export const MIN_LABEL_PX = 9;
/** The arrowheads' 'arrow-scale'. */
export const ARROW_SCALE = 0.8;
/** Where a specific concept's name (under its circle) wraps. */
const NODE_LABEL_WIDTH = 140;
/** The gap between a circle and the name under it ('text-margin-y'). */
export const NODE_LABEL_MARGIN = 4;
/** Arrangements tried per component; the best one is kept. */
export const SEARCH_SEEDS = 24;
const COMPONENT_GAP = 120 * SPACING;
const LONE_NODE_GAP = 40 * SPACING;

type Measure = (line: string, font: number, italic: boolean) => number;

const FALLBACK_EM = 0.6;

/** A line's width in px from the glyph table (unknown characters at 0.6 em). */
export const glyphMeasure: Measure = (line, font, italic) => {
  const table = (italic ? glyphs.italic : glyphs.normal) as Record<string, number>;
  let w = 0;
  for (const c of line) w += table[c] ?? FALLBACK_EM * glyphs.em;
  return (w * font) / glyphs.em;
};

/** How a concept's circle and name are drawn — shared with GraphView's styles. */
export function nodeLabelLayout(node: GraphNode, degree: number) {
  const importance = effectiveImportance(node, degree);
  const radius = nodeRadius(node, degree);
  const inside = radius >= INSIDE_LABEL_RADIUS;
  return {
    radius,
    importance,
    inside,
    fontSize: labelSize(importance, radius),
    // A big concept's name sits inside its circle, in its lower half.
    labelWidth: inside ? 1.5 * radius : NODE_LABEL_WIDTH,
    // Room for the badge line: inside, the circle's full width.
    labelWidthWide: inside ? 2 * radius : 220,
    labelShift: inside ? 0.4 * radius : NODE_LABEL_MARGIN,
  };
}

/** Cytoscape's 'text-wrap: wrap': greedy, at whitespace, a too-long word on its own line. */
function wrapWidths(text: string, font: number, max: number, measure: Measure): number[] {
  const out: number[] = [];
  for (const line of text.split('\n')) {
    if (measure(line, font, false) <= max) {
      out.push(measure(line, font, false));
      continue;
    }
    let sub = '';
    for (const m of line.matchAll(/(\S+)(\s*)/g)) {
      const [, word, sep] = m;
      const test = sub ? sub + word + sep : word;
      if (measure(test, font, false) <= max) sub = sub ? test : word + sep;
      else {
        if (sub) out.push(measure(sub, font, false));
        sub = word + sep;
      }
    }
    if (sub.trim()) out.push(measure(sub, font, false));
  }
  return out;
}

/** A concept's label-inclusive extent, as offsets from its centre (NodeBox). */
export function conceptNodeBox(node: GraphNode, degree: number, measure: Measure = glyphMeasure): NodeBox {
  const { radius, inside, fontSize, labelWidth, labelShift } = nodeLabelLayout(node, degree);
  const lines = wrapWidths(node.label, fontSize, labelWidth, measure);
  // A name near the wrap width may stay on one line in a narrower font than
  // the table's: the box takes the wrapped height and the unwrapped width.
  const oneLine = Math.max(0, ...node.label.split('\n').map((l) => measure(l, fontSize, false)));
  const widest = Math.ceil(Math.max(...lines, Math.min(oneLine, labelWidth)));
  if (inside) {
    // Inside the circle on its plate (4px padding) — a name with a word too
    // long to wrap runs past the rim.
    const half = Math.max(radius, widest / 2 + 4);
    const bottom = Math.max(radius, labelShift + (lines.length * fontSize) / 2 + 4);
    return { radius, left: -half, right: half, top: -radius, bottom };
  }
  const half = Math.max(radius, widest / 2);
  return { radius, left: -half, right: half, top: -radius, bottom: radius + NODE_LABEL_MARGIN + lines.length * fontSize };
}

/** The text a relation is drawn with: its name, and the status (if any) on a second line. */
export function relationText(edge: GraphEdge, status?: string): string {
  const relation = normalizeRelationship(edge.relationship) ?? edge.relationship.trim();
  return [relation, status ? `(${status})` : ''].filter(Boolean).join('\n');
}

/**
 * A relation's name as the layout needs it: in the font it's drawn in
 * (relationFontSize, italic), wrapped where Cytoscape wraps it, plus its plate
 * and the arrowhead that shifts it.
 */
export function relationLabelBox(
  text: string,
  radii: [number, number],
  importances: [number, number],
  measure: Measure = glyphMeasure,
): SegmentLabel | undefined {
  if (!text.trim()) return undefined;
  const { px } = edgeWeight(radii, importances);
  const font = relationFontSize(radii, importances);
  const max = (EDGE_LABEL_MAX * font) / EDGE_LABEL_FONT;
  let length = 0;
  let lines = 0;
  for (const line of text.split('\n')) {
    const w = measure(line, font, true);
    length = Math.max(length, Math.min(w, max));
    lines += Math.max(1, Math.ceil(w / max));
  }
  // The arrowhead, as Cytoscape sizes it (max((width·13.37)^0.9, 29) × arrow-scale),
  // at the zoom where the name first shows — the farthest out, where lines
  // and so arrows are widest in model px; closer in it only gets smaller.
  const legibleZoom = MIN_LABEL_PX / font;
  const width = Math.max(EDGE_WIDTH, px / legibleZoom);
  const arrow = ARROW_SCALE * Math.max((width * 13.37) ** 0.9, 29);
  // The plate (text-background-padding 2) on every side.
  return { length: length + 4, thickness: lines * font * 1.2 + 4, arrow };
}

export interface ConceptComponent {
  ids: string[];
  segments: Segment[];
  /** Each segment's relation name — its line gets the room the name needs */
  labels: SegmentLabels;
  /** Concept → what it assumes: pulled close, never drawn */
  ties: Segment[];
}

export interface ConceptLayoutInput {
  /** Connected groups, largest first (relations and assumptions both connect) */
  components: ConceptComponent[];
  /** Concepts with neither: they share one row */
  loneIds: string[];
  boxes: Record<string, NodeBox>;
  /** Changes whenever anything the layout depends on does */
  key: string;
}

/** Everything the layout needs from the graph: components, boxes, names. */
export function conceptLayoutInput(graph: ConceptGraph): ConceptLayoutInput {
  const index = buildConceptIndex(graph);
  const degree = (id: string) => index.degree.get(id) ?? 0;
  const boxes = Object.fromEntries(graph.nodes.map((n) => [n.id, conceptNodeBox(n, degree(n.id))]));
  const ties: Segment[] = graph.nodes.flatMap((n) =>
    assumedConceptIds(n).filter((a) => index.byId.has(a)).map((a) => [n.id, a] as Segment),
  );
  const edges = graph.edges.filter((e) => index.byId.has(e.source) && index.byId.has(e.target));
  // Components join through relations and through assumptions (ties): an
  // assumed concept is laid out next to what assumes it, though no line is drawn.
  const parent = new Map(graph.nodes.map((n) => [n.id, n.id]));
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  for (const [a, b] of [...edges.map((e) => [e.source, e.target]), ...ties]) parent.set(find(a), find(b));
  const groups = new Map<string, string[]>();
  for (const n of graph.nodes) groups.set(find(n.id), [...(groups.get(find(n.id)) ?? []), n.id]);
  const all = [...groups.values()].sort((a, b) => b.length - a.length);
  const ends = (e: GraphEdge) => [index.byId.get(e.source)!, index.byId.get(e.target)!];
  const components = all
    .filter((ids) => ids.length > 1)
    .map((ids) => {
      const inside = new Set(ids);
      const own = edges.filter((e) => inside.has(e.source));
      return {
        ids,
        segments: own.map((e) => [e.source, e.target] as Segment),
        labels: own.map((e) => {
          const [s, t] = ends(e);
          const l = (n: GraphNode) => nodeLabelLayout(n, degree(n.id));
          return relationLabelBox(relationText(e), [l(s).radius, l(t).radius], [l(s).importance, l(t).importance]);
        }),
        ties: ties.filter(([a]) => inside.has(a)),
      };
    });
  const loneIds = all.filter((ids) => ids.length === 1).map((ids) => ids[0]);
  // The key is built from the data the sizes come from, never from measured
  // sizes: Node (the build) and a browser can differ in a float's last digit.
  const shape = graph.nodes.map((n) => [n.type, n.generality, n.importance, degree(n.id), n.label].join('/'));
  const names = components.flatMap((c) => edges.filter((e) => c.ids.includes(e.source)).map((e) => relationText(e)));
  const key = layoutKey(
    graph.nodes.map((n) => n.id),
    components.flatMap((c) => [...c.segments, ...c.ties.map(([a, b]) => [a, `assumes:${b}`] as Segment)]),
    `concepts|${shape.join('|')}|${names.join('|')}`,
  );
  return { components, loneIds, boxes, key };
}

/** The seeds a component's search tries, the quick first arrangement first. */
export const searchSeeds = (comp: number, ids: string[]): number[] => [
  1 + comp,
  ...(ids.length >= 3 ? Array.from({ length: SEARCH_SEEDS }, (_, k) => 1 + comp + 7919 * (k + 1)) : []),
];

/** One arrangement of one component, from one seed. */
export function arrangeConceptComponent(input: ConceptLayoutInput, comp: number, seed: number) {
  const c = input.components[comp];
  return arrangeComponent(c.ids, c.segments, input.boxes, createRng(seed), c.labels, c.ties);
}

/** The whole search, every component and seed: what the build ships. */
export function searchConceptLayout(input: ConceptLayoutInput): Positions[] {
  return input.components.map((c, i) => {
    const candidates = searchSeeds(i, c.ids).map((seed) => arrangeConceptComponent(input, i, seed));
    // The best few go on to have their crossings taken out (untangle): it's
    // slower than the search, and the order can change once it's done.
    const order = (a: (typeof candidates)[number], b: (typeof candidates)[number]) =>
      better(a.score, b.score) ? -1 : better(b.score, a.score) ? 1 : 0;
    const finalists = candidates.sort(order).slice(0, UNTANGLE_FINALISTS);
    return finalists.map((f) => untangle(c.segments, f.pos, input.boxes, c.labels)).sort(order)[0].pos;
  });
}

/** How many of the search's best arrangements are untangled before one is chosen. */
const UNTANGLE_FINALISTS = 4;

/**
 * The components side by side for a viewport of this aspect (width ÷
 * height), with the unconnected concepts in a row of their own — big ones
 * keep their clearance there too.
 */
export function packConceptLayout(input: ConceptLayoutInput, components: Positions[], aspect: number): Positions {
  const { boxes } = input;
  const row: Positions = {};
  let x = 0;
  input.loneIds.forEach((id, i) => {
    if (i > 0) {
      const prev = boxes[input.loneIds[i - 1]], b = boxes[id];
      const circles = clearance(prev.radius, b.radius) - prev.radius - b.radius;
      x += Math.max(LONE_NODE_GAP, circles);
    }
    row[id] = { x: x - boxes[id].left, y: 0 };
    x += boxes[id].right - boxes[id].left;
  });
  // Between groups too: two big circles on facing edges keep their clearance.
  const biggest = Math.max(0, ...Object.values(boxes).map((b) => b.radius));
  const gap = Math.max(COMPONENT_GAP, clearance(biggest, biggest) - 2 * biggest);
  return packComponents([...components, ...(input.loneIds.length ? [row] : [])], boxes, aspect, gap);
}
