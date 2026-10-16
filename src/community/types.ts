import type { GraphEdge, GraphNode } from '../data/types';

// A proposal is one reviewable claim: new concepts and/or relations that
// would join the confirmed graph if experts agree (plan: one proposal = one
// pull request). It never carries positions — placement is the map's job.

/** `open`: under review. `contested`: experts disagree; kept visible with its dispute. */
export type ProposalState = 'open' | 'contested';

export type EvidenceKind = 'arxiv' | 'doi' | 'url' | 'equation';

export interface Evidence {
  kind: EvidenceKind;
  /** arXiv id ("2101.01234"), DOI ("10.1103/…"), an http(s) URL, or a LaTeX equation */
  ref: string;
  note?: string;
}

export interface ProposalAuthor {
  name: string;
  /** GitHub handle, once proposals come from pull requests */
  handle?: string;
  orcid?: string;
  /** A curator has attested this person's expertise (Decision 18) */
  verified?: boolean;
}

export interface VoteTally {
  verify: number;
  dispute: number;
  clarify: number;
}

export interface Proposal {
  id: string;
  title: string;
  state: ProposalState;
  author: ProposalAuthor;
  /** ISO 8601 */
  createdAt: string;
  /** The exact statement being voted on — Markdown with $…$ / $$…$$ LaTeX */
  claim: string;
  evidence: Evidence[];
  /** New concepts, exactly as they would be merged */
  nodes: GraphNode[];
  /** New relations; each end is a confirmed concept or one of `nodes` */
  edges: GraphEdge[];
  tally: VoteTally;
  /** Why it's contested — required when state is `contested` */
  dispute?: { summary: string };
}

/** Where proposals come from: fixtures now, GitHub pull requests from Phase 3. */
export interface ProposalStore {
  list(): Promise<Proposal[]>;
}
