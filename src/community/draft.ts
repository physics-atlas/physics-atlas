import { NODE_TYPE_LABELS } from '../data/types';
import type {
  ConceptGraph,
  EdgeCondition,
  EquationRepresentation,
  EquationVariable,
  GraphEdge,
  GraphNode,
  NodeType,
} from '../data/types';
import { GENERALITY_MAX, IMPORTANCE_MAX, sentenceParts } from '../graph/concepts';
import type { ConceptMap } from '../graph/concepts';
import { TYPE_ORDER } from '../graph/typeColors';
import { evidenceHref, nodeChanges, proposalProblems } from './proposals';
import type { Evidence, Proposal } from './types';

// Proposals being written in the editor. Each draft is one proposal — one new
// concept, or an edit of one confirmed concept — with its relations, and is
// exported (later: submitted) on its own. A proposer can keep several drafts
// and connect them; a relation into another draft, or into someone else's
// open proposal, makes this proposal depend on that one.
//
// A draft holds content only. Where the proposer dragged a ghost on the map is
// a thinking aid and lives in the map, never here, so it can't leak into an
// export.

/** Stands for the draft's own concept in its relations — new or edited. */
export const NEW_CONCEPT = '@new';

/** Another draft's concept, in a relation; also the id of that draft's ghost on the map. */
export const draftRef = (suffix: string): string => `@draft:${suffix}`;
export const isDraftRef = (ref: string): boolean => ref.startsWith('@draft:');
const refSuffix = (ref: string) => ref.slice('@draft:'.length);

/** Educational resources are curated links, not concepts — they're not proposed here. */
export const PROPOSABLE_TYPES: NodeType[] = TYPE_ORDER.filter((t) => t !== 'resource');

export interface DraftRelation {
  /** Stable while editing (list keys); the exported id comes from the order */
  key: string;
  /** NEW_CONCEPT, a confirmed concept's id, another draft (draftRef), or a concept of an open proposal */
  source: string;
  target: string;
  relationship: string;
  conditions: EdgeCondition[];
}

/** A representation as the form edits it: every field there, empty until filled in. */
export interface DraftRepresentation {
  name: string;
  equation: string;
  variables: EquationVariable[];
}

export interface Draft {
  /** 3: importance on the 1–10 scale, equations with variables and representations */
  version: 3;
  /** Random, fixed for the draft's life: keeps ids unique however the label changes */
  suffix: string;
  /** Set for an edit: the confirmed concept being changed */
  editOf?: string;
  label: string;
  type: NodeType | '';
  description: string;
  domains: string[];
  /** LaTeX, for equations only: the main form, its variables, and other ways of writing it */
  equation: string;
  variables: EquationVariable[];
  representations: DraftRepresentation[];
  /** 1–10, the size of its circle; left out = the curator decides */
  generality?: number;
  /** 1–10, how far out it stays visible; left out = the curator decides */
  importance?: number;
  /** New relations */
  relations: DraftRelation[];
  /** Edit only: ids of the concept's confirmed relations to remove */
  removals: string[];
  claim: string;
  evidence: Evidence[];
  author: string;
  createdAt: string;
}

/** What a draft is checked and exported against. */
export interface DraftContext {
  confirmed: ConceptGraph;
  /** Every draft in this browser, this one included */
  drafts: Draft[];
  /** Other people's open proposals */
  proposals: Proposal[];
}

const randomSuffix = (random: () => number) =>
  Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');

export function newDraft(random: () => number = Math.random, now = new Date()): Draft {
  return {
    version: 3,
    suffix: randomSuffix(random),
    label: '',
    type: '',
    description: '',
    domains: [],
    equation: '',
    variables: [],
    representations: [],
    relations: [],
    removals: [],
    claim: '',
    evidence: [],
    author: '',
    createdAt: now.toISOString(),
  };
}

