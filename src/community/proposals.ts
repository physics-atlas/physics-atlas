import { NODE_TYPE_LABELS } from '../data/types';
import type { ConceptGraph, GraphEdge, GraphNode } from '../data/types';
import { assumedConceptIds, GENERALITY_MAX, IMPORTANCE_MAX, normalizeRelationship } from '../graph/concepts';
import type { Evidence, Proposal, ProposalState, VoteTally } from './types';

const SNAKE = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const ARXIV = /^(\d{4}\.\d{4,5}(v\d+)?|[a-z-]+(\.[A-Z]{2})?\/\d{7}(v\d+)?)$/;
const DOI = /^10\.\d{4,9}\/\S+$/;
const inRange = (v: number, max: number) => Number.isInteger(v) && v >= 1 && v <= max;

const proposesNothing = (p: Proposal) =>
  p.nodes.length === 0 && p.edges.length === 0 && !p.edits?.length && !p.removals?.length;

function nodeProblems(where: string, n: GraphNode): string[] {
  const problems: string[] = [];
  if (!(n.type in NODE_TYPE_LABELS)) problems.push(`${where}: concept "${n.id}" has unknown type "${n.type}"`);
  if (!n.label?.trim()) problems.push(`${where}: concept "${n.id}" has no label`);
  if (n.generality !== undefined && !inRange(n.generality, GENERALITY_MAX))
    problems.push(`${where}: concept "${n.id}" generality must be a whole number 1–${GENERALITY_MAX}`);
  if (n.importance !== undefined && !inRange(n.importance, IMPORTANCE_MAX))
    problems.push(`${where}: concept "${n.id}" importance must be a whole number 1–${IMPORTANCE_MAX}`);
  return problems;
}

/**
 * Why a proposal can't be shown or merged as written — empty when it's fine.
 * Checked against the confirmed graph and the other open proposals, so a
 * proposal that collides with an existing id, points at a missing concept, or
 * uses another proposal's concept without depending on it is caught before it
 * renders. A relation into a dependency that's no longer open isn't a problem
 * here: resolveDependencies() drops it.
 */
/** A page has at most this many depths, each at most this long — the editor says so first. */
const MAX_DEPTHS = 20;
const MAX_DEPTH_LENGTH = 100_000;

