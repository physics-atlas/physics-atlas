import type { ConceptGraph } from '../data/types';
import { proposalProblems, resolveDependencies } from './proposals';
import type { Proposal, ProposalStore } from './types';

// Phase 1: sample proposals from content/proposals-fixtures/*.json. Phase 3
// adds a GitHubStore (open pull requests) behind the same interface.
const FIXTURES = import.meta.glob<Proposal>('../../content/proposals-fixtures/*.json', {
  eager: true,
  import: 'default',
});

/** Every sample file as written, valid or not — for tests that check each one. */
export function fixtureProposals(): Proposal[] {
  return Object.values(FIXTURES);
}

/**
 * Proposals that fit the confirmed graph (the rest are reported and left
 * out), with relations into dependencies that are no longer open dropped.
 */
export function usableProposals(proposals: Proposal[], confirmed: ConceptGraph): Proposal[] {
  const valid = proposals.filter((p) => {
    const problems = proposalProblems(p, confirmed, proposals);
    if (problems.length) console.warn(`Proposal "${p.id}" left out:\n  ${problems.join('\n  ')}`);
    return problems.length === 0;
  });
  return resolveDependencies(valid, confirmed);
}

export class FixtureStore implements ProposalStore {
  private readonly confirmed: ConceptGraph;
  private readonly source: Proposal[];

  constructor(confirmed: ConceptGraph, source: Proposal[] = Object.values(FIXTURES)) {
    this.confirmed = confirmed;
    this.source = source;
  }

  async list(): Promise<Proposal[]> {
    return usableProposals(
      [...this.source].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      this.confirmed,
    );
  }
}
