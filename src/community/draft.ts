import { NODE_TYPE_LABELS } from '../data/types';
import type { ConceptGraph, EdgeCondition, GraphEdge, GraphNode, NodeType } from '../data/types';
import { sentenceParts } from '../graph/concepts';
import type { ConceptMap } from '../graph/concepts';
import { TYPE_ORDER } from '../graph/typeColors';
import { evidenceHref, proposalProblems } from './proposals';
import type { Evidence, Proposal } from './types';

// A proposal being written in the editor (Phase 2): one new concept and its
// relations, kept in the browser until it's exported. It holds content only —
// where the proposer dragged the ghost on the map is a thinking aid and lives
// in the map, never here, so it can't leak into an export.

/** Stands for the new concept in a draft's relations until it has an id. */
export const NEW_CONCEPT = '@new';

/** Educational resources are curated links, not concepts — they're not proposed here. */
export const PROPOSABLE_TYPES: NodeType[] = TYPE_ORDER.filter((t) => t !== 'resource');

export interface DraftRelation {
  /** Stable while editing (list keys); the exported id comes from the order */
  key: string;
  /** A confirmed concept's id, or NEW_CONCEPT */
  source: string;
  target: string;
  relationship: string;
  conditions: EdgeCondition[];
}

export interface Draft {
  version: 1;
  /** Random, fixed for the draft's life: keeps the id unique however the label changes */
  suffix: string;
  label: string;
  type: NodeType | '';
  description: string;
  domains: string[];
  /** LaTeX, for equations only */
  equation: string;
  relations: DraftRelation[];
  claim: string;
  evidence: Evidence[];
  author: string;
  createdAt: string;
}

