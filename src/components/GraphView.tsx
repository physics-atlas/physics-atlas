import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import cytoscape from 'cytoscape';
import type { ConceptGraph, GraphEdge, GraphNode } from '../data/types';
import type { ConceptOverlay } from '../community/proposals';
import type { DraftShape } from '../community/draft';
import {
  buildConceptIndex,
  INSIDE_LABEL_RADIUS,
  edgeWeight,
  effectiveImportance,
  joinList,
  labelSize,
  nodeRadius,
  normalizeRelationship,
  revealZoom,
} from '../graph/concepts';
import type { ConceptIndex } from '../graph/concepts';
import { TYPE_COLORS } from '../graph/typeColors';
import { typeIconUri } from '../graph/typeIcons';
import {
  arrangeComponent,
  better,
  createRng,
  layoutKey,
  packComponents,
  placeNew,
  removeOverlaps,
  SPACING,
} from '../graph/layoutOptimize';
import { reducedMotion } from '../lib/motion';
import type { LayoutScore, NodeBox, Pos, Positions, Segment } from '../graph/layoutOptimize';

const ICON_BOOST_PX = 14;
/** A line's width in model px when zoomed in — and highlighted (hover, path, proposal). */
const EDGE_WIDTH = 1.5;
const EDGE_WIDTH_EMPH = 2.5;
/** A circle wider than this share of the view has been zoomed past: it fades to an outline. */
const PAST_VIEW = 0.9;
/** Classes that keep a concept on screen at any zoom — what the user is looking at. */
// Proposals (.overlay) and the confirmed concepts they attach to stay visible
// while the proposed layer is on — a proposal must never look disconnected.
// So do the draft, what it connects to, and the concepts it points the proposer at.
const PINNED = [
  'chosen',
  'goal-node',
  'sel-pre',
  'sel-post',
  'path-node',
  'overlay',
  'anchor-pinned',
  'draft',
  'draft-anchor',
  'draft-near',
  'draft-subject',
  'edit-proposed',
  'conflict-match',
];
/** Neither layer of reviewed content: the proposals and the proposer's own draft. */
const NOT_CONFIRMED = '.overlay, .draft';
const NEAR_COUNT = 6;
/** How close (model px) a concept must be to the ghost to count as near it. */
const NEAR_RADIUS = 450;

interface GraphViewProps {
  /**
   * The typed concept graph — circles sized by generality, 1-hop hover,
   * relation-labelled edges, map-style zoom level of detail.
   */
  concepts: ConceptGraph;
  selectedId: string | null;
  /** Nodes to emphasize (e.g. a goal's learning path); others dim. */
  highlightIds: Set<string> | null;
  /** Concepts marked as learned — shown with a ✓ label badge. */
  doneIds?: Set<string>;
  /** Bump `tick` to animate-center the viewport on `id` (e.g. after a search). */
  focus?: { id: string | null; tick: number };
  /**
   * Clicking a node sticks its direct connections (what leads into it, what
   * it leads to) until another node is clicked. When false, the
   * `highlightIds` set drives the dim (a goal's learning path).
   */
  directionalSelect?: boolean;
  /** Light theme swaps the ink/edge palette (canvas can't use CSS vars). */
  theme?: 'dark' | 'light';
  /** The golden-marked goal concept. */
  goalId?: string | null;
  /**
   * Animate-fit the viewport to these nodes whenever the set changes; going
   * back to null re-fits the whole graph.
   */
  fitIds?: Set<string> | null;
  /** Screen px covered by overlay panels on each side, kept clear by `fitIds`. */
  fitInsets?: Insets;
  onSelect: (id: string | null) => void;
  /**
   * The canvas's accessible name. The canvas itself isn't keyboard-operable,
   * so name the keyboard route (search, a list view) here.
   */
  label?: string;
  /**
   * Proposed concepts and relations drawn on top of the confirmed graph
   * (concept variant). They're placed around their connections without
   * moving any confirmed node, and never enter the layout cache.
   */
  overlay?: ConceptOverlay | null;
  /** Which layers show. Hidden confirmed concepts that a proposal attaches to stay as faint context. */
  layers?: { confirmed: boolean; overlay: boolean };
  /** More buttons for the map's control bar (e.g. layer toggles). */
  extraControls?: ReactNode;
  /**
   * The proposals being drafted (concept variant): a ghost per new concept,
   * which the proposer can drag to see where it fits, edits previewed on the
   * confirmed concept, and their relations. Confirmed concepts never move for
   * them, and ghost positions are never reported as data.
   */
  draft?: DraftOverlay | null;
  /**
   * The confirmed concepts nearest a ghost, nearest first — after it's placed,
   * re-placed or dragged. `byHand`: the proposer has dragged it; `ghostId`:
   * which one (dragging a ghost makes its draft the active one).
   */
  onDraftNear?: (ids: string[], byHand: boolean, ghostId: string) => void;
  /** Bump to move the active ghost into the middle of the view. */
  draftRecall?: number;
}

export interface DraftOverlay {
  drafts: DraftShape[];
  /** The draft the editor shows: its ghost glows strongest and gets the suggestions */
  activeKey: string | null;
  /** Concepts offered as connections — marked "＋ Connect?" */
  nearIds: string[];
  /** Existing concepts with a name like the draft's — marked "≈ Similar name" */
  conflictIds: string[];
}

const ZOOM_STEP = 1.5;
const NO_IDS: string[] = [];
const NO_SHAPES: DraftShape[] = [];
/** What an edit draft overrides on the confirmed concept while it's previewed. */
const SUBJECT_KEYS = ['title', 'label', 'badge', 'color', 'size', 'radius', 'importance', 'fontSize', 'fontSizeEmph', 'type', 'icon'];
const DRAFT_BADGE = 'Draft · not submitted';
/** The zoom the editor opens at, at least: mid-importance names are readable (15px × 0.75 ≥ 9px). */
const DRAFT_ZOOM = 0.75;

interface Insets {
  left: number;
  right: number;
  bottom: number;
}

const NO_INSETS: Insets = { left: 0, right: 0, bottom: 0 };
const FIT_PADDING = 48;
const FIT_MAX_ZOOM = 1.3;

const fitZoom = (bb: { w: number; h: number }, w: number, h: number) =>
  Math.min(FIT_MAX_ZOOM, w / Math.max(bb.w, 1), h / Math.max(bb.h, 1));

/**
 * Call before reading bounds. Cytoscape applies style changes lazily, and its
 * bounds code decides whether a label needs re-measuring before it applies
 * them — so the first read after a label, badge or font change measures the
 * old label and keeps that box, and the renderer then draws the name clipped
 * and stretched into it. Reading any style applies the pending changes first.
 */
function settleStyles(eles: cytoscape.Collection | cytoscape.NodeCollection) {
  eles.forEach((e) => {
    e.numericStyle('font-size');
  });
}

