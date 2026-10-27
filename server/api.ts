import { concepts } from '../src/data/loadConcepts';
import { feedbackIssue, feedbackProblems } from '../src/community/feedback';
import { MAX_FIGURES, figurePath, uploadProblem } from '../src/community/figures';
import type { FigureUpload } from '../src/community/figures';
import type { Feedback } from '../src/community/feedback';
import { proposalProblems, resolveDependencies } from '../src/community/proposals';
import type { Proposal } from '../src/community/types';
import { readConfig } from './config';
import type { Config, Env } from './config';
import { randomToken } from './crypto';
import { GitHub, GitHubError, SignInError } from './github';
import type { Fetch } from './github';
import { VOCABULARY_PATH, branchFor, decodeProposal, filesFor, parseExperts, pullRequestBody } from './proposalPr';
import type { Expert } from './proposalPr';
import { SESSION_COOKIE, SESSION_SECONDS, STATE_COOKIE, cookie, openSession, readCookie, sealSession } from './session';
import type { SessionUser } from './session';

// The community backend (Phase 3): sign in with GitHub, see open proposals,
// submit one as a pull request, send feedback as an issue. Everything a browser can't be trusted with —
// the App key, the OAuth secret, deciding who may submit — happens here.
//
//   GET  /api/me                 { configured, user, invited }
//   GET  /api/auth/login         → GitHub, then back to ?return=
//   GET  /api/auth/callback      GitHub sends the browser here → back, with ?signin=<reason> if it failed
//   POST /api/auth/logout
//   GET  /api/proposals          { proposals } — open pull requests labelled "proposal"
//   POST /api/proposals          { proposal, description, uploads? } → { number, url }
//   POST /api/feedback           { kind, title, message, page? } → { number, url } — anyone signed in

export const PROPOSAL_LABEL = 'proposal';
/** How long the list of open proposals is reused: a new one shows within this for everyone. */
const LIST_TTL = 30_000;
const EXPERTS_TTL = 300_000;
/** How many feedback issues one person may open per hour (per Worker instance — a brake, not a wall). */
const FEEDBACK_PER_HOUR = 5;

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

/** Only a path on this site — never an open redirect. */
const safeReturn = (r: string | null) => (r && r.startsWith('/') && !r.startsWith('//') ? r : '/?mode=community');

/** Why a sign-in didn't complete — the community panel says it in words (src/community/api.ts). */
export type SignInProblem = 'denied' | 'expired' | 'github' | 'failed';

/** The end of a sign-in: back to where the person was, with any extra query, the state cookie cleared. */
function backTo(back: string | undefined, query: Record<string, string>, sessionCookie?: string) {
  const to = new URL(safeReturn(back ?? null), 'https://site.invalid');
  for (const [k, v] of Object.entries(query)) to.searchParams.set(k, v);
  const headers = new Headers({ location: `${to.pathname}${to.search}` });
  if (sessionCookie) headers.append('set-cookie', sessionCookie);
  headers.append('set-cookie', cookie(STATE_COOKIE, '', 0));
  return new Response(null, { status: 302, headers });
}

interface Cached<T> {
  value: T;
  until: number;
}

/** Per-isolate state: GitHub clients (and their tokens) and short caches. */
const state = {
  clients: new Map<string, GitHub>(),
  list: new Map<string, Cached<Proposal[]>>(),
  experts: new Map<string, Cached<Expert[]>>(),
  /** login → when they last sent feedback, within the hour */
  feedback: new Map<string, number[]>(),
};

/** Clears the caches — tests start each case from nothing. */
export function resetCaches() {
  state.clients.clear();
  state.list.clear();
  state.experts.clear();
  state.feedback.clear();
}

function client(config: Config, fetchImpl: Fetch) {
  const key = `${config.owner}/${config.repo}#${config.appId}`;
  let gh = state.clients.get(key);
  if (!gh) {
    gh = new GitHub(config, fetchImpl);
    state.clients.set(key, gh);
  }
  return gh;
}

async function experts(config: Config, gh: GitHub, now: number): Promise<Expert[]> {
  const key = `${config.owner}/${config.repo}`;
  const hit = state.experts.get(key);
  if (hit && hit.until > now) return hit.value;
  const fromRepo = parseExperts(await gh.readFile('community/experts.json'));
  const extra = config.extraProposers
    .filter((h) => !fromRepo.some((e) => e.github.toLowerCase() === h))
    .map((github) => ({ github }));
  const value = [...fromRepo, ...extra];
  state.experts.set(key, { value, until: now + EXPERTS_TTL });
  return value;
}

const expertFor = (list: Expert[], login: string) => list.find((e) => e.github.toLowerCase() === login.toLowerCase());

