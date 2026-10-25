import { beforeEach, describe, expect, it } from 'vitest';
import { NEW_CONCEPT, draftProposal, newDraft, newEditDraft } from '../src/community/draft';
import type { Draft, DraftContext } from '../src/community/draft';
import type { Proposal } from '../src/community/types';
import { concepts } from '../src/data/loadConcepts';
import { handle, resetCaches } from './api';
import type { Env } from './config';
import { base64url, fromBase64url, pemToPkcs8 } from './crypto';
import { decodeProposal, encodeProposal } from './proposalPr';

const ORIGIN = 'https://atlas.example';

async function keyPair() {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const pem = (label: string, der: Uint8Array) =>
    `-----BEGIN ${label}-----\n${btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n')}\n-----END ${label}-----\n`;
  // PKCS#1, the format GitHub downloads: the RSAPrivateKey inside the PKCS#8 wrapper.
  const pkcs1 = pkcs8.slice(26);
  return { publicKey: pair.publicKey, pkcs8, pkcs8Pem: pem('PRIVATE KEY', pkcs8), pkcs1Pem: pem('RSA PRIVATE KEY', pkcs1) };
}

const keys = await keyPair();

const env: Env = {
  GITHUB_REPO: 'atlas-org/atlas-test',
  GITHUB_APP_ID: '123',
  GITHUB_APP_PRIVATE_KEY: keys.pkcs1Pem,
  GITHUB_CLIENT_ID: 'client-id',
  GITHUB_CLIENT_SECRET: 'client-secret',
  SESSION_SECRET: 'a-long-random-session-secret-for-tests',
};

/** A stand-in for GitHub: records what the backend writes, serves what it reads. */
function fakeGitHub(invited: string[] = ['ada']) {
  const writes: { method: string; path: string; body: unknown }[] = [];
  const pulls: { number: number; html_url: string; title: string; body: string; created_at: string; user: { login: string }; pull_request: object }[] = [];
  let jwtSeen = '';
  const experts = { experts: invited.map((github) => ({ github, name: 'Ada', verified: true })) };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const auth = (init.headers as Record<string, string> | undefined)?.authorization ?? '';
    const path = url.pathname;
    if (url.host === 'github.com' && path === '/login/oauth/access_token')
      return reply(body.code === 'good' ? { access_token: `user-${body.code}` } : { error: 'bad_verification_code' });
    if (path === '/user') return reply(auth === 'Bearer user-good' ? { login: 'ada', id: 42, name: 'Ada L' } : {}, auth ? 200 : 401);
    if (path === '/repos/atlas-org/atlas-test/installation') {
      jwtSeen = auth.slice('Bearer '.length);
      return reply({ id: 7 });
    }
    if (path === '/app/installations/7/access_tokens')
      return reply({ token: 'install-token', expires_at: new Date(Date.now() + 3600_000).toISOString() });
    if (auth !== 'Bearer install-token') return reply({ message: 'Bad credentials' }, 401);
    const r = '/repos/atlas-org/atlas-test';
    if (path === `${r}/contents/community/experts.json`)
      return reply({ content: btoa(JSON.stringify(experts)) });
    if (path === `${r}/issues` && method === 'GET') return reply(pulls);
    if (path === `${r}/git/ref/heads/main`) return reply({ object: { sha: 'base-sha' } });
    if (path === `${r}/git/commits/base-sha`) return reply({ tree: { sha: 'base-tree' } });
    writes.push({ method, path, body });
    if (path === `${r}/git/trees`) return reply({ sha: 'new-tree' });
    if (path === `${r}/git/commits`) return reply({ sha: 'new-commit' });
    if (path === `${r}/git/refs`) return reply({ ref: body.ref });
    if (path === `${r}/pulls`) {
      const number = 12 + pulls.length;
      pulls.push({
        number,
        html_url: `https://github.com/atlas-org/atlas-test/pull/${number}`,
        title: body.title,
        body: body.body,
        created_at: '2026-10-21T10:00:00Z',
        user: { login: 'physics-atlas[bot]' },
        pull_request: {},
      });
      return reply({ number, html_url: `https://github.com/atlas-org/atlas-test/pull/${number}` });
    }
    if (/\/issues\/\d+\/labels$/.test(path)) return reply([]);
    return reply({ message: 'Not Found' }, 404);
  };
  return { fetchImpl, writes, pulls, jwt: () => jwtSeen };
}