/** The zoom at which the whole graph fits — the level-of-detail reference. */
function overviewZoom(cy: cytoscape.Core, insets: Insets): number {
  const w = Math.max(cy.width() - insets.left - insets.right - 2 * FIT_PADDING, 1);
  const h = Math.max(cy.height() - insets.bottom - 2 * FIT_PADDING, 1);
  settleStyles(cy.elements());
  return fitZoom(cy.elements().boundingBox(), w, h);
}

/**
 * A relation's name plus what's proposed for it, in words — a removal by an
 * open proposal, or by the proposer's own draft. Restores the plain name when
 * neither applies any more.
 */
function refreshEdgeNotes(cy: cytoscape.Core) {
  cy.edges().forEach((e) => {
    const marked = e.hasClass('removal-proposed') || e.hasClass('removal-draft');
    if (!marked && e.data('relationBase') === undefined) return;
    if (e.data('relationBase') === undefined) e.data('relationBase', e.data('relation'));
    const notes = [
      e.hasClass('removal-proposed') ? '(removal proposed)' : '',
      e.hasClass('removal-draft') ? '(your draft removes this)' : '',
    ].filter(Boolean);
    e.data('relation', [e.data('relationBase'), ...notes].join('\n'));
  });
}

/** The model point in the middle of the canvas area the panels leave visible. */
function visibleCentre(cy: cytoscape.Core, insets: Insets): Pos {
  const pan = cy.pan();
  const zoom = cy.zoom();
  const x = insets.left + (cy.width() - insets.left - insets.right) / 2;
  const y = (cy.height() - insets.bottom) / 2;
  return { x: (x - pan.x) / zoom, y: (y - pan.y) / zoom };
}

/** Whether `eles` are fully on screen, clear of the panels. */
function inView(cy: cytoscape.Core, eles: cytoscape.CollectionReturnValue, insets: Insets): boolean {
  settleStyles(eles);
  const bb = eles.renderedBoundingBox({ includeLabels: true });
  return bb.x1 >= insets.left && bb.x2 <= cy.width() - insets.right && bb.y1 >= 0 && bb.y2 <= cy.height() - insets.bottom;
}

/** cy.fit() with asymmetric side insets, so the fit lands beside overlay panels. */
function fitBeside(
  cy: cytoscape.Core,
  eles: cytoscape.CollectionReturnValue,
  insets: Insets,
  animate = true,
) {
  // Too little room left between the panels: give up the left one first (the
  // card on the right is what the user just opened); on narrow screens the
  // panels cover the canvas anyway — fit the full width.
  if (insets.left + insets.right > cy.width() * 0.75) insets = { ...insets, left: 0 };
  if (insets.right > cy.width() * 0.75) insets = { ...insets, right: 0 };
  settleStyles(eles);
  const bb = eles.boundingBox();
  const w = cy.width() - insets.left - insets.right - 2 * FIT_PADDING;
  const h = cy.height() - insets.bottom - 2 * FIT_PADDING;
  if (w <= 0 || h <= 0 || eles.empty()) return;
  const zoom = fitZoom(bb, w, h);
  const pan = {
    x: insets.left + FIT_PADDING + (w - bb.w * zoom) / 2 - bb.x1 * zoom,
    y: FIT_PADDING + (h - bb.h * zoom) / 2 - bb.y1 * zoom,
  };
  cy.stop();
  if (!animate || reducedMotion()) cy.viewport({ zoom, pan });
  else cy.animate({ zoom, pan }, { duration: 700, easing: 'ease-in-out-cubic' });
}

