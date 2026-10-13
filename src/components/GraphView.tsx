import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import type { ConceptGraph, Topic } from '../data/types';
import { buildTopicMap, buildUnitGraph, parseUnitId, resolveSubtopicRef } from '../graph/dag';
import { CATEGORY_COLORS, categoryOf } from '../graph/categoryColors';
import { buildConceptIndex, nodeRadius, normalizeRelationship } from '../graph/concepts';
import type { ConceptIndex } from '../graph/concepts';
import { TYPE_COLORS } from '../graph/typeColors';
import { typeIconUri } from '../graph/typeIcons';
import {
  better,
  createRng,
  layoutKey,
  packComponents,
  shuffled,
  sweepRanks,
} from '../graph/layoutOptimize';
import type { LayoutScore, NodeBox, Positions, Segment } from '../graph/layoutOptimize';

cytoscape.use(dagre);

const FADE_PX = 6;
const LABEL_PX = 8;
const ICON_BOOST_PX = 14;

interface GraphViewProps {
  /**
   * The input variant: pass exactly one of `topics` (topic/subtopic DAG) or
   * `concepts` (typed concept graph — circles sized by generality, 1-hop
   * hover, relation-labelled edges, zoom-linked fade).
   */
  topics?: Topic[];
  concepts?: ConceptGraph;
  selectedId: string | null;
  /** Nodes to emphasize (e.g. selected topic + its ancestors); others dim. */
  highlightIds: Set<string> | null;
  /** Topics marked as learned — shown with a ✓ label badge. */
  doneIds?: Set<string>;
  /** Bump `tick` to animate-center the viewport on `id` (e.g. after a search). */
  focus?: { id: string | null; tick: number };
  /** Roomier layout + bigger labels for the full-screen map. */
  large?: boolean;
  /**
   * Clicking a node sticks the full silver/gold tree (prerequisites +
   * everything it unlocks) until another node is clicked. When false, the
   * `highlightIds` set drives an ancestors-only dim (goal / curriculum view).
   */
  directionalSelect?: boolean;
  /** Annotated topics rendered as compound nodes with their subtopics inside. */
  expandedIds?: Set<string>;
  /** Double-tapping an annotated topic toggles its expansion. */
  onToggleExpand?: (id: string) => void;
  /** Light theme swaps the ink/edge palette (canvas can't use CSS vars). */
  theme?: 'dark' | 'light';
  /** The golden-marked goal node (unit or topic id). */
  goalId?: string | null;
  /** Units to connect with cross-topic unit edges (the goal-path closure). */
  unitPathIds?: Set<string> | null;
  /**
   * Animate-fit the viewport to these nodes whenever the set changes; going
   * back to null re-fits the whole graph.
   */
  fitIds?: Set<string> | null;
  /** Screen px covered by overlay panels on each side, kept clear by `fitIds`. */
  fitInsets?: Insets;
  onSelect: (id: string | null) => void;
}

interface Insets {
  left: number;
  right: number;
  bottom: number;
}

const NO_INSETS: Insets = { left: 0, right: 0, bottom: 0 };
const FIT_PADDING = 48;
const FIT_MAX_ZOOM = 1.3;

/** cy.fit() with asymmetric side insets, so the fit lands beside overlay panels. */
function fitBeside(
  cy: cytoscape.Core,
  eles: cytoscape.CollectionReturnValue,
  insets: Insets,
  animate = true,
) {
  // On narrow screens the panels cover the canvas anyway — fit the full width.
  if (insets.left + insets.right > cy.width() * 0.6) insets = { ...insets, left: 0, right: 0 };
  const bb = eles.boundingBox();
  const w = cy.width() - insets.left - insets.right - 2 * FIT_PADDING;
  const h = cy.height() - insets.bottom - 2 * FIT_PADDING;
  if (w <= 0 || h <= 0 || eles.empty()) return;
  const zoom = Math.min(FIT_MAX_ZOOM, w / Math.max(bb.w, 1), h / Math.max(bb.h, 1));
  const pan = {
    x: insets.left + FIT_PADDING + (w - bb.w * zoom) / 2 - bb.x1 * zoom,
    y: FIT_PADDING + (h - bb.h * zoom) / 2 - bb.y1 * zoom,
  };
  cy.stop();
  if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) cy.viewport({ zoom, pan });
  else cy.animate({ zoom, pan }, { duration: 700, easing: 'ease-in-out-cubic' });
}

