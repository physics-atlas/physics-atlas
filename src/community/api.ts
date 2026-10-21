import type { Proposal, ProposalStore } from './types';

// The browser side of the community backend (server/api.ts, served at /api on
// Cloudflare). Where there is no backend — `npm run dev`, or before it's set
// up — every call says so (null), and the map keeps its sample proposals.

export interface SignedInUser {
  login: string;
  id: number;
  name: string;
  avatar?: string;
}

export interface Me {
  configured: boolean;
  user: SignedInUser | null;
  /** On the invite list (community/experts.json) — may submit */
  invited: boolean;
  /** "owner/name" proposals go to */
  repo?: string;
}

export type SubmitResult =
  | { ok: true; number: number; url: string }
  | { ok: false; error: string; problems?: string[]; waiting?: string[] };

/** JSON from the backend, or null when what answered isn't it (e.g. the dev server's index.html). */
async function backend<T>(path: string, init?: RequestInit): Promise<{ status: number; data: T } | null> {
  try {
    const res = await fetch(path, { credentials: 'same-origin', ...init });
    if (!res.headers.get('content-type')?.includes('application/json')) return null;
    return { status: res.status, data: (await res.json()) as T };
  } catch {
    return null;
  }
}

export async function fetchMe(): Promise<Me | null> {
  const r = await backend<Me>('/api/me');
  return r && r.status === 200 ? r.data : null;
}

/** Signing in leaves the page; GitHub brings the person back to `returnTo`. */
export const loginHref = (returnTo: string): string => `/api/auth/login?return=${encodeURIComponent(returnTo)}`;

export async function logout(): Promise<void> {
  await backend('/api/auth/logout', { method: 'POST' });
}

export async function submitProposal(proposal: Proposal, description: string): Promise<SubmitResult> {
  const r = await backend<{ number?: number; url?: string; error?: string; problems?: string[]; waiting?: string[] }>(
    '/api/proposals',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proposal, description }) },
  );
  if (!r) return { ok: false, error: 'The community backend could not be reached.' };
  if (r.status === 201 && r.data.number && r.data.url) return { ok: true, number: r.data.number, url: r.data.url };
  return { ok: false, error: r.data.error ?? `Submitting failed (${r.status}).`, problems: r.data.problems, waiting: r.data.waiting };
}

/** Open proposals from GitHub — the pull requests labelled "proposal". */
export class GitHubStore implements ProposalStore {
  async list(): Promise<Proposal[]> {
    const r = await backend<{ proposals: Proposal[] }>('/api/proposals');
    if (!r || r.status !== 200) throw new Error('Proposals could not be loaded from GitHub.');
    return r.data.proposals;
  }
}