/** A draft that edits a confirmed concept: the same form, filled in from it. */
export function newEditDraft(node: GraphNode, random: () => number = Math.random, now = new Date()): Draft {
  const attrs = node.attrs as unknown as Record<string, unknown>;
  const domain = typeof attrs.domain === 'string' ? attrs.domain : '';
  return {
    ...newDraft(random, now),
    editOf: node.id,
    label: node.label,
    type: node.type === 'resource' ? '' : node.type,
    description: typeof attrs.description === 'string' ? attrs.description : '',
    domains: domain ? domain.split(' / ').map((d) => d.trim()) : [],
    equation: typeof attrs.equation === 'string' ? attrs.equation : '',
    variables: Array.isArray(attrs.variables) ? (attrs.variables as EquationVariable[]).map((v) => ({ ...v })) : [],
    representations: Array.isArray(attrs.representations)
      ? (attrs.representations as (EquationRepresentation | string)[]).map(toDraftRepresentation)
      : [],
    ...(node.generality !== undefined ? { generality: node.generality } : {}),
    ...(node.importance !== undefined ? { importance: node.importance } : {}),
  };
}

/** "Jeans scale (λ_J)" → "jeans_scale_j" — snake_case, ASCII, at most 40 characters. */
export function slugify(label: string): string {
  const slug = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const cut = slug.length > 40 ? slug.slice(0, 40).replace(/_[^_]*$/, '') || slug.slice(0, 40) : slug;
  return cut || 'concept';
}

/** The concept's id: the edited one's, or a slug of the label plus the draft's suffix, `jeans_scale_k3f9`. */
export const conceptId = (d: Draft): string => d.editOf ?? `${slugify(d.label)}_${d.suffix}`;

/** The id the draft's proposal will have — what other proposals list in `dependsOn`. */
export const proposalId = (d: Draft): string =>
  d.editOf ? `proposal-edit-${d.editOf.replaceAll('_', '-')}-${d.suffix}` : `proposal-${conceptId(d).replaceAll('_', '-')}`;

/** Where the draft's concept sits on the map: its ghost, or the confirmed concept it edits. */
export const mapId = (d: Draft): string => d.editOf ?? draftRef(d.suffix);

export const proposalTitle = (d: Draft): string =>
  d.editOf ? `Edit ${d.label.trim() || d.editOf}` : `Add ${d.label.trim() || 'a new concept'}`;

const clamp = (v: number, max: number) => Math.min(max, Math.max(1, Math.round(v)));
const inRange = (v: number, max: number) => Number.isInteger(v) && v >= 1 && v <= max;
const EQUATION_ONLY = ['equation', 'variables', 'conditions', 'representations'];

/** A stored representation (or, before representations had formulas, just its name) as the form edits it. */
const toDraftRepresentation = (r: EquationRepresentation | string): DraftRepresentation =>
  typeof r === 'string'
    ? { name: r, equation: '', variables: [] }
    : { name: r.name, equation: r.equation ?? '', variables: (r.variables ?? []).map((v) => ({ ...v })) };

/** Variables with both a symbol and a meaning; rows left completely empty are dropped. */
const cleanVariables = (vs: EquationVariable[]): EquationVariable[] =>
  vs.map((v) => ({ symbol: v.symbol.trim(), meaning: v.meaning.trim() })).filter((v) => v.symbol || v.meaning);

/** Representations as stored: a name, and a formula and variables when there are any. */
const cleanRepresentations = (rs: DraftRepresentation[]): EquationRepresentation[] =>
  rs
    .map((r) => ({ name: r.name.trim(), equation: r.equation.trim(), variables: cleanVariables(r.variables) }))
    .filter((r) => r.name || r.equation || r.variables.length)
    .map((r) => ({
      name: r.name,
      ...(r.equation ? { equation: r.equation } : {}),
      ...(r.variables.length ? { variables: r.variables } : {}),
    }));

/** `next` with its keys in `base`'s order (new keys last), so an edit's diff shows only what changed. */
function inOrderOf<T extends object>(base: object | undefined, next: T): T {
  if (!base) return next;
  const out: Record<string, unknown> = {};
  const n = next as Record<string, unknown>;
  for (const k of Object.keys(base)) if (k in n) out[k] = n[k];
  for (const k of Object.keys(n)) if (!(k in out)) out[k] = n[k];
  return out as T;
}

/**
 * The concept as it would be merged, under `id`. An edit starts from the
 * confirmed concept, so fields the form doesn't show (review notes, equation
 * conditions, epistemic status) are kept.
 */