const styleFor = (large: boolean, light: boolean) => {
  const ink = light ? '#1c2333' : '#eef2fb';
  const surface = light ? '#f3f5fa' : '#070b14';
  const inkMuted = light ? '#4a5570' : '#b7c2dc';
  const fadeDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? '0s' : '0.3s';
  const edge = light ? 'rgba(70, 90, 135, 0.4)' : 'rgba(160, 180, 224, 0.28)';
  const edgeArrow = light ? 'rgba(70, 90, 135, 0.5)' : 'rgba(160, 180, 224, 0.35)';
  const onpath = light ? 'rgba(47, 111, 196, 0.85)' : 'rgba(143, 183, 255, 0.85)';
  const onpathArrow = light ? 'rgba(47, 111, 196, 0.9)' : 'rgba(143, 183, 255, 0.9)';
  const silver = light ? '#7d8db0' : '#cdd6e8';
  const silverEdge = light ? 'rgba(100, 115, 145, 0.85)' : 'rgba(205, 214, 232, 0.85)';
  const silverArrow = light ? 'rgba(100, 115, 145, 0.9)' : 'rgba(205, 214, 232, 0.9)';
  const gold = light ? '#b0821e' : '#e6b566';
  const goldEdge = light ? 'rgba(176, 130, 30, 0.85)' : 'rgba(230, 181, 102, 0.85)';
  const goldArrow = light ? 'rgba(176, 130, 30, 0.9)' : 'rgba(230, 181, 102, 0.9)';
  return [
  {
    selector: 'node',
    style: {
      shape: 'round-rectangle',
      width: 'label',
      height: 'label',
      padding: large ? '14px' : '10px',
      'background-color': 'data(color)',
      'background-opacity': 0.16,
      'border-width': 1.5,
      'border-color': 'data(color)',
      'border-opacity': 0.85,
      label: 'data(label)',
      color: ink,
      'font-size': large ? 14 : 12,
      'font-family': 'system-ui, -apple-system, "Segoe UI", sans-serif',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': large ? '170px' : '130px',
      // Tween highlight/dim changes instead of snapping — the "flowing" feel.
      'transition-property': 'opacity, background-opacity, border-width, border-color',
      'transition-duration': '0.3s',
      'transition-timing-function': 'ease-in-out',
    },
  },
  {
    selector: 'node.concept-node',
    style: {
      shape: 'ellipse',
      width: 'data(size)',
      height: 'data(size)',
      padding: '0px',
      'background-opacity': 0.55,
      'text-valign': 'bottom',
      'text-margin-y': 4,
      'text-max-width': '140px',
      'font-size': 12,
      'transition-property': 'opacity, text-opacity, background-opacity, border-width, border-color',
      'transition-duration': fadeDuration,
    },
  },
  {
    selector: 'node.concept-node[icon]',
    style: {
      'background-image': 'data(icon)',
      'background-width': '76%',
      'background-height': '76%',
      'background-image-opacity': 0.95,
    },
  },
  // Zoomed out, the circle is only a few px across — let the glyph fill more of it.
  {
    selector: 'node.concept-node[icon].icon-boost',
    style: { 'background-width': '86%', 'background-height': '86%' },
  },
  // Zoom-linked fade (concept variant) — before chosen/dimmed/sel/hover so an
  // explicitly selected or hovered node is never left invisible.
  {
    selector: 'node.zoom-faded',
    style: { opacity: 0.3, 'text-opacity': 0, 'transition-duration': fadeDuration },
  },
  { selector: 'node.label-hidden', style: { 'text-opacity': 0, 'transition-duration': fadeDuration } },
  {
    selector: 'node.chosen',
    style: {
      opacity: 1,
      'text-opacity': 1,
      'border-width': 3,
      'background-opacity': 0.35,
      'font-weight': 'bold',
      'underlay-color': 'data(color)',
      'underlay-opacity': 0.18,
      'underlay-padding': 8,
    },
  },
  {
    selector: 'node.goal-node',
    style: {
      opacity: 1,
      'text-opacity': 1,
      'border-width': 3.5,
      'border-color': gold,
      'background-opacity': 0.4,
      'underlay-color': gold,
      'underlay-opacity': 0.25,
      'underlay-padding': 10,
      'font-weight': 'bold',
      'z-index': 5,
    },
  },
  { selector: 'node.dimmed', style: { opacity: 0.16 } },
  { selector: 'node.done', style: { 'background-opacity': 0.06, 'border-style': 'dashed' } },
  {
    selector: 'node:parent',
    style: {
      'background-opacity': 0.05,
      'border-opacity': 0.5,
      'border-style': 'dashed',
      'text-valign': 'top',
      'text-margin-y': large ? -6 : -4,
      padding: large ? '18px' : '12px',
      'font-weight': 'bold',
    },
  },
  {
    selector: 'node.subtopic-node',
    style: {
      'font-size': large ? 12 : 10.5,
      'background-opacity': 0.14,
      padding: large ? '9px' : '7px',
      'text-max-width': large ? '130px' : '100px',
    },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      width: 1.5,
      'line-color': edge,
      'target-arrow-shape': 'triangle',
      'target-arrow-color': edgeArrow,
      'arrow-scale': 0.8,
      'transition-property': 'opacity, width, line-color, target-arrow-color',
      'transition-duration': '0.3s',
      'transition-timing-function': 'ease-in-out',
    },
  },
  {
    selector: 'edge.concept-edge',
    style: {
      label: 'data(relation)',
      color: inkMuted,
      'font-size': 9,
      // Cytoscape drops a label whose on-screen size falls below this, so
      // relation names vanish when zoomed out instead of piling up.
      'min-zoomed-font-size': 7,
      'font-family': 'system-ui, -apple-system, "Segoe UI", sans-serif',
      'text-rotation': 'autorotate',
      'text-background-color': surface,
      'text-background-opacity': 0.75,
      'text-background-padding': 2,
      'transition-duration': fadeDuration,
    },
  },
  { selector: 'edge.zoom-faded', style: { opacity: 0.12 } },
  {
    selector: 'edge.optional-edge',
    style: { 'line-style': 'dashed', 'line-dash-pattern': [6, 5] },
  },
  {
    selector: 'edge.onpath',
    style: {
      width: 2.5,
      'line-color': onpath,
      'target-arrow-color': onpathArrow,
    },
  },
  { selector: 'edge.dimmed', style: { opacity: 0.08 } },
  // Persistent selection tree (a click) — same silver/gold coding as hover,
  // but sticky. Defined before hover so a live hover still wins on top.
  { selector: 'node.sel-soft', style: { opacity: 0.4 } },
  { selector: 'edge.sel-soft', style: { opacity: 0.14 } },
  {
    selector: 'node.sel-pre',
    style: { 'border-width': 2.5, 'border-color': silver, 'background-opacity': 0.3 },
  },
  {
    selector: 'edge.sel-pre',
    style: {
      width: 2.5,
      'line-color': silverEdge,
      'target-arrow-color': silverArrow,
    },
  },
  {
    selector: 'node.sel-post',
    style: { 'border-width': 2.5, 'border-color': gold, 'background-opacity': 0.3 },
  },
  {
    selector: 'edge.sel-post',
    style: {
      width: 2.5,
      'line-color': goldEdge,
      'target-arrow-color': goldArrow,
    },
  },
  // Hover states — defined last so they win over dimmed/onpath/sel while active.
  // Others recede but stay clearly visible. Direction is color-coded:
  // silver = prerequisites (what it stands on), gold = what it unlocks.
  { selector: 'node.hover-soft', style: { opacity: 0.45 } },
  { selector: 'edge.hover-soft', style: { opacity: 0.18 } },
  {
    selector: 'node.hover-pre',
    style: {
      opacity: 1,
      'text-opacity': 1,
      'border-width': 2.5,
      'border-color': silver,
      'background-opacity': 0.3,
    },
  },
  {
    selector: 'edge.hover-pre',
    style: {
      opacity: 1,
      width: 2.5,
      'line-color': silverEdge,
      'target-arrow-color': silverArrow,
    },
  },
  {
    selector: 'node.hover-post',
    style: {
      opacity: 1,
      'text-opacity': 1,
      'border-width': 2.5,
      'border-color': gold,
      'background-opacity': 0.3,
    },
  },
  {
    selector: 'edge.hover-post',
    style: {
      opacity: 1,
      width: 2.5,
      'line-color': goldEdge,
      'target-arrow-color': goldArrow,
    },
  },
  {
    selector: 'node.hovered',
    style: {
      opacity: 1,
      'text-opacity': 1,
      'font-size': large ? 16.5 : 14,
      padding: large ? '17px' : '13px',
      'border-width': 3,
      'background-opacity': 0.4,
      'font-weight': 'bold',
      'z-index': 10,
      'underlay-color': 'data(color)',
      'underlay-opacity': 0.22,
      'underlay-padding': 10,
    },
  },
  {
    selector: 'edge.concept-edge.onpath, edge.concept-edge.hover-pre, edge.concept-edge.hover-post',
    style: {
      color: ink,
      'font-size': 12.5,
      'font-weight': 'bold',
      'text-background-opacity': 0.85,
      'z-index': 15,
    },
  },
  // Hovering a line: its relation name grows and the two concepts it joins
  // pop out, their names on the same plate as the relation name.
  {
    selector: 'edge.concept-edge.edge-hovered',
    style: {
      opacity: 1,
      width: 3,
      'line-color': onpath,
      'target-arrow-color': onpathArrow,
      color: ink,
      'font-size': 15,
      'font-weight': 'bold',
      'text-background-opacity': 0.95,
      'text-background-padding': 3,
      'z-index': 20,
    },
  },
  // Circles are sized by generality — keep the grow small and the fill
  // stronger than the topic boxes' tint, or small circles vanish on hover.
  { selector: 'node.concept-node.hovered', style: { padding: '3px' } },
  {
    selector: 'node.concept-node.chosen, node.concept-node.hovered',
    style: { 'background-opacity': 0.85 },
  },
  {
    selector: 'node.concept-node.edge-end',
    style: {
      opacity: 1,
      'text-opacity': 1,
      'background-opacity': 0.85,
      'border-width': 3,
      color: ink,
      'font-size': 15,
      'font-weight': 'bold',
      'text-margin-y': 6,
      'text-background-color': surface,
      'text-background-opacity': 0.95,
      'text-background-padding': 3,
      'underlay-color': 'data(color)',
      'underlay-opacity': 0.22,
      'underlay-padding': 8,
      'z-index': 20,
    },
  },
] as unknown as cytoscape.StylesheetJson;
};