const styleFor = (light: boolean) => {
  const ink = light ? '#1c2333' : '#eef2fb';
  const surface = light ? '#f3f5fa' : '#070b14';
  // Relation names: full-contrast ink, told apart from concept names by italics
  // and their background plate rather than by a dimmer grey.
  const relationInk = light ? '#2f3a52' : '#e3e9f6';
  const fadeDuration = reducedMotion() ? '0s' : '0.3s';
  // A line's opacity follows the more important of its two concepts
  // (data(strength), 0–1); arrowheads share it.
  const edge = light ? 'rgb(70, 90, 135)' : 'rgb(160, 180, 224)';
  const edgeArrow = light ? 'rgb(60, 78, 120)' : 'rgb(178, 196, 236)';
  const edgeOpacity = light ? 'mapData(strength, 0, 1, 0.42, 0.75)' : 'mapData(strength, 0, 1, 0.3, 0.65)';
  const onpath = light ? 'rgba(47, 111, 196, 0.85)' : 'rgba(143, 183, 255, 0.85)';
  const onpathArrow = light ? 'rgba(47, 111, 196, 0.9)' : 'rgba(143, 183, 255, 0.9)';
  const silver = light ? '#7d8db0' : '#cdd6e8';
  const silverEdge = light ? 'rgba(100, 115, 145, 0.85)' : 'rgba(205, 214, 232, 0.85)';
  const silverArrow = light ? 'rgba(100, 115, 145, 0.9)' : 'rgba(205, 214, 232, 0.9)';
  const gold = light ? '#b0821e' : '#e6b566';
  const goldEdge = light ? 'rgba(176, 130, 30, 0.85)' : 'rgba(230, 181, 102, 0.85)';
  const goldArrow = light ? 'rgba(176, 130, 30, 0.9)' : 'rgba(230, 181, 102, 0.9)';
  // The draft: the app's accent (focus-ring) colour, which no node type uses.
  const accent = light ? '#2f6fc4' : '#8fb7ff';
  return [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      'background-opacity': 0.16,
      'border-width': 1.5,
      'border-color': 'data(color)',
      'border-opacity': 0.85,
      label: 'data(label)',
      color: ink,
      'font-family': 'system-ui, -apple-system, "Segoe UI", sans-serif',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
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
      'text-max-width': 'data(labelWidth)',
      // More important concepts get bigger names, like a map's city labels;
      // names too small to read on screen are dropped.
      'font-size': 'data(fontSize)',
      'min-zoomed-font-size': 9,
      // Every glow (hover, selection, edge ends) follows the circle.
      'underlay-shape': 'ellipse',
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
  // A big concept: its name inside the circle on a plate (readable over the
  // fill), the glyph above it.
  {
    selector: 'node.concept-node.label-inside',
    style: {
      'text-valign': 'center',
      'text-margin-y': 'data(labelShift)',
      'text-background-color': surface,
      'text-background-opacity': 0.78,
      'text-background-padding': '4px',
      'text-background-shape': 'roundrectangle',
      'background-position-y': '22%',
      'background-width': '42%',
      'background-height': '42%',
    },
  },
  // Zoomed out, the circle is only a few px across — let the glyph fill more of it.
  {
    selector: 'node.concept-node[icon].icon-boost',
    style: { 'background-width': '86%', 'background-height': '86%', 'background-position-y': '50%' },
  },
  // Proposed layer — status by outline pattern and the badge line in the
  // label, never by fill: the fill still says the concept's type. Defined
  // before the selection/hover states, which only change width and colour,
  // so the pattern survives them.
  {
    selector: 'node.overlay',
    style: {
      'border-style': 'dashed',
      // room for the badge line ("Proposed · ✓2 ✗0 ?1") at the selected font size
      'text-max-width': 'data(labelWidthWide)',
      'border-width': 3,
      'border-color': ink,
      'border-opacity': 1,
      'background-opacity': 0.3,
    },
  },
  { selector: 'node.overlay.status-contested', style: { 'border-style': 'double', 'border-width': 6 } },
  {
    selector: 'edge.overlay',
    style: {
      'line-style': 'dashed',
      'line-dash-pattern': [8, 5],
      width: 'data(widthEmph)',
      'line-color': ink,
      'target-arrow-color': ink,
      'line-opacity': 0.75,
    },
  },
  { selector: 'edge.overlay.status-contested', style: { 'line-style': 'dotted' } },
  // The proposer's draft: dashed outline with a steady glow (it never pulses —
  // nothing here animates on its own), and the badge "Draft · not submitted".
  {
    selector: 'node.draft',
    style: {
      'border-style': 'dashed',
      'border-width': 3,
      'border-color': accent,
      'border-opacity': 1,
      'background-opacity': 0.3,
      'text-max-width': 'data(labelWidthWide)',
      'underlay-color': accent,
      'underlay-opacity': 0.22,
      'underlay-padding': 10,
      'underlay-shape': 'ellipse',
    },
  },
  {
    selector: 'edge.draft',
    style: {
      'line-style': 'dashed',
      'line-dash-pattern': [6, 4],
      width: 'data(widthEmph)',
      'line-color': accent,
      'target-arrow-color': accent,
      'line-opacity': 0.95,
    },
  },
  // The draft the editor shows glows strongest; the others stay dashed but quieter.
  { selector: 'node.draft.draft-active', style: { 'border-width': 4, 'underlay-opacity': 0.38, 'underlay-padding': 12 } },
  { selector: 'edge.draft.draft-idle', style: { 'line-opacity': 0.55, width: 'data(width)' } },
  // An edit draft previews on the confirmed concept itself ("✎ Editing · draft").
  {
    selector: 'node.draft-subject',
    style: {
      'border-style': 'dashed',
      'border-width': 4,
      'border-color': accent,
      'border-opacity': 1,
      'underlay-color': accent,
      'underlay-opacity': 0.3,
      'underlay-padding': 10,
      'underlay-shape': 'ellipse',
      'text-max-width': 'data(labelWidthWide)',
    },
  },
  // Removals: dotted, with the reason in words on the line ("(removal proposed)").
  {
    selector: 'edge.removal-draft',
    style: { 'line-style': 'dotted', 'line-color': accent, 'target-arrow-color': accent, 'line-opacity': 1, width: 'data(widthEmph)' },
  },
  // Someone else's open edit: the confirmed concept gets a dashed ink outline
  // and "✎ Edit proposed · ✓…" in its label.
  {
    selector: 'node.edit-proposed',
    style: { 'border-style': 'dashed', 'border-width': 3, 'border-color': ink, 'border-opacity': 1, 'text-max-width': 'data(labelWidthWide)' },
  },
  { selector: 'edge.removal-proposed', style: { 'line-style': 'dotted', 'line-color': ink, 'line-opacity': 0.75 } },
  // Offered as a connection ("＋ Connect?" in the label) / named like the draft ("≈ Similar name").
  {
    selector: 'node.draft-near',
    style: {
      'underlay-color': accent,
      'underlay-opacity': 0.16,
      'underlay-padding': 7,
      'underlay-shape': 'ellipse',
      'text-max-width': 'data(labelWidthWide)',
    },
  },
  {
    selector: 'node.conflict-match',
    style: {
      'text-max-width': 'data(labelWidthWide)',
      'border-width': 4,
      'border-color': gold,
      'border-opacity': 1,
      'underlay-color': gold,
      'underlay-opacity': 0.2,
      'underlay-padding': 8,
      'underlay-shape': 'ellipse',
    },
  },
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
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      width: 'data(width)',
      'line-color': edge,
      'line-opacity': edgeOpacity,
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
      color: relationInk,
      'font-size': 11,
      'font-style': 'italic',
      // Cytoscape drops a label whose on-screen size falls below this, so
      // relation names vanish when zoomed out instead of piling up.
      'min-zoomed-font-size': 9,
      'font-family': 'system-ui, -apple-system, "Segoe UI", sans-serif',
      'text-rotation': 'autorotate',
      'text-wrap': 'wrap',
      'text-max-width': '220px',
      'text-background-color': surface,
      'text-background-opacity': 0.75,
      'text-background-padding': 2,
      'transition-duration': fadeDuration,
    },
  },
  {
    selector: 'edge.onpath',
    style: {
      width: 'data(widthEmph)',
      'line-opacity': 1,
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
      width: 'data(widthEmph)',
      'line-opacity': 1,
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
      width: 'data(widthEmph)',
      'line-opacity': 1,
      'line-color': goldEdge,
      'target-arrow-color': goldArrow,
    },
  },
  // A clicked concept is a sub-view: the rest fades as far as a goal path's
  // dim, and its neighbours stay readable even where the zoom fade hid them.
  { selector: 'node.concept-node.sel-soft', style: { opacity: 0.16 } },
  { selector: 'edge.concept-edge.sel-soft', style: { opacity: 0.08 } },
  {
    selector: 'node.concept-node.sel-pre, node.concept-node.sel-post',
    style: { opacity: 1, 'text-opacity': 1, 'background-opacity': 0.7 },
  },
  {
    selector: 'edge.concept-edge.sel-pre, edge.concept-edge.sel-post',
    style: {
      opacity: 1,
      color: ink,
      'font-size': 12.5,
      'font-weight': 'bold',
      'text-background-opacity': 0.85,
      'z-index': 15,
    },
  },
  // Hover states — defined last so they win over dimmed/onpath/sel while active.
  // Others recede but stay clearly visible. Direction is color-coded:
  // silver = prerequisites (what it stands on), gold = what it unlocks.
  { selector: 'node.hover-soft', style: { opacity: 0.45 } },
  { selector: 'edge.hover-soft', style: { opacity: 0.18 } },
  // Zoom level of detail — after every dim so a hidden concept stays hidden,
  // before the hover highlights so hovering a concept still pops out its
  // hidden neighbours. Pinned concepts never get the class (see PINNED).
  {
    selector: 'node.zoom-hidden',
    style: { opacity: 0, 'text-opacity': 0, events: 'no', 'transition-duration': fadeDuration },
  },
  { selector: 'edge.zoom-hidden', style: { opacity: 0, events: 'no', 'transition-duration': fadeDuration } },
  // Zoomed past a big concept: only a faint outline is left, and it no longer
  // catches clicks meant for the concepts around it.
  {
    selector: 'node.zoom-past',
    style: {
      'background-opacity': 0.05,
      'background-image-opacity': 0.08,
      'border-opacity': 0.3,
      'text-opacity': 0,
      events: 'no',
      'transition-duration': fadeDuration,
    },
  },
  // Layer toggles: a hidden layer is gone; confirmed concepts a proposal
  // attaches to stay as faint context.
  { selector: 'node.layer-context', style: { opacity: 0.35 } },
  { selector: '.layer-hidden', style: { display: 'none' } },
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
      width: 'data(widthEmph)',
      'line-opacity': 1,
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
      width: 'data(widthEmph)',
      'line-opacity': 1,
      'line-color': goldEdge,
      'target-arrow-color': goldArrow,
    },
  },
  {
    selector: 'node.hovered',
    style: {
      opacity: 1,
      'text-opacity': 1,
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
      width: 'data(widthEmph)',
      'line-opacity': 1,
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
  // strong, or small circles vanish on hover.
  { selector: 'node.concept-node.hovered', style: { padding: '3px', 'font-size': 'data(fontSizeEmph)' } },
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
      'font-size': 'data(fontSizeEmph)',
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
  // A name written inside its circle stays where it is, under the glyph.
  { selector: 'node.concept-node.label-inside.edge-end', style: { 'text-margin-y': 'data(labelShift)' } },
] as unknown as cytoscape.StylesheetJson;
};

