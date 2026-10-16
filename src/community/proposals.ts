import { NODE_TYPE_LABELS } from '../data/types';
import type { ConceptGraph, GraphEdge, GraphNode } from '../data/types';
import { normalizeRelationship } from '../graph/concepts';
import type { Evidence, Proposal, ProposalState, VoteTally } from './types';

const SNAKE = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const ARXIV = /^(\d{4}\.\d{4,5}(v\d+)?|[a-z-]+(\.[A-Z]{2})?\/\d{7}(v\d+)?)$/;
const DOI = /^10\.\d{4,9}\/\S+$/;

/**
 * Why a proposal can't be shown or merged as written — empty when it's fine.
 * Checked against the confirmed graph, so a proposal that collides with an
 * existing id or points at a missing concept is caught before it renders.
 */
export function proposalProblems(p: Proposal, confirmed: ConceptGraph): string[] {
  const problems: string[] = [];
  const where = `proposal "${p.id}"`;
  if (!p.title?.trim()) problems.push(`${where}: missing title`);
  if (!p.claim?.trim()) problems.push(`${where}: missing claim`);
  if (p.state !== 'open' && p.state !== 'contested') problems.push(`${where}: unknown state "${p.state}"`);
  if (p.state === 'contested' && !p.dispute?.summary?.trim())
    problems.push(`${where}: a contested proposal needs a dispute summary`);
  if (p.nodes.length === 0 && p.edges.length === 0) problems.push(`${where}: proposes nothing`);

  const confirmedNodes = new Set(confirmed.nodes.map((n) => n.id));
  const confirmedEdges = new Set(confirmed.edges.map((e) => e.id));
  const ownNodes = new Set<string>();
  for (const n of p.nodes) {
    if (!SNAKE.test(n.id)) problems.push(`${where}: concept id "${n.id}" must be snake_case`);
    if (confirmedNodes.has(n.id) || ownNodes.has(n.id)) problems.push(`${where}: concept id "${n.id}" is taken`);
    ownNodes.add(n.id);
    if (!(n.type in NODE_TYPE_LABELS)) problems.push(`${where}: concept "${n.id}" has unknown type "${n.type}"`);
    if (!n.label?.trim()) problems.push(`${where}: concept "${n.id}" has no label`);
  }
  const ownEdges = new Set<string>();
  for (const e of p.edges) {
    if (confirmedEdges.has(e.id) || ownEdges.has(e.id)) problems.push(`${where}: relation id "${e.id}" is taken`);
    ownEdges.add(e.id);
    for (const end of [e.source, e.target])
      if (!confirmedNodes.has(end) && !ownNodes.has(end))
        problems.push(`${where}: relation "${e.id}" points at "${end}", which is neither confirmed nor proposed`);
    if (!normalizeRelationship(e.relationship))
      problems.push(`${where}: relation "${e.id}" has unknown relationship "${e.relationship}"`);
  }
  for (const ev of p.evidence) {
    const bad =
      (ev.kind === 'arxiv' && !ARXIV.test(ev.ref)) ||
      (ev.kind === 'doi' && !DOI.test(ev.ref)) ||
      (ev.kind === 'url' && !/^https?:\/\//.test(ev.ref)) ||
      !ev.ref?.trim();
    if (bad) problems.push(`${where}: evidence "${ev.ref}" is not a valid ${ev.kind}`);
  }
  return problems;
}

/** The link an evidence item opens, or null for an equation. */
export function evidenceHref(ev: Evidence): string | null {
  if (ev.kind === 'arxiv') return `https://arxiv.org/abs/${ev.ref}`;
  if (ev.kind === 'doi') return `https://doi.org/${ev.ref}`;
  if (ev.kind === 'url') return ev.ref;
  return null;
}

/** The tally as it reads on the map: "✓2 ✗0 ?1". */
export function tallyText(t: VoteTally): string {
  return `✓${t.verify} ✗${t.dispute} ?${t.clarify}`;
}

/** The badge under a proposed concept's name — status in words, never only colour. */
export function badgeText(p: Proposal): string {
  return `${p.state === 'contested' ? '⚑ Contested' : 'Proposed'} · ${tallyText(p.tally)}`;
}

export interface OverlayNode {
  node: GraphNode;
  status: ProposalState;
  badge: string;
  proposalId: string;
}

export interface OverlayEdge {
  edge: GraphEdge;
  status: ProposalState;
  proposalId: string;
}

/** What the map draws on top of the confirmed graph. */
export interface ConceptOverlay {
  nodes: OverlayNode[];
  edges: OverlayEdge[];
}

export function overlayFor(proposals: Proposal[]): ConceptOverlay {
  return {
    nodes: proposals.flatMap((p) =>
      p.nodes.map((node) => ({ node, status: p.state, badge: badgeText(p), proposalId: p.id })),
    ),
    edges: proposals.flatMap((p) => p.edges.map((edge) => ({ edge, status: p.state, proposalId: p.id }))),
  };
}

/** Confirmed + proposed as one graph — for neighbourhoods and sentences across the two. */
export function mergedGraph(confirmed: ConceptGraph, proposals: Proposal[]): ConceptGraph {
  return {
    ...confirmed,
    nodes: [...confirmed.nodes, ...proposals.flatMap((p) => p.nodes)],
    edges: [...confirmed.edges, ...proposals.flatMap((p) => p.edges)],
  };
}

/** Which proposal each proposed concept belongs to. */
export function proposalByNode(proposals: Proposal[]): Map<string, Proposal> {
  return new Map(proposals.flatMap((p) => p.nodes.map((n) => [n.id, p] as const)));
}
