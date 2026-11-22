import { beforeEach, describe, expect, it } from 'vitest';
import { NEW_CONCEPT, draftProposal, draftUploads, newDraft, newEditDraft } from '../src/community/draft';
import type { Draft, DraftContext } from '../src/community/draft';
import type { Proposal } from '../src/community/types';
import { concepts } from '../src/data/loadConcepts';
import vocabulary from '../src/data/conceptVocabulary.json';
import { handle, resetCaches } from './api';
import type { Env } from './config';
import { base64url, fromBase64url, pemToPkcs8 } from './crypto';
import { decodeProposal, encodeProposal } from './proposalPr';
import { sealSession } from './session';
import type { D1Database, D1Statement } from './d1';

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
function fakeGitHub(
  invited: string[] = ['ada'],
  { issues = true, publishers = [] as string[], mapMakers = [] as string[], mergeStatus = 200, people = {} as Record<string, number> } = {},
) {
  const writes: { method: string; path: string; body: unknown }[] = [];
  const pulls: { number: number; html_url: string; title: string; body: string; created_at: string; user: { login: string }; pull_request: object; comments?: number }[] = [];
  const reviews = new Map<number, { user: { login: string }; state: string }[]>();
  let jwtSeen = '';
  const experts = {
    experts: invited.map((github) => ({
      github,
      name: 'Ada',
      verified: true,
      ...(publishers.includes(github) ? { publish: true } : {}),
      ...(mapMakers.includes(github) ? { maps: true } : {}),
    })),
  };
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
    if (path === `${r}/contents/src/data/conceptVocabulary.json`)
      return reply({ content: btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(vocabulary, null, 2)))) });
    if (path === `${r}/issues` && method === 'GET') return reply(pulls);
    const reviewList = /\/pulls\/(\d+)\/reviews$/.exec(path);
    if (reviewList && method === 'GET') return reply(reviews.get(Number(reviewList[1])) ?? []);
    const person = /^\/users\/([\w-]+)$/.exec(path);
    if (person) {
      const login = Object.keys(people).find((l) => l.toLowerCase() === person[1].toLowerCase());
      return login ? reply({ login, id: people[login], name: null }) : reply({ message: 'Not Found' }, 404);
    }
    if (path === `${r}/git/ref/heads/main`) return reply({ object: { sha: 'base-sha' } });
    if (path === `${r}/git/commits/base-sha`) return reply({ tree: { sha: 'base-tree' } });
    writes.push({ method, path, body });
    if (path === `${r}/git/trees`) return reply({ sha: 'new-tree' });
    if (path === `${r}/git/blobs`) return reply({ sha: `blob-${writes.filter((w) => w.path.endsWith('/git/blobs')).length}` });
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
    if (/\/pulls\/\d+\/merge$/.test(path) && method === 'PUT')
      return mergeStatus === 200 ? reply({ merged: true, sha: 'merge-sha' }) : reply({ message: 'Pull Request is not mergeable' }, mergeStatus);
    if (path === `${r}/issues` && method === 'POST')
      return issues
        ? reply({ number: 40, html_url: 'https://github.com/atlas-org/atlas-test/issues/40' }, 201)
        : reply({ message: 'Resource not accessible by integration' }, 403);
    return reply({ message: 'Not Found' }, 404);
  };
  return { fetchImpl, writes, pulls, reviews, jwt: () => jwtSeen };
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
  relations: [{ key: 'r1', source: NEW_CONCEPT, target: 'structure_formation', relationship: 'is a condition of' }],
});
const alone = (...drafts: Draft[]): DraftContext => ({ confirmed: concepts, drafts, proposals: [] });
const submit = (
  gh: ReturnType<typeof fakeGitHub>,
  session: string | undefined,
  proposal: Proposal,
  origin = ORIGIN,
  uploads?: { path: string; data: string }[],
  { publish = false, e = env }: { publish?: boolean; e?: Env } = {},
) =>
  call(
    gh,
    '/api/proposals',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, ...(session ? { cookie: session } : {}) },
      body: JSON.stringify({
        proposal,
        description: `# ${proposal.title}\n\nWhat it adds.`,
        ...(uploads ? { uploads } : {}),
        ...(publish ? { publish } : {}),
      }),
    },
    e,
  );

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
    expect(await res.json()).toEqual({ number: 12, url: 'https://github.com/atlas-org/atlas-test/pull/12', published: false });
    expect(gh.writes.some((w) => w.path.endsWith('/merge'))).toBe(false);
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

  it('decides itself who proposed it, and leaves the review to GitHub', async () => {
    const gh = fakeGitHub();
    const session = await signIn(gh);
    const forged = {
      ...draftProposal(jeans(), alone(jeans())),
      author: { name: 'Someone else', verified: true },
      state: 'changes' as const,
      review: { approvals: 99, changesRequested: 0, comments: 0 },
    };
    await submit(gh, session, forged);
    const stored = decodeProposal(gh.pulls[0].body)!;
    expect(stored.author).toEqual({ name: 'Ada L', handle: 'ada', verified: true });
    expect(stored.state).toBe('open');
    expect(stored.review).toBeUndefined();
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
      state: 'open',
      review: { approvals: 0, changesRequested: 0, comments: 0 },
    });
  });

  it("shows each pull request's review: latest verdict per reviewer, and its comments", async () => {
    const gh = fakeGitHub();
    const session = await signIn(gh);
    await submit(gh, session, draftProposal(jeans(), alone(jeans())));
    gh.pulls[0].comments = 2;
    gh.reviews.set(12, [
      { user: { login: 'bea' }, state: 'APPROVED' },
      { user: { login: 'cy' }, state: 'COMMENTED' },
      { user: { login: 'cy' }, state: 'CHANGES_REQUESTED' },
      { user: { login: 'bea' }, state: 'COMMENTED' },
    ]);
    resetCaches();
    const { proposals } = await (await call(gh, '/api/proposals')).json();
    expect(proposals[0].state).toBe('changes');
    expect(proposals[0].review).toEqual({ approvals: 1, changesRequested: 1, comments: 4 });
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
      relations: [{ key: 'r1', source: NEW_CONCEPT, target: `@draft:${a.suffix}`, relationship: 'relates' }],
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

describe('personal maps (Decision 50)', () => {
  it('are offered to experts marked "maps", once the maps database is bound', async () => {
    const gh = fakeGitHub(['ada'], { mapMakers: ['ada'] });
    const session = await signIn(gh);
    const me = (e: Env) => call(gh, '/api/me', { headers: { cookie: session } }, e).then((r) => r.json());
    expect(await me(env)).toMatchObject({ invited: true, canMakeMaps: false });
    expect(await me({ ...env, MAPS_DB: mapsDb() })).toMatchObject({ canMakeMaps: true, maps: true });
    resetCaches();
    const gh2 = fakeGitHub(['ada']);
    const session2 = await signIn(gh2);
    const me2 = await (await call(gh2, '/api/me', { headers: { cookie: session2 } }, { ...env, MAPS_DB: mapsDb() })).json();
    expect(me2).toMatchObject({ invited: true, canMakeMaps: false, maps: true });
  });
});

/**
 * The maps database: D1 is SQLite, so Node's built-in SQLite stands in for it
 * with the real schema (migrations/0001, 0002). Needs Node 22.13 or later.
 */
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): { get(...v: unknown[]): unknown; all(...v: unknown[]): unknown[]; run(...v: unknown[]): unknown };
}
// Node's own modules, by name: the server's TypeScript doesn't know Node's types.
const nodeModule = (name: string) => import(/* @vite-ignore */ name).catch(() => null);
const sqlite = (await nodeModule('node:sqlite')) as { DatabaseSync: new (path: string) => SqliteDb } | null;
const { readFileSync } = (await nodeModule('node:fs')) as { readFileSync: (path: URL, encoding: 'utf8') => string };
function mapsDb(): D1Database & { raw: SqliteDb } {
  const raw = new sqlite!.DatabaseSync(':memory:');
  for (const f of ['0001_personal_maps.sql', '0002_course_goals.sql']) raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  const statement = (sql: string, values: unknown[] = []): D1Statement & { exec: () => unknown } => {
    const args = () => values.map((v) => (v === undefined ? null : v));
    return {
      bind: (...v: unknown[]) => statement(sql, v),
      first: async <T,>() => (raw.prepare(sql).get(...args()) ?? null) as T | null,
      all: async <T,>() => ({ results: raw.prepare(sql).all(...args()) as T[] }),
      run: async () => ({ meta: { changes: Number((raw.prepare(sql).run(...args()) as { changes: number | bigint }).changes) } }),
      exec: () => raw.prepare(sql).run(...args()),
    };
  };
  return {
    raw,
    prepare: (sql) => statement(sql),
    batch: async (list) => {
      raw.exec('BEGIN');
      try {
        const out = list.map((s) => (s as ReturnType<typeof statement>).exec());
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

describe.skipIf(!sqlite)('saved personal maps (Decision 50, Phase 2)', () => {
  const people = { ada: 42, Bob: 43, cleo: 44 };
  const as = (login: string) => sealSession({ login, id: people[login as keyof typeof people], name: login }, env.SESSION_SECRET!).then((v) => `atlas_session=${encodeURIComponent(v)}`);
  async function setUp() {
    const gh = fakeGitHub(['ada'], { mapMakers: ['ada'], people });
    const db = mapsDb();
    const e = { ...env, MAPS_DB: db };
    const req = async (who: string | null, method: string, path: string, body?: unknown, origin = ORIGIN) =>
      call(
        gh,
        path,
        {
          method,
          headers: { origin, 'content-type': 'application/json', ...(who ? { cookie: await as(who) } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
        e,
      );
    const created = await (await req('ada', 'POST', '/api/maps', { title: 'Sample course map' })).json();
    return { db, req, id: created.id as string };
  }
  const ref = (id: string) => ({ kind: 'ref', id, body: {} });

  it('are created by those marked "maps", and seen only by their members', async () => {
    const { req, id } = await setUp();
    expect(id).toMatch(/^[\w-]{16}$/);
    expect((await (await req('ada', 'GET', '/api/maps')).json()).maps).toMatchObject([{ id, title: 'Sample course map', role: 'owner' }]);
    expect((await req('Bob', 'POST', '/api/maps', { title: 'Sample' })).status).toBe(403);
    expect((await req('Bob', 'GET', `/api/maps/${id}`)).status).toBe(404);
    expect((await (await req('Bob', 'GET', '/api/maps')).json()).maps).toEqual([]);
    expect((await req(null, 'GET', `/api/maps/${id}`)).status).toBe(401);
    expect((await req('ada', 'POST', '/api/maps', { title: 'Sample' }, 'https://elsewhere.example')).status).toBe(403);
  });

  it('take members by GitHub username; an editor saves, a viewer only reads, and the history keeps who did what', async () => {
    const { db, req, id } = await setUp();
    expect((await req('ada', 'POST', `/api/maps/${id}/members`, { login: '@bob', role: 'editor' })).status).toBe(200);
    expect((await req('ada', 'POST', `/api/maps/${id}/members`, { login: 'nobody-here', role: 'editor' })).status).toBe(404);
    const added = await (await req('ada', 'POST', `/api/maps/${id}/members`, { login: 'cleo', role: 'viewer' })).json();
    expect(added.members).toEqual([
      { login: 'ada', role: 'owner' },
      { login: 'Bob', role: 'editor' },
      { login: 'cleo', role: 'viewer' },
    ]);
    expect((await req('Bob', 'POST', `/api/maps/${id}/members`, { login: 'cleo', role: 'editor' })).status).toBe(403);
    const saved = await (await req('Bob', 'POST', `/api/maps/${id}/save`, { base: 0, changes: [ref('velocity_7r85'), ref('four_velocity')] })).json();
    expect(saved).toMatchObject({ revision: 1, role: 'editor', map: { refs: ['four_velocity', 'velocity_7r85'] } });
    expect((await req('cleo', 'POST', `/api/maps/${id}/save`, { base: 1, changes: [ref('force_q27c')] })).status).toBe(403);
    expect((await (await req('cleo', 'GET', `/api/maps/${id}`)).json()).map.refs).toEqual(['four_velocity', 'velocity_7r85']);
    expect(db.raw.prepare('SELECT revision, user_id, changed FROM map_revisions').all()).toEqual([
      { revision: 1, user_id: (db.raw.prepare('SELECT id FROM users WHERE github_id = 43').get() as { id: number }).id, changed: '["ref:velocity_7r85","ref:four_velocity"]' },
    ]);
  });

  it('never overwrite a newer save of the same item; saves of different items both stay', async () => {
    const { req, id } = await setUp();
    const node = (label: string) => ({ kind: 'node', id: 'sample_goal', body: { id: 'sample_goal', type: 'learning_goal', label, attrs: { description: 'Sample.' } } });
    expect((await req('ada', 'POST', `/api/maps/${id}/save`, { base: 0, changes: [node('Sample goal')] })).status).toBe(200);
    // Opened at revision 0: a different item is fine, the same one is a conflict.
    expect((await req('ada', 'POST', `/api/maps/${id}/save`, { base: 0, changes: [ref('velocity_7r85')] })).status).toBe(200);
    const clash = await req('ada', 'POST', `/api/maps/${id}/save`, { base: 0, changes: [node('Sample goal, renamed')] });
    expect(clash.status).toBe(409);
    expect(await clash.json()).toMatchObject({ conflicts: ['node:sample_goal'], current: { revision: 2, map: { nodes: [{ label: 'Sample goal' }] } } });
    expect((await req('ada', 'POST', `/api/maps/${id}/save`, { base: 2, changes: [node('Sample goal, renamed')], title: 'Sample, renamed' })).status).toBe(200);
    expect((await (await req('ada', 'GET', `/api/maps/${id}`)).json()).map).toMatchObject({ title: 'Sample, renamed', nodes: [{ label: 'Sample goal, renamed' }] });
  });

  it('refuse a save that does not fit the map, whole', async () => {
    const { req, id } = await setUp();
    const out = (changes: unknown[]) => req('ada', 'POST', `/api/maps/${id}/save`, { base: 0, changes });
    expect((await out([ref('no_such_concept')])).status).toBe(422);
    const dangling = await out([{ kind: 'edge', id: 'sample_e1', body: { id: 'sample_e1', source: 'velocity_7r85', target: 'four_velocity', relationship: 'relates' } }]);
    expect(dangling.status).toBe(422);
    expect((await dangling.json()).problems.join(' ')).toMatch(/isn't in the map/);
    expect((await out([{ kind: 'page', id: 'x', body: 'not depths' }])).status).toBe(400);
    expect((await out([ref('velocity_7r85'), ref('velocity_7r85')])).status).toBe(400);
    expect((await (await req('ada', 'GET', `/api/maps/${id}`)).json()).revision).toBe(0);
  });

  it('let the owner remove a member and anyone leave, but never remove the owner', async () => {
    const { req, id } = await setUp();
    await req('ada', 'POST', `/api/maps/${id}/members`, { login: 'bob', role: 'editor' });
    await req('ada', 'POST', `/api/maps/${id}/members`, { login: 'cleo', role: 'commenter' });
    expect((await req('Bob', 'DELETE', `/api/maps/${id}/members/cleo`)).status).toBe(403);
    expect((await req('Bob', 'DELETE', `/api/maps/${id}/members/ada`)).status).toBe(409);
    expect((await req('Bob', 'DELETE', `/api/maps/${id}/members/bob`)).status).toBe(204);
    expect((await req('Bob', 'GET', `/api/maps/${id}`)).status).toBe(404);
    expect((await (await req('ada', 'DELETE', `/api/maps/${id}/members/cleo`)).json()).members).toEqual([{ login: 'ada', role: 'owner' }]);
  });

  it('save course goals and the map’s own concepts, pages and relations (Phase 2)', async () => {
    const { req, id } = await setUp();
    const goal = { id: 'sample_goal_ab12', type: 'learning_goal', label: 'Sample goal', attrs: { description: 'Sample.' } };
    const edge = { id: 'sample_goal_ab12_e1', source: 'sample_goal_ab12', target: 'velocity_7r85', relationship: 'is a learning goal of' };
    const course = { id: 'goal_x1', name: 'Sample week 1', goals: ['sample_goal_ab12'], position: 1 };
    const saved = await (
      await req('ada', 'POST', `/api/maps/${id}/save`, {
        base: 0,
        changes: [ref('velocity_7r85'), { kind: 'node', id: goal.id, body: goal }, { kind: 'edge', id: edge.id, body: edge }, { kind: 'page', id: goal.id, body: ['Sample page.'] }, { kind: 'goal', id: course.id, body: course }],
      })
    ).json();
    expect(saved.map).toMatchObject({ nodes: [goal], edges: [edge], pages: { [goal.id]: ['Sample page.'] }, courseGoals: [course] });
    // A course goal without a name doesn't fit; a page of an atlas concept neither.
    expect((await req('ada', 'POST', `/api/maps/${id}/save`, { base: 1, changes: [{ kind: 'goal', id: 'goal_x2', body: { ...course, id: 'goal_x2', name: '' } }] })).status).toBe(422);
    expect((await req('ada', 'POST', `/api/maps/${id}/save`, { base: 1, changes: [{ kind: 'page', id: 'velocity_7r85', body: ['Sample.'] }] })).status).toBe(422);
  });

  it('hold comment threads on what the map has, for everyone but viewers (Phase 3)', async () => {
    const { req, id } = await setUp();
    await req('ada', 'POST', `/api/maps/${id}/members`, { login: 'bob', role: 'commenter' });
    await req('ada', 'POST', `/api/maps/${id}/members`, { login: 'cleo', role: 'viewer' });
    await req('ada', 'POST', `/api/maps/${id}/save`, { base: 0, changes: [ref('velocity_7r85'), ref('four_velocity')] });
    const comments = `/api/maps/${id}/comments`;
    const started = await (await req('Bob', 'POST', comments, { anchor: 'node:velocity_7r85', body: 'Sample question?' })).json();
    expect(started.comments).toMatchObject([{ threadId: null, anchor: 'node:velocity_7r85', author: 'Bob', body: 'Sample question?', resolvedAt: null }]);
    const thread = started.comments[0].id as string;
    // Not on the map, not an anchor, no words, a viewer: refused.
    expect((await req('Bob', 'POST', comments, { anchor: 'node:force_q27c', body: 'Sample.' })).status).toBe(422);
    expect((await req('Bob', 'POST', comments, { anchor: 'somewhere', body: 'Sample.' })).status).toBe(422);
    expect((await req('Bob', 'POST', comments, { anchor: 'map', body: '  ' })).status).toBe(422);
    expect((await req('cleo', 'GET', comments)).status).toBe(403);
    expect((await req('cleo', 'POST', comments, { anchor: 'map', body: 'Sample.' })).status).toBe(403);
    expect((await req(null, 'GET', comments)).status).toBe(401);

    await req('ada', 'POST', `${comments}/${thread}/resolve`, { resolved: true });
    let list = (await (await req('Bob', 'GET', comments)).json()).comments;
    expect(list[0]).toMatchObject({ resolvedBy: 'ada' });
    // A reply takes the thread's anchor and reopens it.
    list = (await (await req('Bob', 'POST', comments, { thread, anchor: 'map', body: 'Sample reply.' })).json()).comments;
    expect(list).toMatchObject([{ id: thread, resolvedAt: null }, { threadId: thread, anchor: 'node:velocity_7r85', body: 'Sample reply.' }]);

    // Bob may delete his reply, not his thread once ada replied; ada (owner) may delete the thread, replies with it.
    await req('ada', 'POST', comments, { thread, body: 'Sample answer.' });
    list = (await (await req('Bob', 'GET', comments)).json()).comments;
    expect((await req('Bob', 'DELETE', `${comments}/${list[2].id}`)).status).toBe(403);
    expect((await req('Bob', 'DELETE', `${comments}/${list[1].id}`)).status).toBe(200);
    expect((await req('Bob', 'DELETE', `${comments}/${thread}`)).status).toBe(409);
    expect((await (await req('ada', 'DELETE', `${comments}/${thread}`)).json()).comments).toEqual([]);
    expect((await req('ada', 'POST', `${comments}/${thread}/resolve`, { resolved: false })).status).toBe(404);

    const relation = await req('ada', 'POST', comments, { anchor: 'page:four_velocity:2', body: 'Sample.' });
    expect((await relation.json()).comments[0].anchor).toBe('page:four_velocity:2');
  });
});

describe('publishing directly (Decision 43)', () => {
  const publishNow = (gh: ReturnType<typeof fakeGitHub>, session: string, p: Proposal, e = env) =>
    submit(gh, session, p, ORIGIN, undefined, { publish: true, e });

  it('is offered to experts marked "publish", unless it is switched off', async () => {
    const gh = fakeGitHub(['ada'], { publishers: ['ada'] });
    const session = await signIn(gh);
    expect(await (await call(gh, '/api/me', { headers: { cookie: session } })).json()).toMatchObject({ invited: true, canPublish: true });
    const off = { ...env, DIRECT_PUBLISH: 'off' };
    expect(await (await call(gh, '/api/me', { headers: { cookie: session } }, off)).json()).toMatchObject({ canPublish: false });
    resetCaches();
    const gh2 = fakeGitHub(['ada']);
    const session2 = await signIn(gh2);
    expect(await (await call(gh2, '/api/me', { headers: { cookie: session2 } })).json()).toMatchObject({ invited: true, canPublish: false });
  });

  it('opens the pull request and merges it at once, saying so in its description', async () => {
    const gh = fakeGitHub(['ada'], { publishers: ['ada'] });
    const session = await signIn(gh);
    const res = await publishNow(gh, session, draftProposal(jeans(), alone(jeans())));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ number: 12, url: 'https://github.com/atlas-org/atlas-test/pull/12', published: true });
    const merge = gh.writes.find((w) => w.path === '/repos/atlas-org/atlas-test/pulls/12/merge')!;
    expect(merge).toMatchObject({ method: 'PUT', body: { merge_method: 'merge' } });
    expect(gh.pulls[0].body).toContain('They published it directly');
  });

  it('refuses it to everyone else, and to everyone when switched off — nothing is written', async () => {
    const gh = fakeGitHub(['ada']);
    const session = await signIn(gh);
    const p = draftProposal(jeans(), alone(jeans()));
    expect((await publishNow(gh, session, p)).status).toBe(403);
    resetCaches();
    const gh2 = fakeGitHub(['ada'], { publishers: ['ada'] });
    const session2 = await signIn(gh2);
    expect((await publishNow(gh2, session2, p, { ...env, DIRECT_PUBLISH: 'off' })).status).toBe(403);
    expect([...gh.writes, ...gh2.writes]).toEqual([]);
  });

  it('refuses one that depends on an open proposal: main would point at a concept that is only proposed', async () => {
    const gh = fakeGitHub(['ada'], { publishers: ['ada'] });
    const session = await signIn(gh);
    const a = jeans();
    const b: Draft = {
      ...newDraft(() => 0.25),
      label: 'Jeans mass',
      type: 'property',
      description: 'Sample.',
      relations: [{ key: 'r1', source: NEW_CONCEPT, target: `@draft:${a.suffix}`, relationship: 'relates' }],
    };
    await submit(gh, session, draftProposal(a, alone(a, b)));
    const res = await publishNow(gh, session, draftProposal(b, alone(a, b)));
    expect(res.status).toBe(409);
    expect((await res.json()).waiting).toEqual([draftProposal(a, alone(a)).id]);
    expect((await submit(gh, session, draftProposal(b, alone(a, b)))).status).toBe(201);
  });

  it('leaves the pull request open for review when GitHub will not merge it', async () => {
    const gh = fakeGitHub(['ada'], { publishers: ['ada'], mergeStatus: 405 });
    const session = await signIn(gh);
    const res = await publishNow(gh, session, draftProposal(jeans(), alone(jeans())));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ number: 12, published: false });
    const { proposals } = await (await call(gh, '/api/proposals')).json();
    expect(proposals).toHaveLength(1);
  });
});

describe('sending feedback', () => {
  const feedback = { kind: 'idea', title: 'Sample title', message: 'Sample: ping @someone.', page: '/?mode=concepts' };
  const send = (gh: ReturnType<typeof fakeGitHub>, session: string | undefined, body: unknown = feedback, origin = ORIGIN) =>
    call(gh, '/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, ...(session ? { cookie: session } : {}) },
      body: JSON.stringify(body),
    });

  it('opens a labelled issue for anyone signed in — no invitation needed', async () => {
    const gh = fakeGitHub([]);
    const session = await signIn(gh);
    const res = await send(gh, session);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ number: 40, url: 'https://github.com/atlas-org/atlas-test/issues/40' });
    const issue = gh.writes.find((w) => w.path === '/repos/atlas-org/atlas-test/issues')!.body as { title: string; body: string; labels: string[] };
    expect(issue.labels).toEqual(['feedback', 'feedback: idea']);
    expect(issue.body).toContain('@ada');
    expect(issue.body).not.toContain('@someone');
  });

  it('refuses it signed out, from another site, or incomplete', async () => {
    const gh = fakeGitHub();
    expect((await send(gh, undefined)).status).toBe(401);
    const session = await signIn(gh);
    expect((await send(gh, session, feedback, 'https://evil.example')).status).toBe(403);
    const res = await send(gh, session, { ...feedback, message: '' });
    expect(res.status).toBe(422);
    expect((await res.json()).problems).toHaveLength(1);
    expect(gh.writes.filter((w) => w.path.endsWith('/issues'))).toEqual([]);
  });

  it('slows down one person sending a lot', async () => {
    const gh = fakeGitHub();
    const session = await signIn(gh);
    for (let i = 0; i < 5; i++) expect((await send(gh, session)).status).toBe(201);
    expect((await send(gh, session)).status).toBe(429);
  });

  it('says so when the App may not open issues yet', async () => {
    const gh = fakeGitHub(['ada'], { issues: false });
    const session = await signIn(gh);
    const res = await send(gh, session);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/not allowed to open issues/);
  });
});

