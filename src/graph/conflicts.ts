import type { GraphEdge, GraphNode } from '../data/types';
import { normalizeRelationship } from './concepts';

// Live conflict detection for the proposal editor: "is this concept already
// on the map?" and "does this relation already exist, or contradict one?".
// The edge checks mirror scripts/validate-concepts.mjs (duplicate
// (source, target, type) triples, strict-prerequisite cycles) so the editor
// warns about what the validator would later flag.

const STRICT_PREREQ = 'strict prerequisite for';
const MIN_QUERY = 3;

// Common abbreviations, written the way a proposer might type them. A match
// through this list is a hint ("Did you mean …?"), never a block.
const SYNONYMS: [string, string][] = [
  ['gr', 'general relativity'],
  ['sr', 'special relativity'],
  ['qm', 'quantum mechanics'],
  ['qft', 'quantum field theory'],
  ['efe', 'einstein field equation'],
  ['bec', 'bose einstein condensate'],
  ['qgp', 'quark gluon plasma'],
  ['cmb', 'cosmic microwave background'],
  ['dm', 'dark matter'],
  ['rhic', 'relativistic heavy ion collider'],
];

// Abbreviated words, expanded before comparing ("Vlasov eq." = "Vlasov equation").
const WORD_FORMS: Record<string, string> = { eq: 'equation', eqs: 'equation', eqn: 'equation', approx: 'approximation' };

/**
 * A label reduced to what makes it the same concept: lower case, no accents
 * or punctuation, abbreviated words expanded, simple plurals dropped,
 * a leading article removed. "The Schrödinger-Poisson eqs." → "schrodinger poisson equation".
 */
export function normalizeLabel(label: string): string {
  const words = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => WORD_FORMS[w] ?? w)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
  if (words.length > 1 && (words[0] === 'the' || words[0] === 'a' || words[0] === 'an')) words.shift();
  return words.join(' ');
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/** Dice coefficient over character trigrams, 0 (nothing shared) – 1 (identical). */
export function labelSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

const synonymOf = (normalized: string): string | null => {
  for (const [short, long] of SYNONYMS) {
    if (normalized === short) return long;
    if (normalized === long) return short;
  }
  return null;
};

export type LabelMatchReason = 'same name' | 'abbreviation' | 'similar name';

export interface LabelMatch {
  node: GraphNode;
  score: number;
  reason: LabelMatchReason;
}

/**
 * Existing concepts whose name is the same as, an abbreviation of, or close
 * to `label` — best first. Empty for very short input, so typing the first
 * letters doesn't flood the editor with guesses.
 */
export function similarLabels(label: string, nodes: GraphNode[], { threshold = 0.5, max = 3 } = {}): LabelMatch[] {
  const q = normalizeLabel(label);
  if (q.length < MIN_QUERY && !synonymOf(q)) return [];
  const qSynonym = synonymOf(q);
  const matches: LabelMatch[] = [];
  for (const node of nodes) {
    const n = normalizeLabel(node.label);
    if (!n) continue;
    if (n === q) matches.push({ node, score: 1, reason: 'same name' });
    else if (qSynonym === n || synonymOf(n) === q) matches.push({ node, score: 0.95, reason: 'abbreviation' });
    else {
      const score = labelSimilarity(q, n);
      if (score >= threshold) matches.push({ node, score, reason: 'similar name' });
    }
  }
  return matches.sort((a, b) => b.score - a.score || a.node.label.localeCompare(b.node.label)).slice(0, max);
}

/** Where a clashing relation lives. */
export type EdgeSource = { in: 'confirmed' } | { in: 'draft' } | { in: 'proposal'; title: string };

export type EdgeConflict =
  | { kind: 'self' }
  | { kind: 'duplicate'; existing: GraphEdge; source: EdgeSource }
  | { kind: 'reversed'; existing: GraphEdge; source: EdgeSource }
  /** Strict prerequisites would loop: `path` runs target → … → source, and the new edge closes it. */
  | { kind: 'cycle'; path: string[] };

export interface EdgeContext {
  confirmed: GraphEdge[];
  /** The draft's other relations (only the ones before this one, so a pair is reported once) */
  draft?: GraphEdge[];
  /** Relations in other open proposals */
  proposals?: { edge: GraphEdge; title: string }[];
}

const typeOf = (e: GraphEdge) => normalizeRelationship(e.relationship);

/**
 * Why `edge` clashes with what's already there: a relation of the same type
 * between the same concepts (duplicate), the same type pointing the other way
 * (reversed), or a loop of strict prerequisites.
 */
export function edgeConflicts(edge: GraphEdge, ctx: EdgeContext): EdgeConflict[] {
  if (edge.source === edge.target) return [{ kind: 'self' }];
  const type = typeOf(edge);
  const pool: { edge: GraphEdge; source: EdgeSource }[] = [
    ...ctx.confirmed.map((e) => ({ edge: e, source: { in: 'confirmed' } as const })),
    ...(ctx.draft ?? []).map((e) => ({ edge: e, source: { in: 'draft' } as const })),
    ...(ctx.proposals ?? []).map(({ edge: e, title }) => ({ edge: e, source: { in: 'proposal', title } as const })),
  ].filter((c) => c.edge.id !== edge.id);

  const out: EdgeConflict[] = [];
  for (const c of pool) {
    if (typeOf(c.edge) !== type) continue;
    if (c.edge.source === edge.source && c.edge.target === edge.target)
      out.push({ kind: 'duplicate', existing: c.edge, source: c.source });
    else if (c.edge.source === edge.target && c.edge.target === edge.source)
      out.push({ kind: 'reversed', existing: c.edge, source: c.source });
  }

  if (type === STRICT_PREREQ) {
    const path = strictPath(
      edge.target,
      edge.source,
      pool.filter((c) => c.source.in !== 'proposal').map((c) => c.edge),
    );
    if (path) out.push({ kind: 'cycle', path });
  }
  return out;
}

/** A path of strict prerequisites from `from` to `to`, or null. */
function strictPath(from: string, to: string, edges: GraphEdge[]): string[] | null {
  const next = new Map<string, string[]>();
  for (const e of edges)
    if (typeOf(e) === STRICT_PREREQ) next.set(e.source, [...(next.get(e.source) ?? []), e.target]);
  const parent = new Map<string, string>([[from, from]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === to) {
      const path = [id];
      for (let p = id; p !== from; ) {
        p = parent.get(p)!;
        path.unshift(p);
      }
      return path;
    }
    for (const n of next.get(id) ?? [])
      if (!parent.has(n)) {
        parent.set(n, id);
        queue.push(n);
      }
  }
  return null;
}