// Concept layout: each connected component is arranged on its own (so
// unrelated sub-graphs never interleave) by a direction-free force layout,
// then the components are packed side by side. A first, quick pass shows
// immediately; a background search over seeds then keeps whichever
// arrangement has the fewest crossings, edges through nodes and overlapping
// names, glides to it, and caches it per graph.
const SEARCH_SEEDS = 24;
const COMPONENT_GAP = 120 * SPACING;
const LONE_NODE_GAP = 40 * SPACING;
const LAYOUT_STORE_KEY = 'physics-atlas-concept-layout-v8';
const layoutCache = new Map<string, Positions>();

interface ConceptComponent {
  ids: string[];
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
  onImproved: (positions: Positions) => void,
): () => void {
  const all = cy
    .elements()
    .components()
    .sort((a, b) => b.nodes().length - a.nodes().length);
  const comps: ConceptComponent[] = all
    .filter((c) => c.nodes().length > 1)
    .map((c) => ({
      ids: c.nodes().map((n) => n.id()),
      segments: c.edges().map((e) => [e.source().id(), e.target().id()] as Segment),
    }));
  // Unlinked concepts share one compact row instead of each taking a full slot.
  const loneIds = all.filter((c) => c.nodes().length === 1).map((c) => c.nodes()[0].id());
  const key = layoutKey(
    cy.nodes().map((n) => n.id()),
    comps.flatMap((c) => c.segments),
    'concepts',
  );
  const cached = layoutCache.get(key) ?? readStoredLayout(key);
  if (cached) {
    layoutCache.set(key, cached);
    setPositions(cy, cached);
    return () => {};
  }

  const boxes = nodeBoxes(cy.nodes());
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

  const best = comps.map((c, i) => arrangeComponent(c.ids, c.segments, boxes, createRng(1 + i)));
  const shown = pack(best);
  setPositions(cy, shown);

  // Background search: one seeded arrangement per tick, so the page stays
  // responsive while it runs.
  const jobs: { comp: number; seed: number }[] = [];
  for (let k = 1; k <= SEARCH_SEEDS; k++)
    comps.forEach((c, i) => {
      if (c.ids.length >= 3) jobs.push({ comp: i, seed: 1 + i + 7919 * k });
    });
  let improved = false;
  let timer = 0;
  const step = () => {
    if (cy.destroyed()) return;
    const job = jobs.shift();
    if (job === undefined) {
      const final = improved ? pack(best) : shown;
      layoutCache.set(key, final);
      storeLayout(key, final);
      if (improved) onImproved(final);
      return;
    }
    const i = job.comp;
    const comp = comps[i];
    const candidate = arrangeComponent(comp.ids, comp.segments, boxes, createRng(job.seed));
    if (better(candidate.score, best[i].score)) {
      best[i] = candidate;
      improved = true;
    }
    timer = window.setTimeout(step, 0);
  };
  timer = window.setTimeout(step, 300);
  return () => window.clearTimeout(timer);
}

/** A node's label: goal/learned markers, its name, and a status badge on a second line. */
function nodeLabel(title: string, { goal = false, done = false, badge }: { goal?: boolean; done?: boolean; badge?: string }) {
  return `${goal ? '★ ' : ''}${done ? '✓ ' : ''}${title}${badge ? `\n${badge}` : ''}`;
}

function conceptNodeElement(n: GraphNode, degree: number, iconColor: string, classes = '', badge?: string) {
  const importance = effectiveImportance(n, degree);
  const radius = nodeRadius(n, degree);
  const inside = radius >= INSIDE_LABEL_RADIUS;
  return {
    data: {
      id: n.id,
      title: n.label,
      badge,
      label: nodeLabel(n.label, { badge }),
      color: TYPE_COLORS[n.type],
      size: 2 * radius,
      radius,
      importance,
      fontSize: labelSize(importance, radius),
      // Hover emphasis grows a small name but never shrinks a big one.
      fontSizeEmph: Math.max(labelSize(importance, radius), 15),
      // A big concept's name sits inside its circle, in its lower half.
      labelWidth: inside ? 1.5 * radius : 140,
      // Room for the badge line: inside, the circle's full width.
      labelWidthWide: inside ? 2 * radius : 220,
      labelShift: inside ? 0.4 * radius : 4,
      type: n.type,
      icon: typeIconUri(n.type, iconColor) ?? undefined,
    },
    classes: `concept-node${inside ? ' label-inside' : ''} ${classes}`.trim(),
    // Only the draft can be dragged; everything else is placed by the layout.
    grabbable: false,
  };
}

function conceptEdgeElement(e: GraphEdge, classes = '', status?: string) {
  const relation = normalizeRelationship(e.relationship) ?? e.relationship.trim();
  const assumed = (e.conditions ?? []).map((c) => c.label);
  // The assumption goes on its own line under the relation name, then the status.
  const lines = [relation, assumed.length ? `assuming ${joinList(assumed)}` : '', status ? `(${status})` : ''];
  return {
    // width and strength are recomputed with the zoom (applyFade); these hold until then.
    data: {
      id: e.id,
      source: e.source,
      target: e.target,
      relation: lines.filter(Boolean).join('\n'),
      width: EDGE_WIDTH,
      widthEmph: EDGE_WIDTH_EMPH,
      strength: 0,
    },
    classes: `concept-edge ${classes}`.trim(),
  };
}