export function draftNode(d: Draft, confirmed: ConceptGraph, id = conceptId(d)): GraphNode {
  const label = d.label.trim();
  const description = d.description.trim();
  const domain = d.domains.length ? d.domains.join(' / ') : undefined;
  const type = d.type || 'property';
  if (type === 'resource') throw new Error('resources are not proposed through the editor');
  const base = d.editOf ? confirmed.nodes.find((n) => n.id === d.editOf) : undefined;
  const { importance: _i, generality: _g, attrs: baseAttrs, ...rest } = base ?? ({} as Partial<GraphNode>);
  void _i;
  void _g;
  const kept = Object.fromEntries(
    Object.entries((baseAttrs ?? {}) as Record<string, unknown>).filter(
      // What the form edits comes from the draft; the rest (conditions, review notes) is kept.
      ([k]) =>
        !['description', 'domain', 'equation', 'variables', 'representations'].includes(k) &&
        (type === 'equation' || !EQUATION_ONLY.includes(k)),
    ),
  );
  const scales = {
    ...(d.importance !== undefined ? { importance: d.importance } : {}),
    ...(d.generality !== undefined ? { generality: d.generality } : {}),
  };
  const head = { ...rest, id, label, type, ...scales };
  const attrs =
    type === 'equation'
      ? {
          description,
          equation: d.equation.trim(),
          variables: cleanVariables(d.variables),
          conditions: [],
          representations: cleanRepresentations(d.representations),
          ...kept,
          ...(domain ? { domain } : {}),
        }
      : type === 'learning_goal'
        ? { description }
        : { description, ...(domain ? { domain } : {}) };
  return inOrderOf(base, { ...head, attrs: inOrderOf(baseAttrs, attrs) }) as GraphNode;
}

/**
 * The draft's relations with their ends resolved by `end` (null = the end is
 * gone, e.g. a discarded draft — that relation is skipped).
 */
function edgesWith(d: Draft, end: (ref: string) => string | null, prefix: string): GraphEdge[] {
  const out: GraphEdge[] = [];
  d.relations.forEach((r, i) => {
    const source = end(r.source);
    const target = end(r.target);
    if (!source || !target) return;
    const conditions = r.conditions
      .map((c) => ({ label: c.label.trim(), ...(c.description?.trim() ? { description: c.description.trim() } : {}) }))
      .filter((c) => c.label);
    out.push({ id: `${prefix}_e${i + 1}`, source, target, relationship: r.relationship, ...(conditions.length ? { conditions } : {}) });
  });
  return out;
}

const otherDraft = (ref: string, ctx: DraftContext) => ctx.drafts.find((x) => x.suffix === refSuffix(ref));

/** Relation ids: a new concept's own id is unique; an edit adds the suffix, so two edits of one concept never collide. */
const edgePrefix = (d: Draft) => (d.editOf ? `${d.editOf}_${d.suffix}` : conceptId(d));

/** The relations as they would be merged. */
export function draftEdges(d: Draft, ctx: DraftContext): GraphEdge[] {
  return edgesWith(
    d,
    (ref) => {
      if (ref === NEW_CONCEPT) return conceptId(d);
      if (!isDraftRef(ref)) return ref;
      const other = otherDraft(ref, ctx);
      return other ? conceptId(other) : null;
    },
    edgePrefix(d),
  );
}

/** Relation ends that aren't on the map yet: other drafts and other people's proposals. */
function pendingEnds(d: Draft, ctx: DraftContext): { ref: string; proposal: string; title: string }[] {
  const confirmed = new Set(ctx.confirmed.nodes.map((n) => n.id));
  const out = new Map<string, { ref: string; proposal: string; title: string }>();
  for (const r of d.relations)
    for (const ref of [r.source, r.target]) {
      if (ref === NEW_CONCEPT || confirmed.has(ref)) continue;
      if (isDraftRef(ref)) {
        const other = otherDraft(ref, ctx);
        if (other) out.set(ref, { ref, proposal: proposalId(other), title: proposalTitle(other) });
      } else {
        const p = ctx.proposals.find((x) => x.nodes.some((n) => n.id === ref));
        if (p) out.set(ref, { ref, proposal: p.id, title: p.title });
      }
    }
  return [...out.values()];
}