const call = (gh: ReturnType<typeof fakeGitHub>, path: string, init: RequestInit = {}, e: Env = env) =>
  handle(new Request(`${ORIGIN}${path}`, init), e, gh.fetchImpl);

const cookieFrom = (res: Response, name: string) =>
  (res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''])
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith(`${name}=`));

async function signIn(gh: ReturnType<typeof fakeGitHub>) {
  const login = await call(gh, '/api/auth/login?return=/?mode=community');
  const state = new URL(login.headers.get('location')!).searchParams.get('state')!;
  const callback = await call(gh, `/api/auth/callback?code=good&state=${state}`, {
    headers: { cookie: cookieFrom(login, 'atlas_oauth_state')! },
  });
  return cookieFrom(callback, 'atlas_session')!;
}

const jeans = (): Draft => ({
  ...newDraft(() => 0.5, new Date('2026-10-21T09:00:00Z')),
  label: 'Jeans scale',
  type: 'property',
  description: 'Sample: the length scale above which gravity overcomes pressure support.',
  relations: [{ key: 'r1', source: NEW_CONCEPT, target: 'structure_formation', relationship: 'is a condition of', conditions: [] }],
});
const alone = (...drafts: Draft[]): DraftContext => ({ confirmed: concepts, drafts, proposals: [] });
const submit = (gh: ReturnType<typeof fakeGitHub>, session: string | undefined, proposal: Proposal, origin = ORIGIN) =>
  call(gh, '/api/proposals', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, ...(session ? { cookie: session } : {}) },
    body: JSON.stringify({ proposal, description: `# ${proposal.title}\n\nWhat it adds.` }),
  });

beforeEach(() => resetCaches());

describe('crypto', () => {
  it('turns a GitHub (PKCS#1) key into the PKCS#8 Web Crypto imports', () => {
    expect(pemToPkcs8(keys.pkcs1Pem)).toEqual(keys.pkcs8);
    expect(pemToPkcs8(keys.pkcs8Pem)).toEqual(keys.pkcs8);
  });
  it('signs the App token with the App key (RS256)', async () => {
    const gh = fakeGitHub();
    await call(gh, '/api/proposals');
    const [head, body, sig] = gh.jwt().split('.');
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      keys.publicKey,
      fromBase64url(sig) as BufferSource,
      new TextEncoder().encode(`${head}.${body}`),
    );
    expect(ok).toBe(true);
    expect(JSON.parse(new TextDecoder().decode(fromBase64url(body)))).toMatchObject({ iss: '123' });
  });
});

describe('before it is set up', () => {
  it('says so, and the site keeps its sample proposals', async () => {
    const gh = fakeGitHub();
    const me = await call(gh, '/api/me', {}, {});
    expect(await me.json()).toEqual({ configured: false, user: null, invited: false });
    const list = await call(gh, '/api/proposals', {}, {});
    expect(list.status).toBe(503);
    expect((await list.json()).missing).toContain('GITHUB_APP_ID');
  });
});

