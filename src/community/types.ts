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
  /**
   * The exact statement being voted on — Markdown with $…$ / $$…$$ LaTeX.
   * Optional: without one, reviewers vote on the concepts and relations as written.
   */
  claim?: string;
  evidence: Evidence[];
  /** New concepts, exactly as they would be merged (one, from the editor) */
  nodes: GraphNode[];
  /**
   * New relations. Each end is a confirmed concept, one of `nodes` or `edits`,
   * or a concept of a proposal listed in `dependsOn`.
   */
  edges: GraphEdge[];
  /** An edit: the changed version of a confirmed concept, under its own id (one, from the editor) */
  edits?: GraphNode[];
  /** Ids of confirmed relations this proposal would remove */
  removals?: string[];
  /**
   * Proposals whose concepts this one's relations point at. They have to be
   * accepted first; if one is rejected or withdrawn, the relations pointing
   * at it are dropped (`dropped`) and the rest of this proposal stands.
   */
  dependsOn?: string[];
  tally: VoteTally;
  /** Why it's contested — required when state is `contested` */
  dispute?: { summary: string };
  /** The pull request it lives in, once submitted (Phase 3) */
  pr?: { number: number; url: string };
  /** Computed when loading, never authored: relations dropped because a dependency is no longer open */
  dropped?: DroppedRelation[];
}

export interface DroppedRelation {
  edge: GraphEdge;
  /** The proposal it depended on */
  dependency: string;
}

/** Where proposals come from: fixtures now, GitHub pull requests from Phase 3. */
export interface ProposalStore {
  list(): Promise<Proposal[]>;
}