async function openProposals(config: Config, gh: GitHub, now: number): Promise<Proposal[]> {
  const key = `${config.owner}/${config.repo}`;
  const hit = state.list.get(key);
  if (hit && hit.until > now) return hit.value;
  const prs = await gh.openPullRequests(PROPOSAL_LABEL);
  const raw = prs.flatMap((pr) => {
    const p = decodeProposal(pr.body);
    return p ? [{ ...p, createdAt: pr.created_at, pr: { number: pr.number, url: pr.html_url } }] : [];
  });
  // The same rules the map applies: proposals that no longer fit are left
  // out, and relations into proposals that were closed are dropped.
  const valid = raw.filter((p) => proposalProblems(p, concepts, raw).length === 0);
  const value = resolveDependencies(valid, concepts).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  state.list.set(key, { value, until: now + LIST_TTL });
  return value;
}

export async function handle(request: Request, env: Env, fetchImpl: Fetch = fetch, now = Date.now()): Promise<Response> {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname.replace(/\/+$/, '')}`;
  const config = readConfig(env);
  if ('missing' in config) {
    // Not set up yet: the site keeps working with its sample proposals.
    if (route === 'GET /api/me') return json({ configured: false, user: null, invited: false });
    return json({ error: 'The community backend is not configured yet.', missing: config.missing }, 503);
  }
  const gh = client(config, fetchImpl);
  const user = await openSession(readCookie(request, SESSION_COOKIE), config.sessionSecret, now);

  try {
    switch (route) {
      case 'GET /api/me': {
        const invited = user ? Boolean(expertFor(await experts(config, gh, now), user.login)) : false;
        return json({ configured: true, user, invited, repo: `${config.owner}/${config.repo}` });
      }

      case 'GET /api/auth/login': {
        const st = randomToken();
        const back = safeReturn(url.searchParams.get('return'));
        const authorize = new URL('https://github.com/login/oauth/authorize');
        authorize.searchParams.set('client_id', config.clientId);
        authorize.searchParams.set('redirect_uri', `${url.origin}/api/auth/callback`);
        authorize.searchParams.set('state', st);
        return new Response(null, {
          status: 302,
          headers: { location: authorize.toString(), 'set-cookie': cookie(STATE_COOKIE, `${st}|${back}`, 600) },
        });
      }

      case 'GET /api/auth/callback': {
        const [st, back] = (readCookie(request, STATE_COOKIE) ?? '').split('|');
        // Every way back from GitHub ends on the site: a problem becomes
        // ?signin=<reason> for the community panel to explain, and a line in
        // the Worker's logs.
        const fail = (reason: SignInProblem, detail?: string) => {
          const clean = detail?.replace(/[^\w]/g, '').slice(0, 40);
          console.warn(`sign-in failed: ${reason}${clean ? ` (${clean})` : ''}`);
          return backTo(back, { signin: reason, ...(clean ? { detail: clean } : {}) });
        };
        const refused = url.searchParams.get('error');
        if (refused) return fail(refused === 'access_denied' ? 'denied' : 'github', refused);
        const code = url.searchParams.get('code');
        if (!st || st !== url.searchParams.get('state') || !code) return fail('expired');
        let u;
        try {
          u = await gh.userFromCode(code, `${url.origin}/api/auth/callback`);
        } catch (e) {
          if (e instanceof SignInError) return fail('failed', e.code);
          if (e instanceof GitHubError) return fail('failed', `profile_${e.status}`);
          throw e;
        }
        console.log(`sign-in: @${u.login}`);
        const session: SessionUser = { login: u.login, id: u.id, name: u.name ?? u.login, avatar: u.avatar_url };
        return backTo(back, {}, cookie(SESSION_COOKIE, await sealSession(session, config.sessionSecret, now), SESSION_SECONDS));
      }

      case 'POST /api/auth/logout':
        return new Response(null, { status: 204, headers: { 'set-cookie': cookie(SESSION_COOKIE, '', 0) } });

      case 'GET /api/proposals':
        return json({ proposals: await openProposals(config, gh, now) });

      case 'POST /api/proposals': {
        // Same-origin only: the cookie is SameSite=Lax already; this closes the rest.
        const origin = request.headers.get('origin');
        if (origin && origin !== url.origin) return json({ error: 'Cross-site submissions are not accepted.' }, 403);
        if (!user) return json({ error: 'Sign in with GitHub to submit.' }, 401);
        const expert = expertFor(await experts(config, gh, now), user.login);
        if (!expert)
          return json({ error: `@${user.login} isn't on the invite list yet. Ask the curators to add you.` }, 403);

        const body = (await request.json().catch(() => null)) as {
          proposal?: Proposal;
          description?: string;
          uploads?: FigureUpload[];
        } | null;
        if (!body?.proposal || typeof body.proposal !== 'object') return json({ error: 'No proposal in the request.' }, 400);
        const open = await openProposals(config, gh, now);
        // The server decides who proposed it, when, and how the vote stands.
        const proposal: Proposal = {
          ...body.proposal,
          state: 'open',
          author: { name: user.name, handle: user.login, ...(expert.verified ? { verified: true } : {}) },
          createdAt: new Date(now).toISOString(),
          tally: { verify: 0, dispute: 0, clarify: 0 },
          dispute: undefined,
          dropped: undefined,
        };
        if (open.some((p) => p.id === proposal.id))
          return json({ error: 'This proposal is already open as a pull request.' }, 409);
        const waiting = (proposal.dependsOn ?? []).filter((d) => !open.some((p) => p.id === d));
        if (waiting.length)
          return json({ error: `Submit what it depends on first: ${waiting.join(', ')}.`, waiting }, 409);
        const problems = proposalProblems(proposal, concepts, open);
        if (problems.length) return json({ error: 'The proposal does not fit the map.', problems }, 422);
        // Pictures: every new one the concept names is uploaded, and nothing else is.
        const owned = [...proposal.nodes, ...(proposal.edits ?? [])];
        const before = new Map(concepts.nodes.map((n) => [n.id, new Set((n.figures ?? []).map((f) => f.file))]));
        const fresh = new Set(owned.flatMap((n) => (n.figures ?? []).filter((f) => !before.get(n.id)?.has(f.file)).map((f) => figurePath(f.file))));
        const uploads = Array.isArray(body.uploads) ? body.uploads : [];
        if (uploads.length > MAX_FIGURES || uploads.some((u) => !u || typeof u.path !== 'string' || typeof u.data !== 'string'))
          return json({ error: 'The pictures in the request are not readable.' }, 400);
        const pictureProblems = uploads.flatMap((u) => uploadProblem(u, fresh) ?? []);
        const missing = [...fresh].filter((path) => !uploads.some((u) => u.path === path));
        if (missing.length) pictureProblems.push(...missing.map((path) => `"${path}" is named but wasn't sent`));
        if (pictureProblems.length) return json({ error: 'The pictures do not fit the proposal.', problems: pictureProblems }, 422);
        const dropped = (proposal.edits ?? []).flatMap((n) => {
          const kept = new Set((n.figures ?? []).map((f) => f.file));
          return [...(before.get(n.id) ?? [])].filter((f) => !kept.has(f)).map(figurePath);
        });
        const vocabulary = proposal.relationTypes?.length ? await gh.readFile(VOCABULARY_PATH) : undefined;
        const files = filesFor(proposal, { vocabulary, uploads, dropped });
        if ('problem' in files) return json({ error: files.problem }, 422);

        const pr = await gh.openPullRequest({
          branch: branchFor(proposal),
          files,
          message: `${proposal.title}\n\nProposed by @${user.login} through Physics Atlas.`,
          author: { name: user.name, email: `${user.id}+${user.login}@users.noreply.github.com` },
          title: proposal.title,
          body: pullRequestBody(typeof body.description === 'string' ? body.description : proposal.title, proposal, user.login),
          labels: [PROPOSAL_LABEL],
        });
        state.list.delete(`${config.owner}/${config.repo}`);
        return json(pr, 201);
      }

      case 'POST /api/feedback': {
        const origin = request.headers.get('origin');
        if (origin && origin !== url.origin) return json({ error: 'Cross-site feedback is not accepted.' }, 403);
        if (!user) return json({ error: 'Sign in with GitHub to send feedback.' }, 401);
        const body = (await request.json().catch(() => null)) as Partial<Record<keyof Feedback, unknown>> | null;
        if (!body || typeof body !== 'object') return json({ error: 'No feedback in the request.' }, 400);
        const problems = feedbackProblems(body);
        if (problems.length) return json({ error: 'The feedback is not complete.', problems: problems.map((p) => p.message) }, 422);
        const key = user.login.toLowerCase();
        const recent = (state.feedback.get(key) ?? []).filter((t) => t > now - 3600_000);
        if (recent.length >= FEEDBACK_PER_HOUR)
          return json({ error: 'You have sent a lot of feedback this hour — thank you! Please wait a while before sending more.' }, 429);
        const issue = await gh.openIssue(feedbackIssue(body as unknown as Feedback, user.login));
        state.feedback.set(key, [...recent, now]);
        console.log(`feedback: #${issue.number} from @${user.login}`);
        return json(issue, 201);
      }

      default:
        return json({ error: 'Not found.' }, 404);
    }
  } catch (e) {
    if (e instanceof GitHubError && e.status === 422 && route === 'POST /api/proposals')
      return json({ error: 'GitHub refused the change — a branch for this proposal may already exist.' }, 409);
    // The App needs "Issues: read and write" (docs/COMMUNITY-BACKEND-SETUP.md); without it GitHub says 403.
    if (e instanceof GitHubError && e.status === 403 && route === 'POST /api/feedback') {
      console.error(e);
      return json({ error: 'The site is not allowed to open issues yet — the curators have to grant it. Sorry!' }, 503);
    }
    console.error(e);
    return json({ error: 'GitHub could not be reached. Please try again in a minute.' }, 502);
  }
}