describe('signing in with GitHub', () => {
  it('sends the browser to GitHub with a state it checks on the way back', async () => {
    const gh = fakeGitHub();
    const res = await call(gh, '/api/auth/login?return=/?mode=community');
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('location')!);
    expect(to.origin + to.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(to.searchParams.get('client_id')).toBe('client-id');
    expect(to.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback`);
    expect(cookieFrom(res, 'atlas_oauth_state')).toContain(to.searchParams.get('state')!);
  });
  it('signs in on the way back and returns to where the person was', async () => {
    const gh = fakeGitHub();
    const session = await signIn(gh);
    const me = await (await call(gh, '/api/me', { headers: { cookie: session } })).json();
    expect(me).toMatchObject({ configured: true, user: { login: 'ada', id: 42, name: 'Ada L' }, invited: true });
  });
  it('refuses a callback whose state does not match, and says so on the site', async () => {
    const gh = fakeGitHub();
    const res = await call(gh, '/api/auth/callback?code=good&state=forged', {
      headers: { cookie: 'atlas_oauth_state=real|/?mode=community' },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/?mode=community&signin=expired');
    expect(cookieFrom(res, 'atlas_session')).toBeUndefined();
  });
  it('brings every failed sign-in back to the site with its reason', async () => {
    const gh = fakeGitHub();
    const back = async (query: string) => {
      const login = await call(gh, '/api/auth/login?return=/?mode=community');
      const state = new URL(login.headers.get('location')!).searchParams.get('state')!;
      const res = await call(gh, `/api/auth/callback?state=${state}&${query}`, {
        headers: { cookie: cookieFrom(login, 'atlas_oauth_state')! },
      });
      expect(cookieFrom(res, 'atlas_session')).toBeUndefined();
      return Object.fromEntries(new URL(res.headers.get('location')!, ORIGIN).searchParams);
    };
    expect(await back('error=access_denied')).toEqual({ mode: 'community', signin: 'denied', detail: 'access_denied' });
    expect(await back('error=redirect_uri_mismatch')).toMatchObject({ signin: 'github', detail: 'redirect_uri_mismatch' });
    expect(await back('code=stale')).toMatchObject({ signin: 'failed', detail: 'bad_verification_code' });
    // GitHub's reason is passed on as a code only, never as text to show.
    expect((await back('error=%3Cb%3Ehi%3C%2Fb%3E')).detail).toBe('bhib');
  });
  it('never redirects off the site', async () => {
    const gh = fakeGitHub();
    const login = await call(gh, '/api/auth/login?return=//evil.example/');
    const state = new URL(login.headers.get('location')!).searchParams.get('state')!;
    const back = await call(gh, `/api/auth/callback?code=good&state=${state}`, {
      headers: { cookie: cookieFrom(login, 'atlas_oauth_state')! },
    });
    expect(back.headers.get('location')).toBe('/?mode=community');
  });
  it('ignores a tampered session', async () => {
    const gh = fakeGitHub();
    const session = await signIn(gh);
    const [name, value] = session.split('=');
    const [body, sig] = decodeURIComponent(value).split('.');
    const forged = base64url(JSON.stringify({ ...JSON.parse(new TextDecoder().decode(fromBase64url(body))), login: 'mallory' }));
    const me = await (await call(gh, '/api/me', { headers: { cookie: `${name}=${encodeURIComponent(`${forged}.${sig}`)}` } })).json();
    expect(me.user).toBeNull();
  });
});

describe('submitting a proposal', () => {
  it('needs a signed-in, invited proposer, from this site', async () => {
    const gh = fakeGitHub();
    const p = draftProposal(jeans(), alone(jeans()));
    expect((await submit(gh, undefined, p)).status).toBe(401);
    const session = await signIn(gh);
    expect((await submit(gh, session, p, 'https://elsewhere.example')).status).toBe(403);
    // Signed in fine, but not on the invite list.
    resetCaches();
    const gh2 = fakeGitHub([]);
    const res = await submit(gh2, await signIn(gh2), p);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("@ada isn't on the invite list") });
    expect(res.status).toBe(403);
  });

  it('opens one pull request: a branch, a commit by the proposer, the files, a label', async () => {
    const gh = fakeGitHub();
    const session = await signIn(gh);
    const p = draftProposal(jeans(), alone(jeans()));
    const res = await submit(gh, session, p);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ number: 12, url: 'https://github.com/atlas-org/atlas-test/pull/12' });
    const tree = gh.writes.find((w) => w.path.endsWith('/git/trees'))!.body as { base_tree: string; tree: { path: string; content?: string }[] };
    expect(tree.base_tree).toBe('base-tree');
    expect(tree.tree.map((t) => t.path)).toEqual([
      `content/concepts/nodes/${p.nodes[0].id}.json`,
      `content/concepts/edges/${p.edges[0].id}.json`,
    ]);
    expect(JSON.parse(tree.tree[0].content!)).toEqual(p.nodes[0]);
    const commit = gh.writes.find((w) => w.path.endsWith('/git/commits'))!.body as { author: { email: string }; parents: string[] };
    expect(commit.author.email).toBe('42+ada@users.noreply.github.com');
    expect(commit.parents).toEqual(['base-sha']);
    const ref = gh.writes.find((w) => w.path.endsWith('/git/refs'))!.body as { ref: string };
    expect(ref.ref).toBe(`refs/heads/proposal/${p.id}`);
    const pr = gh.writes.find((w) => w.path.endsWith('/pulls'))!.body as { title: string; body: string; base: string };
    expect(pr).toMatchObject({ title: 'Add Jeans scale', base: 'main' });
    expect(pr.body).toContain('Submitted through Physics Atlas by @ada.');
    const labels = gh.writes.find((w) => w.path.endsWith('/labels'))!.body as { labels: string[] };
    expect(labels.labels).toEqual(['proposal']);
  });

  it('decides itself who proposed it and how the vote stands', async () => {
    const gh = fakeGitHub();
    const session = await signIn(gh);
    const forged = { ...draftProposal(jeans(), alone(jeans())), author: { name: 'Someone else', verified: true }, tally: { verify: 99, dispute: 0, clarify: 0 } };
    await submit(gh, session, forged);
    const stored = decodeProposal(gh.pulls[0].body)!;
    expect(stored.author).toEqual({ name: 'Ada L', handle: 'ada', verified: true });
    expect(stored.tally).toEqual({ verify: 0, dispute: 0, clarify: 0 });
  });

  it('then shows up in the list, with its pull request, for everyone', async () => {
    const gh = fakeGitHub();
    const session = await signIn(gh);
    await submit(gh, session, draftProposal(jeans(), alone(jeans())));
    const { proposals } = await (await call(gh, '/api/proposals')).json();
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      title: 'Add Jeans scale',
      author: { handle: 'ada' },
      pr: { number: 12, url: 'https://github.com/atlas-org/atlas-test/pull/12' },
      createdAt: '2026-10-21T10:00:00Z',
    });
  });

  it('refuses one that depends on a proposal that is not open yet', async () => {
    const gh = fakeGitHub();
    const session = await signIn(gh);
    const a = jeans();
    const b: Draft = {
      ...newDraft(() => 0.25),
      label: 'Jeans mass',
      type: 'property',
      description: 'Sample.',
      relations: [{ key: 'r1', source: NEW_CONCEPT, target: `@draft:${a.suffix}`, relationship: 'relates', conditions: [] }],
    };
    const res = await submit(gh, session, draftProposal(b, alone(a, b)));
    expect(res.status).toBe(409);
    expect((await res.json()).waiting).toEqual([draftProposal(a, alone(a)).id]);
    // Once the first is submitted, the second goes through.
    await submit(gh, session, draftProposal(a, alone(a, b)));
    expect((await submit(gh, session, draftProposal(b, alone(a, b)))).status).toBe(201);
  });

  it('refuses one that does not fit the map, and a second copy of an open one', async () => {
    const gh = fakeGitHub();
    const session = await signIn(gh);
    const p = draftProposal(jeans(), alone(jeans()));
    const broken = { ...p, edges: [{ ...p.edges[0], target: 'nothing_here' }] };
    expect((await submit(gh, session, broken)).status).toBe(422);
    expect((await submit(gh, session, p)).status).toBe(201);
    expect((await submit(gh, session, p)).status).toBe(409);
  });

  it('an edit replaces the concept file and deletes the relations it removes', async () => {
    const gh = fakeGitHub();
    const session = await signIn(gh);
    const vlasov = concepts.nodes.find((n) => n.id === 'vlasov_equation')!;
    const d: Draft = { ...newEditDraft(vlasov, () => 0.75), generality: 6, removals: ['e62'] };
    expect((await submit(gh, session, draftProposal(d, alone(d)))).status).toBe(201);
    const tree = gh.writes.find((w) => w.path.endsWith('/git/trees'))!.body as { tree: { path: string; sha?: null }[] };
    expect(tree.tree).toContainEqual({ path: 'content/concepts/nodes/vlasov_equation.json', mode: '100644', type: 'blob', content: expect.any(String) });
    expect(tree.tree).toContainEqual({ path: 'content/concepts/edges/e62.json', mode: '100644', type: 'blob', sha: null });
  });
});

describe('the proposal inside a pull request description', () => {
  it('round-trips, even with "--" in the text', () => {
    const p = { ...draftProposal(jeans(), alone(jeans())), claim: 'a -- b --> c' };
    expect(decodeProposal(`Some text\n\n${encodeProposal(p)}`)).toEqual(p);
    expect(encodeProposal(p).slice(4, -3)).not.toContain('--');
  });
  it('is absent from an ordinary pull request', () => {
    expect(decodeProposal('Fix a typo')).toBeNull();
  });
});