/** The proposals this draft depends on (their ids and titles), in a stable order. */
export function draftDependencies(d: Draft, ctx: DraftContext): { id: string; title: string }[] {
  const seen = new Map(pendingEnds(d, ctx).map((e) => [e.proposal, e.title]));
  return [...seen].sort(([a], [b]) => a.localeCompare(b)).map(([id, title]) => ({ id, title }));
}

/** What the map draws for one draft. */
export interface DraftShape {
  key: string;
  /** A new concept's ghost, under draftRef(suffix) */
  ghost?: GraphNode;
  /** No kind chosen yet: the ghost is drawn neutral */
  untyped: boolean;
  /** An edit: the confirmed concept it changes, and how it would look */
  subjectId?: string;
  subject?: GraphNode;
  /** Relations, with map ids at both ends (ghosts are draftRef ids) */
  edges: GraphEdge[];
  /** Confirmed relations it would remove */
  removals: string[];
}

/**
 * What the map draws for a draft. A ghost is drawn mid-sized until the
 * proposer sets generality, so it's easy to find and grab; that default is
 * display only and isn't exported.
 */
export function draftShape(d: Draft, ctx: DraftContext): DraftShape {
  const own = mapId(d);
  const edges = edgesWith(
    d,
    (ref) => {
      if (ref === NEW_CONCEPT) return own;
      if (!isDraftRef(ref)) return ref;
      const other = otherDraft(ref, ctx);
      return other ? mapId(other) : null;
    },
    `${own}|${d.suffix}`,
  );
  const shown = {
    ...draftNode(d, ctx.confirmed, own),
    label: d.label.trim() || (d.editOf ? d.editOf : 'New concept'),
    generality: clamp(d.generality ?? 5, GENERALITY_MAX),
    importance: clamp(d.importance ?? 6, IMPORTANCE_MAX),
  } as GraphNode;
  return d.editOf
    ? { key: d.suffix, subjectId: d.editOf, subject: shown, untyped: false, edges, removals: d.removals }
    : { key: d.suffix, ghost: shown, untyped: !d.type, edges, removals: [] };
}

export function draftProposal(d: Draft, ctx: DraftContext): Proposal {
  const id = conceptId(d);
  const node = draftNode(d, ctx.confirmed, id);
  const deps = draftDependencies(d, ctx).map((x) => x.id);
  return {
    id: proposalId(d),
    title: proposalTitle(d),
    state: 'open',
    author: { name: d.author.trim() || 'Anonymous' },
    createdAt: d.createdAt,
    ...(d.claim.trim() ? { claim: d.claim.trim() } : {}),
    evidence: d.evidence.map((e) => ({ kind: e.kind, ref: e.ref.trim(), ...(e.note?.trim() ? { note: e.note.trim() } : {}) })),
    nodes: d.editOf ? [] : [node],
    ...(d.editOf ? { edits: [node] } : {}),
    edges: draftEdges(d, ctx),
    ...(d.removals.length ? { removals: [...d.removals] } : {}),
    ...(deps.length ? { dependsOn: deps } : {}),
    tally: { verify: 0, dispute: 0, clarify: 0 },
  };
}

/** The proposals the other drafts would become — what this one's dependencies are checked against. */
const otherProposals = (d: Draft, ctx: DraftContext) => [
  ...ctx.proposals,
  ...ctx.drafts.filter((x) => x.suffix !== d.suffix).map((x) => draftProposal(x, ctx)),
];

export type DraftField =
  | 'label'
  | 'type'
  | 'description'
  | 'equation'
  | 'variables'
  | 'representations'
  | 'generality'
  | 'importance'
  | 'claim'
  | 'relations'
  | 'evidence'
  | 'other';

export interface DraftProblem {
  field: DraftField;
  /** For a relation or evidence row */
  index?: number;
  message: string;
}

/** For an edit: does it change anything at all? */
export function editChanges(d: Draft, confirmed: ConceptGraph) {
  const before = confirmed.nodes.find((n) => n.id === d.editOf);
  return before ? nodeChanges(before, draftNode(d, confirmed)) : [];
}