describe('pictures and new relation types in a submission', () => {
  const PNG = `data:image/png;base64,${btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0))}`;
  const pictured = (): Draft => ({
    ...jeans(),
    figures: [{ key: 'f1', data: PNG, name: 'sample.png', alt: 'Sample', caption: '', credit: 'Sample, CC BY 4.0' }],
  });

  it('writes a new picture as a blob of its own, and keeps it out of the description', async () => {
    const gh = fakeGitHub();
    const session = await signIn(gh);
    const d = pictured();
    const p = draftProposal(d, alone(d));
    expect((await submit(gh, session, p, ORIGIN, draftUploads(d))).status).toBe(201);
    const blob = gh.writes.find((w) => w.path.endsWith('/git/blobs'))!.body as { encoding: string };
    expect(blob.encoding).toBe('base64');
    const tree = gh.writes.find((w) => w.path.endsWith('/git/trees'))!.body as { tree: { path: string; sha?: string }[] };
    expect(tree.tree.find((t) => t.path.startsWith('content/media/'))?.sha).toBe('blob-1');
    expect(gh.pulls[0].body).not.toContain(PNG.slice(30));
  });

  it("refuses a picture that isn't sent, isn't the proposal's, or isn't what it says", async () => {
    const gh = fakeGitHub();
    const session = await signIn(gh);
    const d = pictured();
    const p = draftProposal(d, alone(d));
    expect((await submit(gh, session, p, ORIGIN, [])).status).toBe(422);
    const [u] = draftUploads(d);
    expect((await submit(gh, session, p, ORIGIN, [u, { ...u, path: 'src/App.tsx' }])).status).toBe(422);
    expect((await submit(gh, session, p, ORIGIN, [{ ...u, data: btoa('<svg onload=alert(1)>') }])).status).toBe(422);
  });

  it('adds a new relation type to the vocabulary in the same pull request', async () => {
    const gh = fakeGitHub();
    const session = await signIn(gh);
    const d = jeans();
    d.relations[0] = { ...d.relations[0], relationship: 'is a sample limit of', newCategory: 'derivation' };
    expect((await submit(gh, session, draftProposal(d, alone(d)))).status).toBe(201);
    const tree = gh.writes.find((w) => w.path.endsWith('/git/trees'))!.body as { tree: { path: string; content?: string }[] };
    const vocab = tree.tree.find((t) => t.path === 'src/data/conceptVocabulary.json');
    expect(JSON.parse(vocab!.content!).edgeTemplates['is a sample limit of']).toBe('{s} is a sample limit of {t}.');
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