export function newDraft(random: () => number = Math.random, now = new Date()): Draft {
  return {
    version: 1,
    suffix: Math.floor(random() * 36 ** 4)
      .toString(36)
      .padStart(4, '0'),
    label: '',
    type: '',
    description: '',
    domains: [],
    equation: '',
    relations: [],
    claim: '',
    evidence: [],
    author: '',
    createdAt: now.toISOString(),
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

/** The new concept's id: a slug of its label plus the draft's suffix, `jeans_scale_k3f9`. */
export const conceptId = (d: Draft): string => `${slugify(d.label)}_${d.suffix}`;

/** The concept as it would be merged, under `id`. */
export function draftNode(d: Draft, id = conceptId(d)): GraphNode {
  const label = d.label.trim();
  const description = d.description.trim();
  const domain = d.domains.length ? d.domains.join(' / ') : undefined;
  const type = d.type || 'property';
  if (type === 'equation')
    return {
      id,
      label,
      type,
      attrs: { description, equation: d.equation.trim(), variables: [], conditions: [], representations: [], domain },
    };
  if (type === 'learning_goal') return { id, label, type, attrs: { description } };
  if (type === 'resource') throw new Error('resources are not proposed through the editor');
  return { id, label, type, attrs: { description, domain } };
}

/** The relations as they would be merged, the new concept under `id`. */
export function draftEdges(d: Draft, id = conceptId(d)): GraphEdge[] {
  const end = (ref: string) => (ref === NEW_CONCEPT ? id : ref);
  return d.relations.map((r, i) => {
    const conditions = r.conditions
      .map((c) => ({ label: c.label.trim(), ...(c.description?.trim() ? { description: c.description.trim() } : {}) }))
      .filter((c) => c.label);
    return {
      id: `${id}_e${i + 1}`,
      source: end(r.source),
      target: end(r.target),
      relationship: r.relationship,
      ...(conditions.length ? { conditions } : {}),
    };
  });
}

/**
 * What the map draws while drafting: the new concept under NEW_CONCEPT, so
 * renaming doesn't re-create it, drawn mid-sized (importance 3) so the ghost
 * is easy to find and grab. The size is display only; it's not exported.
 */
export function draftLayer(d: Draft): { node: GraphNode; edges: GraphEdge[]; untyped: boolean } {
  return {
    node: { ...draftNode(d, NEW_CONCEPT), label: d.label.trim() || 'New concept', importance: 3 },
    edges: draftEdges(d, NEW_CONCEPT),
    untyped: !d.type,
  };
}

export const proposalTitle = (d: Draft): string => `Add ${d.label.trim() || 'a new concept'}`;

export function draftProposal(d: Draft): Proposal {
  const id = conceptId(d);
  return {
    id: `proposal-${id.replaceAll('_', '-')}`,
    title: proposalTitle(d),
    state: 'open',
    author: { name: d.author.trim() || 'Anonymous' },
    createdAt: d.createdAt,
    claim: d.claim.trim(),
    evidence: d.evidence.map((e) => ({ kind: e.kind, ref: e.ref.trim(), ...(e.note?.trim() ? { note: e.note.trim() } : {}) })),
    nodes: [draftNode(d, id)],
    edges: draftEdges(d, id),
    tally: { verify: 0, dispute: 0, clarify: 0 },
  };
}

export type DraftField = 'label' | 'type' | 'description' | 'equation' | 'claim' | 'relations' | 'evidence' | 'other';

export interface DraftProblem {
  field: DraftField;
  /** For a relation or evidence row */
  index?: number;
  message: string;
}

/** What stops the draft from being exported, in words a proposer can act on. */
export function draftProblems(d: Draft, confirmed: ConceptGraph): DraftProblem[] {
  const out: DraftProblem[] = [];
  if (!d.label.trim()) out.push({ field: 'label', message: 'Give the concept a name.' });
  if (!d.type) out.push({ field: 'type', message: 'Choose what kind of concept it is.' });
  if (!d.description.trim()) out.push({ field: 'description', message: 'Describe the concept in a sentence or two.' });
  if (d.type === 'equation' && !d.equation.trim()) out.push({ field: 'equation', message: 'Write the equation.' });
  if (!d.claim.trim()) out.push({ field: 'claim', message: 'State the claim reviewers will vote on.' });
  if (d.relations.length === 0)
    out.push({ field: 'relations', message: 'Connect the concept to at least one concept on the map.' });
  d.evidence.forEach((e, index) => {
    if (!e.ref.trim()) out.push({ field: 'evidence', index, message: `Evidence ${index + 1} is empty.` });
  });
  if (out.length) return out;
  // The same rules the proposed layer applies — anything left is a format problem.
  const p = draftProposal(d);
  for (const message of proposalProblems(p, confirmed)) {
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

/** The files the proposal adds to content/concepts/, exactly as a merge would add them. */
export function exportFiles(d: Draft): ExportFile[] {
  const id = conceptId(d);
  return [
    { path: `content/concepts/nodes/${id}.json`, content: formatEntity(draftNode(d, id)) },
    ...draftEdges(d, id).map((e) => ({ path: `content/concepts/edges/${e.id}.json`, content: formatEntity(e) })),
  ];
}

/** The whole proposal as one file, readable by the proposed layer (content/proposals-fixtures/). */
export function proposalFile(d: Draft): ExportFile {
  const p = draftProposal(d);
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

/** The pull request a proposer (or Sophie) opens by hand: title, claim, what it adds, evidence, files. */
export function pullRequestText(d: Draft, confirmedById: ConceptMap): string {
  const p = draftProposal(d);
  const node = p.nodes[0];
  const byId: ConceptMap = new Map([...confirmedById, [node.id, node]]);
  return [
    `# ${p.title}`,
    '',
    '## Claim',
    '',
    p.claim,
    '',
    '## What it adds',
    '',
    `- New concept: **${node.label}** (${NODE_TYPE_LABELS[node.type]}) — ${d.description.trim()}`,
    ...p.edges.map((e) => `- ${sentenceText(e, byId)}`),
    '',
    '## Evidence',
    '',
    ...(p.evidence.length ? p.evidence.map(evidenceLine) : ['- None given yet.']),
    '',
    '## Files',
    '',
    ...exportFiles(d).map((f) => `- \`${f.path}\``),
    '',
    `Proposed by ${p.author.name}.`,
    '',
  ].join('\n');
}

/** True once the proposer has typed or connected anything. */
export function hasContent(d: Draft): boolean {
  return Boolean(
    d.label.trim() || d.description.trim() || d.claim.trim() || d.equation.trim() || d.relations.length || d.evidence.length,
  );
}

const isString = (v: unknown): v is string => typeof v === 'string';

/** A draft read back from storage, or null when it isn't one (old format, hand-edited, corrupt). */
export function parseDraft(raw: unknown): Draft | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.version !== 1 || !isString(d.suffix) || !/^[a-z0-9]{4}$/.test(d.suffix)) return null;
  for (const key of ['label', 'description', 'equation', 'claim', 'author', 'createdAt'] as const)
    if (!isString(d[key])) return null;
  if (d.type !== '' && !PROPOSABLE_TYPES.includes(d.type as NodeType)) return null;
  if (!Array.isArray(d.domains) || !d.domains.every(isString)) return null;
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
  const kinds = Object.keys(EVIDENCE_LABELS);
  const evidenceOk = (e: unknown) => {
    const x = e as Record<string, unknown>;
    return Boolean(x) && isString(x.kind) && kinds.includes(x.kind) && isString(x.ref);
  };
  if (!Array.isArray(d.evidence) || !d.evidence.every(evidenceOk)) return null;
  return raw as Draft;
}