/** What stops the draft from being exported, in words a proposer can act on. */
export function draftProblems(d: Draft, ctx: DraftContext): DraftProblem[] {
  const out: DraftProblem[] = [];
  if (!d.label.trim()) out.push({ field: 'label', message: 'Give the concept a name.' });
  if (!d.type) out.push({ field: 'type', message: 'Choose what kind of concept it is.' });
  if (!d.description.trim()) out.push({ field: 'description', message: 'Describe the concept in a sentence or two.' });
  if (d.type === 'equation') {
    if (!d.equation.trim()) out.push({ field: 'equation', message: 'Write the equation.' });
    const halfFilled = (vs: EquationVariable[]) => cleanVariables(vs).some((v) => !v.symbol || !v.meaning);
    if (halfFilled(d.variables))
      out.push({ field: 'variables', message: 'Give every variable both its symbol and what it stands for.' });
    d.representations.forEach((r, index) => {
      if (!r.name.trim() && (r.equation.trim() || cleanVariables(r.variables).length))
        out.push({ field: 'representations', index, message: `Name representation ${index + 1} — what is this form called?` });
      if (halfFilled(r.variables))
        out.push({
          field: 'representations',
          index,
          message: `In representation ${index + 1}, give every variable both its symbol and what it stands for.`,
        });
    });
  }
  if (d.generality !== undefined && !inRange(d.generality, GENERALITY_MAX))
    out.push({ field: 'generality', message: `Generality is a whole number from 1 to ${GENERALITY_MAX}.` });
  if (d.importance !== undefined && !inRange(d.importance, IMPORTANCE_MAX))
    out.push({ field: 'importance', message: `Importance is a whole number from 1 to ${IMPORTANCE_MAX}.` });
  if (!d.editOf && d.relations.length === 0)
    out.push({ field: 'relations', message: 'Connect the concept to at least one concept on the map.' });
  if (d.editOf && !editChanges(d, ctx.confirmed).length && !d.relations.length && !d.removals.length)
    out.push({ field: 'other', message: 'Change something — a field, a new relation, or a relation to remove.' });
  const known = new Set([
    NEW_CONCEPT,
    ...ctx.confirmed.nodes.map((n) => n.id),
    ...ctx.proposals.flatMap((p) => p.nodes.map((n) => n.id)),
    ...ctx.drafts.filter((x) => x.suffix !== d.suffix && !x.editOf).map((x) => draftRef(x.suffix)),
  ]);
  d.relations.forEach((r, index) => {
    if (!known.has(r.source) || !known.has(r.target))
      out.push({
        field: 'relations',
        index,
        message: `Relation ${index + 1} points at a concept that's no longer proposed — remove it.`,
      });
  });
  d.evidence.forEach((e, index) => {
    if (!e.ref.trim()) out.push({ field: 'evidence', index, message: `Evidence ${index + 1} is empty.` });
  });
  if (out.length) return out;
  // The same rules the proposed layer applies — anything left is a format problem.
  const p = draftProposal(d, ctx);
  for (const message of proposalProblems(p, ctx.confirmed, otherProposals(d, ctx))) {
    const evidence = p.evidence.findIndex((e) => message.includes(`evidence "${e.ref}"`));
    out.push(
      evidence >= 0
        ? {
            field: 'evidence',
            index: evidence,
            message: `Evidence ${evidence + 1} isn't a valid ${EVIDENCE_LABELS[p.evidence[evidence].kind]}.`,
          }
        : { field: 'other', message },
    );
  }
  return out;
}

export const EVIDENCE_LABELS: Record<Evidence['kind'], string> = {
  arxiv: 'arXiv id',
  doi: 'DOI',
  url: 'web address',
  equation: 'equation',
};

export interface ExportFile {
  path: string;
  content: string;
}

/** The canonical text of a content file — matches formatEntity() in scripts/lib/concept-files.mjs. */
const formatEntity = (entity: unknown) => JSON.stringify(entity, null, 2) + '\n';

/**
 * The files the proposal adds or replaces in content/concepts/, exactly as a
 * merge would. An edit replaces the concept's own file.
 */