const layoutFor = (large: boolean, concepts: boolean) =>
  ({
    name: 'dagre',
    rankDir: 'BT',
    // Concept layouts space by label-inclusive size (nodeDimensionsIncludeLabels),
    // so the gap between them can stay small.
    nodeSep: concepts ? 28 : large ? 44 : 24,
    rankSep: concepts ? 90 : large ? 110 : 60,
    padding: large ? 32 : 16,
  }) as cytoscape.LayoutOptions;

// Concept layout: each connected component gets its own dagre run (so
// unrelated sub-graphs never interleave), then the components are packed side
// by side. A first, quick pass shows immediately; a background search over
// node orders then keeps whichever arrangement has the fewest crossings and
// edge-through-node overlaps, glides to it, and caches it per graph.
const SEARCH_ORDERS = 24;
const COMPONENT_GAP = 120;
const LONE_NODE_GAP = 40;
const LAYOUT_STORE_KEY = 'physics-atlas-concept-layout-v1';
const layoutCache = new Map<string, Positions>();

interface ConceptComponent {
  nodes: cytoscape.NodeCollection;
  edges: cytoscape.EdgeCollection;
  segments: Segment[];
}

interface ComponentLayout {
  pos: Positions;
  score: LayoutScore;
}

function readStoredLayout(key: string): Positions | null {
  try {
    const stored = JSON.parse(localStorage.getItem(LAYOUT_STORE_KEY) ?? 'null') as {
      key: string;
      positions: Positions;
    } | null;
    return stored?.key === key ? stored.positions : null;
  } catch {
    return null;
  }
}