function conceptElements(
  graph: ConceptGraph,
  index: ConceptIndex,
  iconColor: string,
): cytoscape.ElementDefinition[] {
  return [
    ...graph.nodes.map((n) => conceptNodeElement(n, index.degree.get(n.id) ?? 0, iconColor)),
    ...graph.edges.map((e) => conceptEdgeElement(e)),
  ];
}

/** Proposed concepts and relations, drawn on top of the confirmed graph (`.overlay`). */
function overlayElements(overlay: ConceptOverlay, iconColor: string): cytoscape.ElementDefinition[] {
  const degree = new Map<string, number>();
  for (const { edge } of overlay.edges)
    for (const end of [edge.source, edge.target]) degree.set(end, (degree.get(end) ?? 0) + 1);
  return [
    ...overlay.nodes.map(({ node, status, badge, proposalId }) => {
      const el = conceptNodeElement(node, degree.get(node.id) ?? 0, iconColor, `overlay status-${status}`, badge);
      return { ...el, data: { ...el.data, proposalId } };
    }),
    ...overlay.edges.map(({ edge, status, proposalId }) => {
      const el = conceptEdgeElement(edge, `overlay status-${status}`, status === 'contested' ? 'contested' : 'proposed');
      return { ...el, data: { ...el.data, proposalId } };
    }),
  ];
}

/** Label-inclusive extents of the given nodes, as offsets from each centre. */
function nodeBoxes(nodes: cytoscape.NodeCollection): Record<string, NodeBox> {
  const boxes: Record<string, NodeBox> = {};
  settleStyles(nodes);
  nodes.forEach((n) => {
    const p = n.position();
    const bb = n.boundingBox({ includeLabels: true });
    boxes[n.id()] = { radius: n.width() / 2, left: bb.x1 - p.x, right: bb.x2 - p.x, top: bb.y1 - p.y, bottom: bb.y2 - p.y };
  });
  return boxes;
}

