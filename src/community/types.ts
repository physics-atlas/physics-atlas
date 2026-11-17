import type { GraphEdge, GraphNode } from '../data/types';

// A proposal is one reviewable claim: new concepts and/or relations that
// would join the confirmed graph if experts agree (plan: one proposal = one
// pull request). It never carries positions — placement is the map's job.

/**
 * `open`: under review. `changes`: a reviewer asked for changes on its pull
 * request (GitHub's review state, Decision 45) — kept visible, marked.
 */
export type ProposalState = 'open' | 'changes';

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

/**
 * How the pull request's review stands on GitHub: each reviewer's latest
 * verdict, and the comments on it. Read by the backend when it lists the
 * open proposals; a draft or a sample has none.
 */
export interface GitHubReview {
  approvals: number;
  changesRequested: number;
  comments: number;
}

/** A relation type a proposal adds to the vocabulary, in one of the broader categories. */
export interface ProposedRelationType {
  /** How it reads between the two concepts, lower case: "is a limit of" */
  type: string;
  /** The key of its category in conceptVocabulary.json relationCategories */
  category: string;
}

/** content/pages/<concept>/depth-<n>.md, as a proposal carries them. */
export interface ProposedPage {
  concept: string;
  depths: string[];
  /** How many depths the page had before (an edit), so the extra ones are deleted */
  replaces?: number;
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
   * A concept's page, in Markdown + LaTeX, one text per depth (depth 1 first). Replaces
   * the page: depths past the last one, up to `replaces`, are deleted.
   */
  pages?: ProposedPage[];
  /**
   * Relation types its relations use that the vocabulary doesn't have yet —
   * added to conceptVocabulary.json in the same pull request, each in a category.
   */
  relationTypes?: ProposedRelationType[];
  /**
   * Proposals whose concepts this one's relations point at. They have to be
   * accepted first; if one is rejected or withdrawn, the relations pointing
   * at it are dropped (`dropped`) and the rest of this proposal stands.
   */
  dependsOn?: string[];
  /** Its pull request's review on GitHub, once submitted */
  review?: GitHubReview;
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