export function exportFiles(d: Draft, ctx: DraftContext): ExportFile[] {
  const id = conceptId(d);
  return [
    { path: `content/concepts/nodes/${id}.json`, content: formatEntity(draftNode(d, ctx.confirmed, id)) },
    ...draftEdges(d, ctx).map((e) => ({ path: `content/concepts/edges/${e.id}.json`, content: formatEntity(e) })),
  ];
}

/** The files the proposal deletes: the relations an edit removes. */
export const removedFiles = (d: Draft): string[] => d.removals.map((id) => `content/concepts/edges/${id}.json`);

/** The whole proposal as one file, readable by the proposed layer (content/proposals-fixtures/). */
export function proposalFile(d: Draft, ctx: DraftContext): ExportFile {
  const p = draftProposal(d, ctx);
  return { path: `content/proposals-fixtures/${p.id}.json`, content: formatEntity(p) };
}

const sentenceText = (e: GraphEdge, byId: ConceptMap) =>
  sentenceParts(e, byId)
    .map((part) => (typeof part === 'string' ? part : part.label))
    .join('');

const evidenceLine = (e: Evidence) => {
  const href = evidenceHref(e);
  const ref =
    e.kind === 'equation'
      ? `$$${e.ref}$$`
      : `[${e.kind === 'arxiv' ? `arXiv:${e.ref}` : e.kind === 'doi' ? `doi:${e.ref}` : e.ref}](${href})`;
  return `- ${ref}${e.note ? ` — ${e.note}` : ''}`;
};

/** The pull request a proposer (or Sophie) opens by hand: title, claim, what it adds or changes, evidence, files. */
export function pullRequestText(d: Draft, ctx: DraftContext): string {
  const p = draftProposal(d, ctx);
  const node = (p.edits ?? p.nodes)[0];
  const byId: ConceptMap = new Map([
    ...ctx.confirmed.nodes.map((n) => [n.id, n] as const),
    ...otherProposals(d, ctx).flatMap((o) => o.nodes.map((n) => [n.id, n] as const)),
    [node.id, node],
  ]);
  const confirmedEdge = new Map(ctx.confirmed.edges.map((e) => [e.id, e]));
  const what = d.editOf
    ? [
        '## What it changes',
        '',
        ...editChanges(d, ctx.confirmed).map((c) => `- ${c.field}: “${c.before || '—'}” → “${c.after || '—'}”`),
        ...p.edges.map((e) => `- Adds: ${sentenceText(e, byId)}`),
        ...(p.removals ?? []).map((id) => `- Removes: ${sentenceText(confirmedEdge.get(id)!, byId)}`),
      ]
    : [
        '## What it adds',
        '',
        `- New concept: **${node.label}** (${NODE_TYPE_LABELS[node.type]}) — ${d.description.trim()}`,
        ...p.edges.map((e) => `- ${sentenceText(e, byId)}`),
      ];
  const deps = draftDependencies(d, ctx);
  return [
    `# ${p.title}`,
    '',
    ...(p.claim ? ['## Claim', '', p.claim, ''] : []),
    ...what,
    '',
    ...(deps.length
      ? [
          '## Depends on',
          '',
          ...deps.map((x) => `- ${x.title} (\`${x.id}\`)`),
          '',
          'Merge those first. If one is rejected, the relations pointing at it are removed from this proposal.',
          '',
        ]
      : []),
    '## Evidence',
    '',
    ...(p.evidence.length ? p.evidence.map(evidenceLine) : ['- None given yet.']),
    '',
    '## Files',
    '',
    ...exportFiles(d, ctx).map((f) => `- \`${f.path}\``),
    ...removedFiles(d).map((f) => `- Delete \`${f}\``),
    '',
    `Proposed by ${p.author.name}.`,
    '',
  ].join('\n');
}

/** True once the proposer has typed or connected anything (an edit always counts). */
export function hasContent(d: Draft): boolean {
  return Boolean(
    d.editOf ||
      d.label.trim() ||
      d.description.trim() ||
      d.claim.trim() ||
      d.equation.trim() ||
      d.relations.length ||
      d.evidence.length,
  );
}

/**
 * Discarding a draft is the local version of a rejection: the relations other
 * drafts had into it go. Returns the remaining drafts and how many relations
 * were removed.
 */