function storeLayout(key: string, positions: Positions) {
  try {
    localStorage.setItem(LAYOUT_STORE_KEY, JSON.stringify({ key, positions }));
  } catch {
    // storage blocked — the in-memory cache still covers this session
  }
}

/** One dagre run over a component in the given node order, then the rank sweep. */
function layoutComponent(
  cy: cytoscape.Core,
  comp: ConceptComponent,
  order: cytoscape.NodeSingular[],
  boxes: Record<string, NodeBox>,
  large: boolean,
): ComponentLayout {
  // An array keeps the given order (the typings only admit a collection);
  // cytoscape-dagre feeds nodes to dagre in collection order.
  cy.collection(order as unknown as cytoscape.CollectionArgument)
    .union(comp.edges)
    .layout({ ...layoutFor(large, true), fit: false, animate: false, nodeDimensionsIncludeLabels: true } as cytoscape.LayoutOptions)
    .run();
  const raw: Positions = {};
  comp.nodes.forEach((n) => {
    raw[n.id()] = { ...n.position() };
  });
  return sweepRanks(comp.segments, raw, boxes);
}

function setPositions(cy: cytoscape.Core, positions: Positions) {
  cy.batch(() => {
    cy.nodes().forEach((n) => {
      const p = positions[n.id()];
      if (p) n.position(p);
    });
  });
}

/**
 * Lays the concept graph out and returns a cancel function for the
 * background search (no-op when the layout came from the cache).
 */
