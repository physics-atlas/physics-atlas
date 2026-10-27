import type { Feedback } from './feedback';
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

/**
 * Why a sign-in didn't complete: the backend sends the browser back with
 * ?signin=<reason>&detail=<GitHub's code> (server/api.ts). The one failure it
 * can't report is GitHub showing a 404 instead of the authorise page — that
 * never comes back here, so the sign-in button explains it up front.
 */
export interface SignInProblem {
  reason: 'denied' | 'expired' | 'github' | 'failed';
  detail?: string;
}

export function readSignInProblem(search: string): SignInProblem | null {
  const params = new URLSearchParams(search);
  const reason = params.get('signin');
  if (reason !== 'denied' && reason !== 'expired' && reason !== 'github' && reason !== 'failed') return null;
  const detail = params.get('detail')?.replace(/[^\w]/g, '').slice(0, 40);
  return { reason, ...(detail ? { detail } : {}) };
}

/** Read once at load — the app then rewrites the address, which drops the parameters. */
export const signInProblemOnLoad = typeof window === 'undefined' ? null : readSignInProblem(window.location.search);

export function signInProblemText({ reason, detail }: SignInProblem): string {
  const sendIt = detail ? ` If it happens again, send the curators GitHub's reason: “${detail}”.` : '';
  switch (reason) {
    case 'denied':
      return 'You cancelled the sign-in on GitHub, so you are not signed in.';
    case 'expired':
      return 'The sign-in took too long, or was started in another tab or browser. Please try again.';
    case 'github':
      return `GitHub stopped the sign-in before it reached Physics Atlas. Please try again.${sendIt}`;
    case 'failed':
      return `GitHub didn't confirm who you are. Please try again.${sendIt}`;
  }
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

export type FeedbackResult = { ok: true; number: number; url: string } | { ok: false; error: string; problems?: string[] };

/** Sends feedback; the backend opens it as an issue (src/community/feedback.ts). */
export async function submitFeedback(feedback: Feedback): Promise<FeedbackResult> {
  const r = await backend<{ number?: number; url?: string; error?: string; problems?: string[] }>('/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(feedback),
  });
  if (!r) return { ok: false, error: 'The site could not reach its backend. Please try again in a minute.' };
  if (r.status === 201 && r.data.number && r.data.url) return { ok: true, number: r.data.number, url: r.data.url };
  return { ok: false, error: r.data.error ?? `Sending failed (${r.status}).`, problems: r.data.problems };
}