export function withoutDraft(drafts: Draft[], suffix: string): { drafts: Draft[]; removed: number } {
  const ref = draftRef(suffix);
  let removed = 0;
  const rest = drafts
    .filter((d) => d.suffix !== suffix)
    .map((d) => {
      const relations = d.relations.filter((r) => r.source !== ref && r.target !== ref);
      removed += d.relations.length - relations.length;
      return relations.length === d.relations.length ? d : { ...d, relations };
    });
  return { drafts: rest, removed };
}

/**
 * After a draft is submitted it lives on as an open proposal (a pull request),
 * so it leaves the drafts — and the relations other drafts had into it now
 * point at its proposed concept, keeping their dependency on it.
 */
export function afterSubmission(drafts: Draft[], suffix: string): Draft[] {
  const submitted = drafts.find((d) => d.suffix === suffix);
  if (!submitted) return drafts;
  const ref = draftRef(suffix);
  const id = conceptId(submitted);
  const point = (x: string) => (x === ref ? id : x);
  return drafts
    .filter((d) => d.suffix !== suffix)
    .map((d) =>
      d.relations.some((r) => r.source === ref || r.target === ref)
        ? { ...d, relations: d.relations.map((r) => ({ ...r, source: point(r.source), target: point(r.target) })) }
        : d,
    );
}

const isString = (v: unknown): v is string => typeof v === 'string';

/**
 * A draft read back from storage, or null when it isn't one (hand-edited,
 * corrupt). Version 1 drafts (one new concept, Phase 2) read as version 2.
 */
export function parseDraft(raw: unknown): Draft | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (![1, 2, 3].includes(d.version as number) || !isString(d.suffix) || !/^[a-z0-9]{4}$/.test(d.suffix)) return null;
  for (const key of ['label', 'description', 'equation', 'claim', 'author', 'createdAt'] as const)
    if (!isString(d[key])) return null;
  if (d.type !== '' && !PROPOSABLE_TYPES.includes(d.type as NodeType)) return null;
  if (d.editOf !== undefined && !isString(d.editOf)) return null;
  if (!Array.isArray(d.domains) || !d.domains.every(isString)) return null;
  for (const key of ['generality', 'importance'] as const)
    if (d[key] !== undefined && typeof d[key] !== 'number') return null;
  const relationOk = (r: unknown) => {
    const x = r as Record<string, unknown>;
    return (
      Boolean(x) &&
      isString(x.key) &&
      isString(x.source) &&
      isString(x.target) &&
      isString(x.relationship) &&
      Array.isArray(x.conditions) &&
      x.conditions.every((c) => c && isString((c as EdgeCondition).label))
    );
  };
  if (!Array.isArray(d.relations) || !d.relations.every(relationOk)) return null;
  const removals = d.removals ?? [];
  if (!Array.isArray(removals) || !removals.every(isString)) return null;
  const kinds = Object.keys(EVIDENCE_LABELS);
  const evidenceOk = (e: unknown) => {
    const x = e as Record<string, unknown>;
    return Boolean(x) && isString(x.kind) && kinds.includes(x.kind) && isString(x.ref);
  };
  if (!Array.isArray(d.evidence) || !d.evidence.every(evidenceOk)) return null;
  const variableOk = (v: unknown) => Boolean(v) && isString((v as EquationVariable).symbol) && isString((v as EquationVariable).meaning);
  const variables = d.variables ?? [];
  if (!Array.isArray(variables) || !variables.every(variableOk)) return null;
  const representations = d.representations ?? [];
  const representationOk = (r: unknown) => {
    const x = r as Record<string, unknown>;
    return Boolean(x) && isString(x.name) && isString(x.equation) && Array.isArray(x.variables) && x.variables.every(variableOk);
  };
  if (!Array.isArray(representations) || !representations.every(representationOk)) return null;
  // Before version 3, importance ran 1–50: the same depth is a fifth of it now.
  const importance =
    d.version !== 3 && typeof d.importance === 'number' ? Math.max(1, Math.round(d.importance / 5)) : (d.importance as number | undefined);
  return {
    ...(raw as Draft),
    version: 3,
    removals: removals as string[],
    variables: variables as EquationVariable[],
    representations: representations as DraftRepresentation[],
    ...(importance !== undefined ? { importance } : {}),
  };
}
