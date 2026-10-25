import type { Proposal } from '../src/community/types';
import type { FileChange } from './github';

// A proposal travels as one pull request: the content files it adds, replaces
// or deletes, and a description a reviewer reads — with the proposal itself
// tucked into the description as JSON, so the map can show it again.

const MARKER = 'physics-atlas:proposal';
const SAFE_ID = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const MAX_DESCRIPTION = 20_000;

/** The JSON block at the end of the description. "--" is escaped so it can't close the HTML comment. */
export function encodeProposal(p: Proposal): string {
  return `<!-- ${MARKER} v1\n${JSON.stringify(p, null, 2).replaceAll('--', '-\\u002d')}\n-->`;
}

/** The proposal in a pull request's description, or null when there isn't one. */
export function decodeProposal(body: string | null): Proposal | null {
  const m = (body ?? '').match(new RegExp(`<!-- ${MARKER} v1\\n([\\s\\S]*?)\\n-->`));
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as Proposal;
  } catch {
    return null;
  }
}

export function pullRequestBody(description: string, p: Proposal, login: string): string {
  const text = description.trim().slice(0, MAX_DESCRIPTION);
  return [
    text,
    '',
    '---',
    `Submitted through Physics Atlas by @${login}. The Physics Atlas app opened this pull request on their behalf;`,
    'the commit is authored by them. Please review it as their proposal.',
    '',
    encodeProposal(p),
  ].join('\n');
}

const formatEntity = (entity: unknown) => JSON.stringify(entity, null, 2) + '\n';

/**
 * The repository changes a proposal makes, derived from the proposal itself —
 * never from paths a browser sent. Ids are checked before they become paths.
 */
export function filesFor(p: Proposal): FileChange[] | { problem: string } {
  const out: FileChange[] = [];
  for (const n of [...p.nodes, ...(p.edits ?? [])]) {
    if (!SAFE_ID.test(n.id)) return { problem: `concept id "${n.id}" can't be a file name` };
    out.push({ path: `content/concepts/nodes/${n.id}.json`, content: formatEntity(n) });
  }
  for (const e of p.edges) {
    if (!SAFE_ID.test(e.id)) return { problem: `relation id "${e.id}" can't be a file name` };
    out.push({ path: `content/concepts/edges/${e.id}.json`, content: formatEntity(e) });
  }
  for (const id of p.removals ?? []) {
    if (!SAFE_ID.test(id)) return { problem: `relation id "${id}" can't be a file name` };
    out.push({ path: `content/concepts/edges/${id}.json`, content: null });
  }
  // A page: one Typst file per depth; depths an edit drops are deleted.
  for (const page of p.pages ?? []) {
    if (!SAFE_ID.test(page.concept)) return { problem: `concept id "${page.concept}" can't be a folder name` };
    page.depths.forEach((source, i) =>
      out.push({ path: `content/pages/${page.concept}/depth-${i + 1}.typ`, content: `${source.trim()}\n` }),
    );
    for (let d = page.depths.length + 1; d <= (page.replaces ?? 0); d++)
      out.push({ path: `content/pages/${page.concept}/depth-${d}.typ`, content: null });
  }
  return out;
}

/** The proposal's branch: `proposal/<id>`, kept to characters git accepts everywhere. */
export const branchFor = (p: Proposal): string => `proposal/${p.id.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`;

export interface Expert {
  github: string;
  name?: string;
  /** A curator has attested this person's expertise (Decision 18) */
  verified?: boolean;
  domains?: string[];
}

/** community/experts.json — the people invited to propose while the repository is private. */
export function parseExperts(text: string | null): Expert[] {
  if (!text) return [];
  try {
    const raw = JSON.parse(text) as { experts?: unknown };
    return (Array.isArray(raw.experts) ? raw.experts : []).filter(
      (e): e is Expert => Boolean(e) && typeof (e as Expert).github === 'string',
    );
  } catch {
    return [];
  }
}