function layoutConcepts(
  cy: cytoscape.Core,
  large: boolean,
  onImproved: (positions: Positions) => void,
): () => void {
  const all = cy
    .elements()
    .components()
    .sort((a, b) => b.nodes().length - a.nodes().length);
  const comps: ConceptComponent[] = all
    .filter((c) => c.nodes().length > 1)
    .map((c) => ({
      nodes: c.nodes(),
      edges: c.edges(),
      segments: c.edges().map((e) => [e.source().id(), e.target().id()] as Segment),
    }));
  // Unlinked concepts share one compact row instead of each taking a full slot.
  const loneIds = all.filter((c) => c.nodes().length === 1).map((c) => c.nodes()[0].id());
  const key = layoutKey(
    cy.nodes().map((n) => n.id()),
    comps.flatMap((c) => c.segments),
    large ? 'large' : 'small',
  );
  const cached = layoutCache.get(key) ?? readStoredLayout(key);
  if (cached) {
    layoutCache.set(key, cached);
    setPositions(cy, cached);
    return () => {};
  }

  const boxes: Record<string, NodeBox> = {};
  cy.nodes().forEach((n) => {
    const p = n.position();
    const bb = n.boundingBox({ includeLabels: true });
    boxes[n.id()] = {
      radius: n.width() / 2,
      left: bb.x1 - p.x,
      right: bb.x2 - p.x,
      top: bb.y1 - p.y,
      bottom: bb.y2 - p.y,
    };
  });
  const aspect = cy.width() / Math.max(cy.height(), 1) || 1.6;
  const loneRow: Positions = {};
  let x = 0;
  for (const id of loneIds) {
    loneRow[id] = { x: x - boxes[id].left, y: 0 };
    x += boxes[id].right - boxes[id].left + LONE_NODE_GAP;
  }
  const pack = (best: ComponentLayout[]) =>
    packComponents(
      [...best.map((b) => b.pos), ...(loneIds.length ? [loneRow] : [])],
      boxes,
      aspect,
      COMPONENT_GAP,
    );

  const best = comps.map((c) => layoutComponent(cy, c, c.nodes.toArray(), boxes, large));
  const shown = pack(best);
  setPositions(cy, shown);

  // Background search: one dagre run per tick. Each run moves the live
  // nodes, so their shown positions are restored in the same task — the
  // renderer never paints an intermediate state.
  const rng = createRng(1);
  const jobs: number[] = [];
  for (let k = 0; k < SEARCH_ORDERS; k++)
    comps.forEach((c, i) => {
      if (c.nodes.length >= 4) jobs.push(i);
    });
  let improved = false;
  let timer = 0;
  const step = () => {
    if (cy.destroyed()) return;
    const i = jobs.shift();
    if (i === undefined) {
      const final = improved ? pack(best) : shown;
      layoutCache.set(key, final);
      storeLayout(key, final);
      if (improved) onImproved(final);
      return;
    }
    const comp = comps[i];
    const candidate = layoutComponent(cy, comp, shuffled(comp.nodes.toArray(), rng), boxes, large);
    setPositions(cy, shown);
    if (better(candidate.score, best[i].score)) {
      best[i] = candidate;
      improved = true;
    }
    timer = window.setTimeout(step, 0);
  };
  timer = window.setTimeout(step, 300);
  return () => window.clearTimeout(timer);
}

function topicElements(
  topics: Topic[],
  expandedIds: Set<string> | undefined,
  unitPathIds: Set<string> | null,
): cytoscape.ElementDefinition[] {
  const present = new Set(topics.map((t) => t.id));
  const elements: cytoscape.ElementDefinition[] = [
    ...topics.map((t) => ({
      data: { id: t.id, title: t.title, label: t.title, color: CATEGORY_COLORS[categoryOf(t)] },
    })),
    ...topics.flatMap((t) =>
      t.prerequisites
        .filter((p) => present.has(p))
        .map((p) => ({ data: { id: `${p}->${t.id}`, source: p, target: t.id } })),
    ),
    ...topics.flatMap((t) =>
      (t.optionalPrerequisites ?? [])
        .filter((p) => present.has(p) && !t.prerequisites.includes(p))
        .map((p) => ({
          data: { id: `${p}~opt->${t.id}`, source: p, target: t.id },
          classes: 'optional-edge',
        })),
    ),
  ];

  // Compound expansion: an opened annotated topic renders its subtopics as
  // child nodes with their internal (same-topic) prerequisite order. Edges
  // to other topics stay at the topic level (drawn to the compound box).
  const tmap = buildTopicMap(topics);
  for (const t of topics) {
    if (!expandedIds?.has(t.id) || !t.subtopics?.length) continue;
    for (const s of t.subtopics)
      elements.push({
        data: {
          id: `${t.id}/${s.id}`,
          parent: t.id,
          title: s.title,
          label: s.title,
          color: CATEGORY_COLORS[categoryOf(t)],
        },
        classes: 'subtopic-node',
      });
    for (const s of t.subtopics) {
      const uid = `${t.id}/${s.id}`;
      const addInternal = (raw: string, optional: boolean) => {
        const r = resolveSubtopicRef(raw, t, tmap);
        if (r && r !== uid && parseUnitId(r).topicId === t.id)
          elements.push({
            data: { id: `${r}=>${uid}${optional ? '~o' : ''}`, source: r, target: uid },
            classes: optional ? 'optional-edge' : undefined,
          });
      };
      for (const raw of s.prerequisites) addInternal(raw, false);
      for (const raw of s.optionalPrerequisites ?? []) addInternal(raw, true);
    }
  }

  // Cross-topic unit edges for an active goal path: GraphView otherwise
  // only draws topic-level edges, so units in different (unexpanded)
  // topics would render as disconnected islands even though the goal
  // path connects them at unit granularity.
  if (unitPathIds) {
    const unitMap = buildUnitGraph(topics);
    const nodeIdFor = (u: string) => {
      const { topicId, subId } = parseUnitId(u);
      return subId && expandedIds?.has(topicId) ? u : topicId;
    };
    const seenEdges = new Set<string>();
    for (const u of unitPathIds) {
      const unit = unitMap.get(u);
      if (!unit) continue;
      const targetId = nodeIdFor(u);
      for (const p of unit.prerequisites) {
        if (!unitPathIds.has(p)) continue;
        const sourceId = nodeIdFor(p);
        if (sourceId === targetId) continue;
        const edgeId = `${sourceId}~u->${targetId}`;
        if (seenEdges.has(edgeId)) continue;
        seenEdges.add(edgeId);
        elements.push({ data: { id: edgeId, source: sourceId, target: targetId } });
      }
    }
  }
  return elements;
}