export function proposalProblems(p: Proposal, confirmed: ConceptGraph, others: Proposal[] = []): string[] {
  const problems: string[] = [];
  const where = `proposal "${p.id}"`;
  if (!p.title?.trim()) problems.push(`${where}: missing title`);
  if (p.state !== 'open' && p.state !== 'contested') problems.push(`${where}: unknown state "${p.state}"`);
  if (p.state === 'contested' && !p.dispute?.summary?.trim())
    problems.push(`${where}: a contested proposal needs a dispute summary`);
  if (proposesNothing(p)) problems.push(`${where}: proposes nothing`);

  const confirmedNodes = new Set(confirmed.nodes.map((n) => n.id));
  const confirmedEdges = new Set(confirmed.edges.map((e) => e.id));
  const ownNodes = new Set<string>();
  for (const n of p.nodes) {
    if (!SNAKE.test(n.id)) problems.push(`${where}: concept id "${n.id}" must be snake_case`);
    if (confirmedNodes.has(n.id) || ownNodes.has(n.id)) problems.push(`${where}: concept id "${n.id}" is taken`);
    ownNodes.add(n.id);
    problems.push(...nodeProblems(where, n));
  }
  for (const n of p.edits ?? []) {
    if (!confirmedNodes.has(n.id)) problems.push(`${where}: edits "${n.id}", which isn't a confirmed concept`);
    if (ownNodes.has(n.id)) problems.push(`${where}: concept "${n.id}" is both new and edited`);
    problems.push(...nodeProblems(where, n));
  }
  for (const id of p.removals ?? [])
    if (!confirmedEdges.has(id)) problems.push(`${where}: removes relation "${id}", which isn't on the map`);
  // A page belongs to the proposal's own concept: depths of Typst, none empty.
  const pageOwners = new Set([...p.nodes, ...(p.edits ?? [])].map((n) => n.id));
  for (const page of p.pages ?? []) {
    if (!pageOwners.has(page.concept))
      problems.push(`${where}: has a page for "${page.concept}", which isn't the concept it proposes or edits`);
    if (!Array.isArray(page.depths) || page.depths.length > MAX_DEPTHS)
      problems.push(`${where}: the page for "${page.concept}" needs a list of at most ${MAX_DEPTHS} depths`);
    else
      page.depths.forEach((s, i) => {
        if (typeof s !== 'string' || !s.trim()) problems.push(`${where}: depth ${i + 1} of the page for "${page.concept}" is empty`);
        else if (s.length > MAX_DEPTH_LENGTH)
          problems.push(`${where}: depth ${i + 1} of the page for "${page.concept}" is longer than ${MAX_DEPTH_LENGTH / 1000}k characters`);
      });
    if (page.replaces !== undefined && (!Number.isInteger(page.replaces) || page.replaces < 0 || page.replaces > MAX_DEPTHS))
      problems.push(`${where}: the page for "${page.concept}" replaces an impossible number of depths`);
  }

  // An assumption that points to a concept needs it on the map (no line is drawn, so no dependency).
  for (const n of [...p.nodes, ...(p.edits ?? [])])
    for (const a of assumedConceptIds(n))
      if (a === n.id) problems.push(`${where}: concept "${n.id}" assumes itself`);
      else if (!confirmedNodes.has(a) && !ownNodes.has(a))
        problems.push(`${where}: concept "${n.id}" assumes "${a}", which isn't a confirmed concept`);

  const deps = new Set(p.dependsOn ?? []);
  if (deps.has(p.id)) problems.push(`${where}: depends on itself`);
  const owner = new Map(others.filter((o) => o.id !== p.id).flatMap((o) => o.nodes.map((n) => [n.id, o.id] as const)));
  const depMissing = [...deps].some((d) => !others.some((o) => o.id === d));
  const ownEdges = new Set<string>();
  for (const e of p.edges) {
    if (confirmedEdges.has(e.id) || ownEdges.has(e.id)) problems.push(`${where}: relation id "${e.id}" is taken`);
    ownEdges.add(e.id);
    for (const end of [e.source, e.target]) {
      if (confirmedNodes.has(end) || ownNodes.has(end)) continue;
      const from = owner.get(end);
      if (from && !deps.has(from))
        problems.push(`${where}: relation "${e.id}" points at "${end}" from proposal "${from}" — list it in dependsOn`);
      else if (!from && !depMissing)
        problems.push(`${where}: relation "${e.id}" points at "${end}", which is neither confirmed nor proposed`);
    }
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
  const what = p.state === 'contested' ? '⚑ Contested' : p.edits?.length ? '✎ Edit proposed' : 'Proposed';
  return `${what} · ${tallyText(p.tally)}`;
}

/**
 * The open proposals with their relations into dependencies that are no
 * longer open (rejected or withdrawn) dropped, and listed in `dropped`. A
 * proposal left with nothing to propose is left out — which can cascade, so
 * this repeats until nothing changes. A dependency that was accepted is fine:
 * its concepts are confirmed by then.
 */
export function resolveDependencies(proposals: Proposal[], confirmed: ConceptGraph): Proposal[] {
  const confirmedIds = new Set(confirmed.nodes.map((n) => n.id));
  let current = proposals;
  for (;;) {
    const byId = new Map(current.map((p) => [p.id, p]));
    let changed = false;
    const next: Proposal[] = [];
    for (const p of current) {
      const deps = p.dependsOn ?? [];
      const known = new Set([...confirmedIds, ...p.nodes.map((n) => n.id)]);
      for (const d of deps) for (const n of byId.get(d)?.nodes ?? []) known.add(n.id);
      const gone = deps.filter((d) => !byId.has(d)).join(', ');
      const keep = p.edges.filter((e) => known.has(e.source) && known.has(e.target));
      let q = p;
      if (keep.length !== p.edges.length) {
        changed = true;
        const dropped = p.edges.filter((e) => !keep.includes(e)).map((edge) => ({ edge, dependency: gone }));
        q = { ...p, edges: keep, dropped: [...(p.dropped ?? []), ...dropped] };
      }
      if (proposesNothing(q)) changed = true;
      else next.push(q);
    }
    current = next;
    if (!changed) return current;
  }
}

/** What an edit changes, field by field, in words. */
export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

export function nodeChanges(before: GraphNode, after: GraphNode): FieldChange[] {
  const attr = (n: GraphNode, key: string) => String((n.attrs as unknown as Record<string, unknown>)[key] ?? '');
  const rows: [string, string, string][] = [
    ['Name', before.label, after.label],
    ['Kind', NODE_TYPE_LABELS[before.type], NODE_TYPE_LABELS[after.type]],
    ['Description', attr(before, 'description'), attr(after, 'description')],
    ['Field', attr(before, 'domain'), attr(after, 'domain')],
    ['Equation', attr(before, 'equation'), attr(after, 'equation')],
    ['Generality', String(before.generality ?? ''), String(after.generality ?? '')],
    ['Importance', String(before.importance ?? ''), String(after.importance ?? '')],
  ];
  return rows.filter(([, b, a]) => b !== a).map(([field, b, a]) => ({ field, before: b, after: a }));
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

/** A confirmed concept or relation an open proposal would change or remove. */
export interface OverlayMark {
  id: string;
  status: ProposalState;
  badge: string;
  proposalId: string;
}

/** What the map draws on top of the confirmed graph. */
export interface ConceptOverlay {
  nodes: OverlayNode[];
  edges: OverlayEdge[];
  /** Confirmed concepts with an edit proposed */
  edits: OverlayMark[];
  /** Confirmed relations proposed for removal */
  removals: OverlayMark[];
}

export function overlayFor(proposals: Proposal[]): ConceptOverlay {
  const mark = (p: Proposal) => (id: string) => ({ id, status: p.state, badge: badgeText(p), proposalId: p.id });
  return {
    nodes: proposals.flatMap((p) =>
      p.nodes.map((node) => ({ node, status: p.state, badge: badgeText(p), proposalId: p.id })),
    ),
    edges: proposals.flatMap((p) => p.edges.map((edge) => ({ edge, status: p.state, proposalId: p.id }))),
    edits: proposals.flatMap((p) => (p.edits ?? []).map((n) => mark(p)(n.id))),
    removals: proposals.flatMap((p) => (p.removals ?? []).map(mark(p))),
  };
}

/** Open proposals that concern a concept: a relation to it, an edit of it, or a removal of one of its relations. */
export function proposalsAbout(id: string, proposals: Proposal[], confirmedEdges: GraphEdge[]): Proposal[] {
  const touching = new Set(confirmedEdges.filter((e) => e.source === id || e.target === id).map((e) => e.id));
  return proposals.filter(
    (p) =>
      !p.nodes.some((n) => n.id === id) &&
      (p.edges.some((e) => e.source === id || e.target === id) ||
        (p.edits ?? []).some((n) => n.id === id) ||
        (p.removals ?? []).some((r) => touching.has(r))),
  );
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