export default function GraphView({
  concepts,
  selectedId,
  highlightIds,
  doneIds,
  focus,
  directionalSelect = false,
  theme = 'dark',
  goalId = null,
  fitIds = null,
  fitInsets,
  onSelect,
  label = 'Interactive map',
  overlay = null,
  layers,
  extraControls,
  draft = null,
  onDraftNear,
  draftRecall = 0,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const applyFadeRef = useRef<(() => void) | null>(null);
  /** Positions for the overlay given confirmed positions — null when there's no overlay. */
  const placeOverlayRef = useRef<((confirmed: Positions) => Positions) | null>(null);
  const fitIdsRef = useRef(fitIds);
  fitIdsRef.current = fitIds;
  const fitInsetsRef = useRef(fitInsets);
  fitInsetsRef.current = fitInsets;
  const viewportTouchedRef = useRef(false);
  const onDraftNearRef = useRef(onDraftNear);
  onDraftNearRef.current = onDraftNear;
  /** Where each ghost sits (session only — never data), and whether the proposer dragged it there. */
  const draftPlaceRef = useRef(new Map<string, { pos: Pos; byHand: boolean; anchors: string }>());
  const activeGhostRef = useRef<string | null>(null);
  /** Confirmed concepts previewed as edited, with what they showed before. */
  const subjectBaseRef = useRef(new Map<string, Record<string, unknown>>());
  // The whole-graph fit keeps only the bottom strip (legend) clear — side
  // panels belong to a selection and are gone when nothing is selected.
  // "Show all" switches the zoom level of detail off — everything visible at
  // any zoom, for learners who'd rather not hunt for detail by zooming.
  const [showAll, setShowAll] = useState(false);
  const showAllRef = useRef(showAll);
  showAllRef.current = showAll;
  useEffect(() => {
    applyFadeRef.current?.();
  }, [showAll]);
  const overviewInsets = (): Insets => ({
    left: 0,
    right: 0,
    bottom: fitInsetsRef.current?.bottom ?? 0,
  });

  /** Tells the editor which confirmed concepts sit nearest a ghost (the active one by default). */
  const reportNear = (ghostId = activeGhostRef.current) => {
    const cy = cyRef.current;
    const ghost = ghostId ? cy?.$id(ghostId) : undefined;
    if (!cy || !ghostId || !ghost || ghost.empty()) return;
    const p = ghost.position();
    const d = (n: cytoscape.NodeSingular) => Math.hypot(n.position().x - p.x, n.position().y - p.y);
    const near = cy
      .nodes()
      .not(NOT_CONFIRMED)
      .filter((n) => !n.hasClass('layer-hidden') && d(n as cytoscape.NodeSingular) <= NEAR_RADIUS)
      .toArray()
      .sort((a, b) => d(a as cytoscape.NodeSingular) - d(b as cytoscape.NodeSingular))
      .slice(0, NEAR_COUNT)
      .map((n) => n.id());
    onDraftNearRef.current?.(near, draftPlaceRef.current.get(ghostId)?.byHand ?? false, ghostId);
  };

  // (Re)build the graph when the concept set or the theme changes
  useEffect(() => {
    const elements = conceptElements(concepts, buildConceptIndex(concepts), theme === 'light' ? '#1c2333' : '#ffffff');

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: styleFor(theme === 'light'),
      wheelSensitivity: 1,
    });
    // A user pan/zoom before the background layout search finishes means the
    // improved layout should not re-fit the viewport under them.
    viewportTouchedRef.current = false;
    cy.on('scrollzoom dragpan pinchzoom', () => {
      viewportTouchedRef.current = true;
    });
    const cancelLayoutSearch = layoutConcepts(cy, (improved) => {
      // Proposals follow the confirmed graph into its better arrangement.
      const positions = { ...improved, ...(placeOverlayRef.current?.(improved) ?? {}) };
      const reduced = reducedMotion();
      const refit = () => {
        const ids = fitIdsRef.current;
        if (!viewportTouchedRef.current) {
          if (ids) fitBeside(cy, cy.nodes().filter((n) => ids.has(n.id())), fitInsetsRef.current ?? NO_INSETS);
          else fitBeside(cy, cy.elements(), overviewInsets());
        }
        // The overview zoom moved with the layout, even if the viewport didn't.
        applyFadeRef.current?.();
      };
      if (reduced) {
        setPositions(cy, positions);
        refit();
        return;
      }
      const glide = cy.layout({
        name: 'preset',
        // The draft keeps its place; the proposer put it there.
        positions: (n: cytoscape.NodeSingular) => positions[n.id()] ?? n.position(),
        fit: false,
        animate: true,
        animationDuration: 600,
        animationEasing: 'ease-in-out-cubic',
      } as cytoscape.LayoutOptions);
      glide.one('layoutstop', refit);
      glide.run();
    });
    fitBeside(cy, cy.elements(), overviewInsets(), false);

    // Map-style level of detail: as you zoom out, less important concepts
    // (and the lines to them) disappear, leaving the landmarks; zooming in
    // brings them back. Thresholds are relative to the whole-map overview, so
    // they hold however large the graph grows. rAF-throttled — 'zoom' fires
    // per wheel tick.
    let fadeFrame = 0;
    const applyFade = () => {
      fadeFrame = 0;
      const z = cy.zoom();
      const overview = overviewZoom(cy, overviewInsets());
      // Zoomed in so far that a circle is bigger than the view: you're past it.
      const pastAt = PAST_VIEW * Math.min(cy.width(), cy.height());
      cy.batch(() => {
        cy.nodes().forEach((n) => {
          const pinned = showAllRef.current || PINNED.some((c) => n.hasClass(c));
          const reveal = revealZoom(n.data('importance') as number);
          const onScreen = 2 * (n.data('radius') as number) * z;
          n.toggleClass('zoom-hidden', !pinned && z < reveal * overview);
          n.toggleClass('zoom-past', !n.hasClass('chosen') && onScreen > pastAt);
          n.toggleClass('icon-boost', (n.data('radius') as number) * z < ICON_BOOST_PX);
        });
        cy.edges().forEach((e) => {
          const [s, t] = [e.source(), e.target()];
          e.toggleClass('zoom-hidden', s.hasClass('zoom-hidden') || t.hasClass('zoom-hidden'));
          // Zoomed out, a line keeps an on-screen width that follows the more
          // general of its two concepts; zoomed in, it grows with the map.
          const { px, strength } = edgeWeight(
            [s.data('radius') as number, t.data('radius') as number],
            [s.data('importance') as number, t.data('importance') as number],
          );
          const width = Math.round(100 * Math.max(EDGE_WIDTH, px / z)) / 100;
          const emph = Math.round(100 * Math.max(EDGE_WIDTH_EMPH, (px + 1.5) / z)) / 100;
          if (e.data('width') !== width) e.data({ width, widthEmph: emph });
          if (e.data('strength') !== strength) e.data('strength', strength);
        });
      });
    };
    applyFade();
    cy.on('zoom', () => {
      if (!fadeFrame) fadeFrame = window.requestAnimationFrame(applyFade);
    });
    applyFadeRef.current = applyFade;

    // Dragging the draft is how the proposer works out where it fits: the
    // concepts nearest it are offered as connections as it moves.
    let dragFrame = 0;
    cy.on('drag', 'node.draft', (e) => {
      const n = e.target as cytoscape.NodeSingular;
      const anchors = draftPlaceRef.current.get(n.id())?.anchors ?? '';
      draftPlaceRef.current.set(n.id(), { pos: { ...n.position() }, byHand: true, anchors });
      if (!dragFrame)
        dragFrame = window.requestAnimationFrame(() => {
          dragFrame = 0;
          reportNear(n.id());
        });
    });
    cy.on('grab', 'node.draft', () => {
      if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
    });
    cy.on('free', 'node.draft', (e) => {
      if (containerRef.current) containerRef.current.style.cursor = 'grab';
      reportNear((e.target as cytoscape.NodeSingular).id());
    });

    cy.on('tap', (e) => {
      const tgt = e.target;
      if (tgt === cy) {
        onSelectRef.current(null);
        return;
      }
      if (typeof tgt.isNode === 'function' && tgt.isNode()) onSelectRef.current(tgt.id());
    });

    // Hover: light up the concept's direct connections — what leads into it
    // in silver, what it leads to in gold; soften the rest. One hop only: a
    // transitive closure over mixed relation types ("relates" chains) would
    // light half the graph.
    cy.on('mouseover', 'node', (e) => {
      const n = e.target;
      cy.batch(() => {
        cy.elements().addClass('hover-soft');
        n.incomers().removeClass('hover-soft').addClass('hover-pre');
        n.outgoers().removeClass('hover-soft').addClass('hover-post');
        n.removeClass('hover-soft').addClass('hovered');
      });
      if (containerRef.current) containerRef.current.style.cursor = n.hasClass('draft') ? 'grab' : 'pointer';
    });
    cy.on('mouseout', 'node', () => {
      cy.batch(() =>
        cy.elements().removeClass('hover-soft hover-pre hover-post hovered'),
      );
      if (containerRef.current) containerRef.current.style.cursor = '';
    });
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

    if (import.meta.env.DEV) (window as unknown as { __cy?: cytoscape.Core }).__cy = cy;

    cyRef.current = cy;
    return () => {
      if (fadeFrame) window.cancelAnimationFrame(fadeFrame);
      if (dragFrame) window.cancelAnimationFrame(dragFrame);
      cancelLayoutSearch();
      applyFadeRef.current = null;
      cy.destroy();
      cyRef.current = null;
    };
  }, [concepts, theme]);

  // Proposed layer: added after the confirmed layout (so it never enters the
  // layout search or its cache), placed around its connections with every
  // confirmed node fixed. Re-runs whenever the graph is rebuilt.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.remove('.overlay');
    cy.nodes().removeClass('overlay-anchor');
    if (!overlay || (overlay.nodes.length === 0 && overlay.edges.length === 0)) {
      placeOverlayRef.current = null;
      return;
    }
    cy.add(overlayElements(overlay, theme === 'light' ? '#1c2333' : '#ffffff'));
    const newIds = overlay.nodes.map((o) => o.node.id);
    const isNew = new Set(newIds);
    for (const { edge } of overlay.edges)
      for (const end of [edge.source, edge.target]) if (!isNew.has(end)) cy.$id(end).addClass('overlay-anchor');
    const segments = overlay.edges.map(({ edge }) => [edge.source, edge.target] as Segment);
    const boxes = nodeBoxes(cy.nodes());
    const place = (confirmed: Positions) => placeNew(confirmed, newIds, segments, boxes, createRng(11));
    placeOverlayRef.current = place;
    const current: Positions = {};
    cy.nodes().not(NOT_CONFIRMED).forEach((n) => {
      current[n.id()] = { ...n.position() };
    });
    setPositions(cy, place(current));
    return () => {
      placeOverlayRef.current = null;
    };
  }, [overlay, concepts, theme]);

  // The drafts: a ghost per new concept, which the proposer drags to see where
  // the idea fits, and for an edit the confirmed concept itself, previewed as
  // edited. Added after the confirmed layout and never part of it — confirmed
  // concepts don't move for them, and ghost positions stay in this session.
  const draftShapes = draft?.drafts ?? NO_SHAPES;
  const activeDraft = draft?.activeKey ?? null;
  const draftNearIds = draft?.nearIds ?? NO_IDS;
  const draftConflictIds = draft?.conflictIds ?? NO_IDS;
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const insets = fitInsetsRef.current ?? NO_INSETS;
    const iconColor = theme === 'light' ? '#1c2333' : '#ffffff';
    const places = draftPlaceRef.current;
    const ghostIds = new Set(draftShapes.flatMap((s) => (s.ghost ? [s.ghost.id] : [])));
    cy.nodes('.draft').forEach((n) => {
      if (!ghostIds.has(n.id())) {
        n.remove();
        places.delete(n.id());
      }
    });
    activeGhostRef.current = draftShapes.find((s) => s.key === activeDraft)?.ghost?.id ?? null;

    // Edits: the confirmed concept shows its edited name and size while drafting.
    const bases = subjectBaseRef.current;
    for (const [id, base] of bases) cy.$id(id).data(base).removeClass('draft-subject');
    bases.clear();
    const degree = (id: string) => cy.$id(id).degree(false);
    for (const s of draftShapes) {
      const n = s.subjectId ? cy.$id(s.subjectId) : cy.collection();
      if (!s.subject || n.empty()) continue;
      if (!bases.has(n.id())) bases.set(n.id(), Object.fromEntries(SUBJECT_KEYS.map((k) => [k, n.data(k)])));
      const { id: _id, ...data } = conceptNodeElement(s.subject, degree(n.id()), iconColor, '', '✎ Editing · draft').data;
      void _id;
      n.data(data).addClass('draft-subject');
    }

    // Ghosts first, so relations between two drafts find both ends.
    const fresh = new Set<string>();
    for (const s of draftShapes) {
      if (!s.ghost) continue;
      const el = conceptNodeElement(s.ghost, s.edges.length, iconColor, 'draft', DRAFT_BADGE);
      if (s.untyped) {
        el.data.color = theme === 'light' ? '#5c6a88' : '#cdd6e8';
        el.data.icon = undefined;
      }
      let ghost = cy.$id(s.ghost.id);
      if (ghost.empty()) {
        // A first ghost needs a zoom where concept names are readable; zoom in
        // (never out) about the middle of the view, which is where it appears.
        if (places.size === 0 && fresh.size === 0 && cy.zoom() < DRAFT_ZOOM) {
          const w = cy.width() - insets.left - insets.right;
          cy.zoom({ level: DRAFT_ZOOM, renderedPosition: { x: insets.left + w / 2, y: (cy.height() - insets.bottom) / 2 } });
          applyFadeRef.current?.();
        }
        ghost = cy.add({ ...el, group: 'nodes', grabbable: true, position: visibleCentre(cy, insets) });
        fresh.add(s.ghost.id);
      } else ghost.data(el.data);
      ghost.toggleClass('draft-active', s.key === activeDraft);
    }

    cy.remove('edge.draft');
    const shown = draftShapes.flatMap((s) =>
      s.edges
        .filter((e) => cy.$id(e.source).nonempty() && cy.$id(e.target).nonempty())
        .map((e) => ({ edge: e, active: s.key === activeDraft })),
    );
    cy.add(
      shown.map(({ edge, active }) => ({
        ...conceptEdgeElement(edge, active ? 'draft' : 'draft draft-idle', 'draft'),
        group: 'edges' as const,
      })),
    );
    cy.nodes().removeClass('draft-anchor');
    for (const { edge } of shown)
      for (const end of [edge.source, edge.target]) if (!ghostIds.has(end)) cy.$id(end).addClass('draft-anchor');
    cy.edges().removeClass('removal-draft');
    for (const s of draftShapes) for (const id of s.removals) cy.$id(id).addClass('removal-draft');
    refreshEdgeNotes(cy);

    // Until the proposer drags it, a ghost follows its connections — the
    // keyboard route gets the same visual aid. Once dragged, it stays put.
    let animating = false;
    for (const s of draftShapes) {
      if (!s.ghost) continue;
      const id = s.ghost.id;
      const ghost = cy.$id(id);
      const touching = shown.map(({ edge }) => edge).filter((e) => e.source === id || e.target === id);
      const anchors = [...new Set(touching.flatMap((e) => [e.source, e.target]))].filter((x) => x !== id).sort();
      const key = anchors.join(' ');
      const place = places.get(id);
      if (place && (place.byHand || place.anchors === key)) {
        places.set(id, { ...place, anchors: key });
        if (fresh.has(id)) ghost.position(place.pos);
        continue;
      }
      const fixed: Positions = {};
      cy.nodes().forEach((n) => {
        if (n.id() !== id) fixed[n.id()] = { ...n.position() };
      });
      const boxes = nodeBoxes(cy.nodes());
      const pos = anchors.length
        ? placeNew(fixed, [id], touching.map((e) => [e.source, e.target] as Segment), boxes, createRng(7))[id]
        : removeOverlaps({ ...fixed, [id]: ghost.position() }, boxes, 60, new Set([id]))[id];
      places.set(id, { pos, byHand: false, anchors: key });
      const isActive = s.key === activeDraft;
      const reframe = () => {
        if (!isActive) return;
        const eles = ghost.union(cy.nodes().filter((n) => anchors.includes(n.id())));
        if (anchors.length && !inView(cy, eles, insets)) fitBeside(cy, eles, insets);
        reportNear();
      };
      if (fresh.has(id) || reducedMotion()) {
        ghost.position(pos);
        reframe();
      } else {
        if (isActive) animating = true;
        ghost.animate({ position: pos }, { duration: 400, easing: 'ease-in-out-cubic', complete: reframe });
      }
    }
    if (!animating) reportNear();
  }, [draftShapes, activeDraft, theme, concepts]);

  // "Bring the draft into view": after panning or a search jump, the active
  // ghost may be off screen — this puts it in the middle of the view, as if
  // dragged there.
  useEffect(() => {
    const cy = cyRef.current;
    const id = activeGhostRef.current;
    const ghost = id ? cy?.$id(id) : undefined;
    if (!draftRecall || !cy || !id || !ghost || ghost.empty()) return;
    const fixed: Positions = {};
    cy.nodes().forEach((n) => {
      if (n.id() !== id) fixed[n.id()] = { ...n.position() };
    });
    const centre = visibleCentre(cy, fitInsetsRef.current ?? NO_INSETS);
    const pos = removeOverlaps({ ...fixed, [id]: centre }, nodeBoxes(cy.nodes()), 60, new Set([id]))[id];
    draftPlaceRef.current.set(id, { pos, byHand: true, anchors: draftPlaceRef.current.get(id)?.anchors ?? '' });
    ghost.position(pos);
    reportNear();
  }, [draftRecall]);

  // Layer toggles. With confirmed hidden, the concepts a proposal attaches to
  // stay as faint context so the proposal still reads as connected. A toggle
  // changes what's drawn, never where the user is looking.
  const showConfirmed = layers?.confirmed ?? true;
  const showOverlay = layers?.overlay ?? true;
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('layer-hidden layer-context anchor-pinned edit-proposed removal-proposed');
      cy.nodes().forEach((n) => {
        if (n.data('mark') !== undefined) n.removeData('mark');
      });
      if (showOverlay) {
        cy.nodes('.overlay-anchor').addClass('anchor-pinned');
        // Edits and removals of confirmed concepts: marked on the concept itself.
        for (const m of overlay?.edits ?? []) cy.$id(m.id).addClass('edit-proposed').data('mark', m.badge);
        for (const m of overlay?.removals ?? []) cy.$id(m.id).addClass('removal-proposed');
      } else cy.elements('.overlay').addClass('layer-hidden');
      refreshEdgeNotes(cy);
      if (!showConfirmed) {
        cy.nodes().not(NOT_CONFIRMED).forEach((n) => {
          const context =
            (showOverlay && (n.hasClass('overlay-anchor') || n.hasClass('edit-proposed'))) ||
            n.hasClass('draft-anchor') ||
            n.hasClass('draft-subject');
          n.addClass(context ? 'layer-context' : 'layer-hidden');
        });
        cy.edges().not(NOT_CONFIRMED).addClass('layer-hidden');
      }
    });
    applyFadeRef.current?.();
  }, [showConfirmed, showOverlay, overlay, draftShapes, concepts, theme]);

  // Apply selection/path highlighting without re-layout
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass(
        'chosen dimmed onpath done sel-soft sel-pre sel-post goal-node path-node draft-near conflict-match',
      );
      const near = new Set(draftNearIds);
      const similar = new Set(draftConflictIds);
      cy.nodes().forEach((n) => {
        const title = n.data('title') as string | undefined;
        if (title === undefined) return;
        const isDone = doneIds?.has(n.id()) ?? false;
        const isGoal = goalId != null && n.id() === goalId;
        // The draft's marks say in words what their glow shows.
        const hint = similar.has(n.id()) ? '≈ Similar name' : near.has(n.id()) ? '＋ Connect?' : undefined;
        const badge =
          [n.data('badge') as string | undefined, n.data('mark') as string | undefined, hint].filter(Boolean).join(' · ') ||
          undefined;
        n.data('label', nodeLabel(title, { goal: isGoal, done: isDone, badge }));
        if (isDone) n.addClass('done');
        if (near.has(n.id())) n.addClass('draft-near');
        if (similar.has(n.id())) n.addClass('conflict-match');
      });
      if (directionalSelect) {
        // Sticky direct connections, as on hover: silver into it, gold out
        // of it; the rest recede but stay legible.
        if (selectedId) {
          const n = cy.$id(selectedId);
          cy.elements().addClass('sel-soft');
          n.incomers().removeClass('sel-soft').addClass('sel-pre');
          n.outgoers().removeClass('sel-soft').addClass('sel-post');
          n.removeClass('sel-soft').addClass('chosen');
        }
      } else {
        if (selectedId) cy.$id(selectedId).addClass('chosen');
        if (highlightIds) {
          cy.nodes().forEach((n) => {
            n.addClass(highlightIds.has(n.id()) ? 'path-node' : 'dimmed');
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
    // What's pinned just changed — re-run the zoom level of detail.
    applyFadeRef.current?.();
  }, [
    selectedId,
    highlightIds,
    doneIds,
    concepts,
    directionalSelect,
    goalId,
    theme,
    overlay,
    showOverlay,
    draftNearIds,
    draftConflictIds,
    draftShapes,
  ]);

  // Glide to the focused concept (search / home jumps) — a smooth pan+zoom
  // that frames the concept with its immediate connections, rather than a
  // sudden cut. Reduced-motion gets an instant fit.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !focus?.id) return;
    const node = cy.$id(focus.id);
    if (!node.length) return;
    const eles = node.closedNeighborhood();
    const padding = 130;
    settleStyles(eles);
    cy.stop();
    if (reducedMotion()) {
      cy.fit(eles, padding);
      return;
    }
    cy.animate({ fit: { eles, padding } }, { duration: 900, easing: 'ease-in-out-cubic' });
  }, [focus]);

  // Sub-view fit — declared after the focus glide so it wins when both fire.
  // Only a different set re-fits: a re-render that rebuilds the same set (a
  // display toggle, say) leaves the view where the user put it.
  const hadFitRef = useRef(false);
  const fitKeyRef = useRef('');
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const insets = fitInsetsRef.current ?? NO_INSETS;
    const key = fitIds ? `${theme}|${[...fitIds].sort().join(' ')}` : '';
    const changed = key !== fitKeyRef.current;
    fitKeyRef.current = key;
    if (fitIds) {
      if (!changed) return;
      hadFitRef.current = true;
      viewportTouchedRef.current = false;
      fitBeside(cy, cy.nodes().filter((n) => fitIds.has(n.id())), insets);
    } else if (hadFitRef.current) {
      hadFitRef.current = false;
      fitBeside(cy, cy.elements(), overviewInsets());
    }
  }, [fitIds, theme]);

  // Button alternatives to wheel/pinch zoom and drag (WCAG 2.5.7), zooming
  // about the centre of the visible canvas.
  const zoomBy = (factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    const target = {
      level: Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor)),
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    };
    viewportTouchedRef.current = true;
    cy.stop();
    if (reducedMotion()) cy.zoom(target);
    else cy.animate({ zoom: target }, { duration: 250, easing: 'ease-in-out-cubic' });
  };
  const fitAll = () => {
    const cy = cyRef.current;
    if (!cy) return;
    viewportTouchedRef.current = false;
    fitBeside(cy, cy.elements(), overviewInsets());
  };

  return (
    <>
      <div ref={containerRef} className="graph-canvas" role="img" aria-label={label} />
      <div className="graph-controls" role="group" aria-label="Map view">
        <button type="button" className="graph-control" onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in" title="Zoom in">
          <span aria-hidden>+</span>
        </button>
        <button type="button" className="graph-control" onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out" title="Zoom out">
          <span aria-hidden>−</span>
        </button>
        <button type="button" className="graph-control" onClick={fitAll} aria-label="Show the whole map" title="Show the whole map">
          <span aria-hidden>⤢</span>
        </button>
        <button
          type="button"
          className="graph-control graph-control-text"
          aria-pressed={showAll}
          onClick={() => setShowAll((s) => !s)}
          title="Show every concept at any zoom"
        >
          Show all concepts
        </button>
        {extraControls}
      </div>
    </>
  );
}