function conceptElements(
  graph: ConceptGraph,
  index: ConceptIndex,
  iconColor: string,
): cytoscape.ElementDefinition[] {
  return [
    ...graph.nodes.map((n) => {
      const radius = nodeRadius(n, index.degree.get(n.id) ?? 0);
      return {
        data: {
          id: n.id,
          title: n.label,
          label: n.label,
          color: TYPE_COLORS[n.type],
          size: 2 * radius,
          radius,
          type: n.type,
          icon: typeIconUri(n.type, iconColor) ?? undefined,
        },
        classes: 'concept-node',
      };
    }),
    ...graph.edges.map((e) => ({
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        relation: normalizeRelationship(e.relationship) ?? e.relationship.trim(),
      },
      classes: 'concept-edge',
    })),
  ];
}

export default function GraphView({
  topics,
  concepts,
  selectedId,
  highlightIds,
  doneIds,
  focus,
  large = false,
  directionalSelect = false,
  expandedIds,
  onToggleExpand,
  theme = 'dark',
  goalId = null,
  unitPathIds = null,
  fitIds = null,
  fitInsets,
  onSelect,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onToggleExpandRef = useRef(onToggleExpand);
  onToggleExpandRef.current = onToggleExpand;
  const lastTapRef = useRef<{ id: string; t: number }>({ id: '', t: 0 });
  const goalIdRef = useRef(goalId);
  goalIdRef.current = goalId;
  const hoverZoomEnterRef = useRef<number | null>(null);
  const hoverZoomExitRef = useRef<number | null>(null);
  const preHoverViewportRef = useRef<{ zoom: number; pan: cytoscape.Position } | null>(null);
  const hoverZoomActiveIdRef = useRef<string | null>(null);
  const fitIdsRef = useRef(fitIds);
  fitIdsRef.current = fitIds;
  const fitInsetsRef = useRef(fitInsets);
  fitInsetsRef.current = fitInsets;
  // The whole-graph fit keeps only the bottom strip (legend) clear — side
  // panels belong to a selection and are gone when nothing is selected.
  const overviewInsets = (): Insets => ({
    left: 0,
    right: 0,
    bottom: fitInsetsRef.current?.bottom ?? 0,
  });

  // (Re)build the graph when the topic/concept set (or expansion) changes
  useEffect(() => {
    const elements = concepts
      ? conceptElements(concepts, buildConceptIndex(concepts), theme === 'light' ? '#1c2333' : '#ffffff')
      : topicElements(topics ?? [], expandedIds, unitPathIds);

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: styleFor(large, theme === 'light'),
      wheelSensitivity: 0.3,
      autoungrabify: true,
    });
    // A user pan/zoom before the background layout search finishes means the
    // improved layout should not re-fit the viewport under them.
    let viewportTouched = false;
    cy.on('scrollzoom dragpan pinchzoom', () => {
      viewportTouched = true;
    });
    let cancelLayoutSearch = () => {};
    if (concepts) {
      cancelLayoutSearch = layoutConcepts(cy, large, (positions) => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const refit = () => {
          const ids = fitIdsRef.current;
          if (ids) fitBeside(cy, cy.nodes().filter((n) => ids.has(n.id())), fitInsetsRef.current ?? NO_INSETS);
          else if (!viewportTouched) fitBeside(cy, cy.elements(), overviewInsets());
        };
        if (reduced) {
          setPositions(cy, positions);
          refit();
          return;
        }
        const glide = cy.layout({
          name: 'preset',
          positions: (n: cytoscape.NodeSingular) => positions[n.id()],
          fit: false,
          animate: true,
          animationDuration: 600,
          animationEasing: 'ease-in-out-cubic',
        } as cytoscape.LayoutOptions);
        glide.one('layoutstop', refit);
        glide.run();
      });
    } else {
      cy.layout(layoutFor(large, false)).run();
    }
    if (concepts) fitBeside(cy, cy.elements(), overviewInsets(), false);
    else cy.fit(undefined, large ? 40 : 24);

    // Zoom-linked fade: small (specific) circles recede as you zoom out and
    // return as you zoom in. rAF-throttled — 'zoom' fires per wheel tick.
    let fadeFrame = 0;
    const applyFade = () => {
      fadeFrame = 0;
      const z = cy.zoom();
      cy.batch(() => {
        cy.nodes().forEach((n) => {
          const px = (n.data('radius') as number) * z;
          n.toggleClass('zoom-faded', px < FADE_PX);
          n.toggleClass('label-hidden', px >= FADE_PX && px < LABEL_PX);
          n.toggleClass('icon-boost', px < ICON_BOOST_PX);
        });
        cy.edges().forEach((e) => {
          e.toggleClass('zoom-faded', e.source().hasClass('zoom-faded') && e.target().hasClass('zoom-faded'));
        });
      });
    };
    if (concepts) {
      applyFade();
      cy.on('zoom', () => {
        if (!fadeFrame) fadeFrame = window.requestAnimationFrame(applyFade);
      });
    }

    // One core-level tap handler (not a delegated 'node' one) so a tap on a
    // subtopic child fires exactly once with the true target — a delegated
    // handler would also fire for the compound parent it bubbles through and
    // re-select the whole topic. Single tap selects; a quick second tap on an
    // annotated topic toggles it open/closed into its subtopics.
    const annotated = new Set((topics ?? []).filter((t) => t.subtopics?.length).map((t) => t.id));
    cy.on('tap', (e) => {
      const tgt = e.target;
      if (tgt === cy) {
        onSelectRef.current(null);
        return;
      }
      if (typeof tgt.isNode !== 'function' || !tgt.isNode()) return;
      const id = tgt.id();
      const now = performance.now();
      const prev = lastTapRef.current;
      lastTapRef.current = { id, t: now };
      if (onToggleExpandRef.current && annotated.has(id) && prev.id === id && now - prev.t < 350) {
        onToggleExpandRef.current(id);
        return;
      }
      onSelectRef.current(id);
    });

    // Hover: grow the node a touch and light up its related tree —
    // prerequisites in silver, unlocked topics in gold; soften the rest.
    // Concepts light 1 hop only: a transitive closure over mixed relation
    // types ("relates" chains) would light half the graph.
    cy.on('mouseover', 'node', (e) => {
      const n = e.target;
      cy.batch(() => {
        cy.elements().addClass('hover-soft');
        if (concepts) {
          n.incomers().removeClass('hover-soft').addClass('hover-pre');
          n.outgoers().removeClass('hover-soft').addClass('hover-post');
        } else {
          n.predecessors().removeClass('hover-soft').addClass('hover-pre');
          n.successors().removeClass('hover-soft').addClass('hover-post');
        }
        n.removeClass('hover-soft').addClass('hovered');
      });
      if (containerRef.current) containerRef.current.style.cursor = 'pointer';
    });
    cy.on('mouseout', 'node', () => {
      cy.batch(() =>
        cy.elements().removeClass('hover-soft hover-pre hover-post hovered'),
      );
      if (containerRef.current) containerRef.current.style.cursor = '';
    });
    if (concepts) {
      cy.on('mouseover', 'edge.concept-edge', (e) => {
        const edge = e.target as cytoscape.EdgeSingular;
        cy.batch(() => {
          edge.addClass('edge-hovered');
          edge.connectedNodes().addClass('edge-end');
        });
      });
      cy.on('mouseout', 'edge.concept-edge', () => {
        cy.batch(() => {
          cy.edges().removeClass('edge-hovered');
          cy.nodes().removeClass('edge-end');
        });
      });
    }

    // Hover-zoom: on the big explorer map, before a goal is chosen, dwelling
    // over an open (expanded) topic softly zooms the viewport to it + its
    // subtopics — a pure fit/revert, no re-layout, no expandedIds change.
    const clearHoverZoomTimers = () => {
      if (hoverZoomEnterRef.current !== null) {
        window.clearTimeout(hoverZoomEnterRef.current);
        hoverZoomEnterRef.current = null;
      }
      if (hoverZoomExitRef.current !== null) {
        window.clearTimeout(hoverZoomExitRef.current);
        hoverZoomExitRef.current = null;
      }
    };
    const zoomToNode = (n: cytoscape.NodeSingular) => {
      if (!preHoverViewportRef.current) {
        preHoverViewportRef.current = { zoom: cy.zoom(), pan: cy.pan() };
      }
      hoverZoomActiveIdRef.current = n.id();
      const eles = n.union(n.children());
      cy.stop();
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        cy.fit(eles, 180);
        return;
      }
      cy.animate({ fit: { eles, padding: 180 } }, { duration: 500, easing: 'ease-in-out-cubic' });
    };
    cy.on('mouseover', 'node', (e) => {
      const n = e.target;
      if (!large || goalIdRef.current) return;
      // Moving from a compound topic's header onto its own child subtopics
      // is still "inside" that hover session — cancel a pending revert
      // instead of treating the child as a new, ineligible target.
      const activeId = hoverZoomActiveIdRef.current;
      if (activeId && !n.isParent() && n.parent().id() === activeId) {
        if (hoverZoomExitRef.current !== null) {
          window.clearTimeout(hoverZoomExitRef.current);
          hoverZoomExitRef.current = null;
        }
        return;
      }
      if (!n.isParent()) return;
      if (hoverZoomExitRef.current !== null) {
        window.clearTimeout(hoverZoomExitRef.current);
        hoverZoomExitRef.current = null;
        zoomToNode(n);
        return;
      }
      if (hoverZoomEnterRef.current !== null) window.clearTimeout(hoverZoomEnterRef.current);
      hoverZoomEnterRef.current = window.setTimeout(() => {
        hoverZoomEnterRef.current = null;
        zoomToNode(n);
      }, 350);
    });
    cy.on('mouseout', 'node', () => {
      if (hoverZoomEnterRef.current !== null) {
        window.clearTimeout(hoverZoomEnterRef.current);
        hoverZoomEnterRef.current = null;
      }
      if (!preHoverViewportRef.current) return;
      if (hoverZoomExitRef.current !== null) window.clearTimeout(hoverZoomExitRef.current);
      hoverZoomExitRef.current = window.setTimeout(() => {
        hoverZoomExitRef.current = null;
        hoverZoomActiveIdRef.current = null;
        const v = preHoverViewportRef.current;
        preHoverViewportRef.current = null;
        if (v) {
          cy.stop();
          cy.viewport(v);
        }
      }, 180);
    });

    if (import.meta.env.DEV) (window as unknown as { __cy?: cytoscape.Core }).__cy = cy;

    cyRef.current = cy;
    return () => {
      if (fadeFrame) window.cancelAnimationFrame(fadeFrame);
      cancelLayoutSearch();
      clearHoverZoomTimers();
      preHoverViewportRef.current = null;
      hoverZoomActiveIdRef.current = null;
      cy.destroy();
      cyRef.current = null;
    };
  }, [topics, concepts, large, expandedIds, theme, unitPathIds]);

  // Apply selection/path highlighting without re-layout
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('chosen dimmed onpath done sel-soft sel-pre sel-post goal-node');
      cy.nodes().forEach((n) => {
        const title = n.data('title') as string | undefined;
        if (title === undefined) return;
        const isDone = doneIds?.has(n.id()) ?? false;
        const isGoal = goalId != null && n.id() === goalId;
        n.data('label', `${isGoal ? '★ ' : ''}${isDone ? '✓ ' : ''}${title}`);
        if (isDone) n.addClass('done');
      });
      if (directionalSelect) {
        // Sticky both-directions tree: silver up (prerequisites), gold down
        // (everything it unlocks); the rest recede but stay legible.
        if (selectedId) {
          const n = cy.$id(selectedId);
          cy.elements().addClass('sel-soft');
          n.predecessors().removeClass('sel-soft').addClass('sel-pre');
          n.successors().removeClass('sel-soft').addClass('sel-post');
          n.removeClass('sel-soft').addClass('chosen');
        }
      } else {
        if (selectedId) cy.$id(selectedId).addClass('chosen');
        if (highlightIds) {
          cy.nodes().forEach((n) => {
            if (!highlightIds.has(n.id())) n.addClass('dimmed');
          });
          cy.edges().forEach((e) => {
            if (highlightIds.has(e.source().id()) && highlightIds.has(e.target().id()))
              e.addClass('onpath');
            else e.addClass('dimmed');
          });
        }
        if (goalId) cy.$id(goalId).addClass('goal-node');
      }
    });
  }, [selectedId, highlightIds, doneIds, topics, concepts, directionalSelect, goalId, theme]);

  // Glide to the focused concept (search / home jumps) — a smooth pan+zoom
  // that frames the concept with its immediate connections, rather than a
  // sudden cut. Reduced-motion gets an instant fit.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !focus?.id) return;
    const node = cy.$id(focus.id);
    if (!node.length) return;
    const eles = node.closedNeighborhood();
    const padding = large ? 130 : 80;
    cy.stop();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cy.fit(eles, padding);
      return;
    }
    cy.animate({ fit: { eles, padding } }, { duration: 900, easing: 'ease-in-out-cubic' });
  }, [focus, large]);

  // Sub-view fit — declared after the focus glide so it wins when both fire.
  const hadFitRef = useRef(false);
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const insets = fitInsetsRef.current ?? NO_INSETS;
    if (fitIds) {
      hadFitRef.current = true;
      fitBeside(cy, cy.nodes().filter((n) => fitIds.has(n.id())), insets);
    } else if (hadFitRef.current) {
      hadFitRef.current = false;
      fitBeside(cy, cy.elements(), overviewInsets());
    }
  }, [fitIds, theme]);

  return <div ref={containerRef} className="graph-canvas" />;
}
