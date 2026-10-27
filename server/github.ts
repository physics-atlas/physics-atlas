import type { Config } from './config';
import { signJwt } from './crypto';

// The GitHub calls the backend makes. Two identities:
// - the GitHub App's installation token writes to the repository (branches,
//   commits, pull requests, feedback issues) — proposers need no access of their own;
// - a proposer's own token is used once, at sign-in, to read who they are.

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const API = 'https://api.github.com';

export class GitHubError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** GitHub turned down the sign-in code; `code` is GitHub's own reason, e.g. "bad_verification_code". */
export class SignInError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`GitHub sign-in failed: ${code}`);
    this.code = code;
  }
}

export interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
  avatar_url?: string;
}

export interface PullRequestSummary {
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  created_at: string;
  user: { login: string } | null;
}

export interface FileChange {
  path: string;
  /** null deletes the file */
  content: string | null;
}

export class GitHub {
  private readonly config: Config;
  private readonly fetch: Fetch;
  private installationToken: { token: string; expires: number } | null = null;

  constructor(config: Config, fetchImpl: Fetch) {
    this.config = config;
    // Called as a plain function: Cloudflare's fetch throws "Illegal invocation" as a method.
    this.fetch = (input, init) => fetchImpl(input, init);
  }

  private async call<T>(path: string, init: RequestInit & { token: string }): Promise<T> {
    const { token, ...rest } = init;
    const res = await this.fetch(path.startsWith('http') ? path : `${API}${path}`, {
      ...rest,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'physics-atlas',
        ...(rest.body ? { 'content-type': 'application/json' } : {}),
      },
    });
    if (!res.ok) throw new GitHubError(res.status, `GitHub ${rest.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  /** The App's token for this repository, reused until a minute before it expires. */
  async appToken(now = Date.now()): Promise<string> {
    if (this.installationToken && this.installationToken.expires - 60_000 > now) return this.installationToken.token;
    const iat = Math.floor(now / 1000) - 60;
    const jwt = await signJwt({ iat, exp: iat + 540, iss: this.config.appId }, this.config.privateKey);
    const { owner, repo } = this.config;
    const installation = await this.call<{ id: number }>(`/repos/${owner}/${repo}/installation`, { token: jwt });
    const t = await this.call<{ token: string; expires_at: string }>(`/app/installations/${installation.id}/access_tokens`, {
      token: jwt,
      method: 'POST',
    });
    this.installationToken = { token: t.token, expires: Date.parse(t.expires_at) };
    return t.token;
  }

  /** Sign-in: trades the code GitHub sent back for the user, and discards their token. */
  async userFromCode(code: string, redirectUri: string): Promise<GitHubUser> {
    const res = await this.fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'physics-atlas' },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const t = (await res.json()) as { access_token?: string; error?: string };
    if (!t.access_token) throw new SignInError(t.error ?? `http_${res.status}`);
    return this.call<GitHubUser>('/user', { token: t.access_token });
  }

  /** A text file from the base branch, or null if it isn't there. */
  async readFile(path: string): Promise<string | null> {
    const { owner, repo, base } = this.config;
    try {
      const f = await this.call<{ content: string }>(`/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(base)}`, {
        token: await this.appToken(),
      });
      return new TextDecoder().decode(Uint8Array.from(atob(f.content.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return null;
      throw e;
    }
  }

  /** Open pull requests carrying `label` (the issues API filters by label; pulls doesn't). */
  async openPullRequests(label: string): Promise<PullRequestSummary[]> {
    const { owner, repo } = this.config;
    const issues = await this.call<(PullRequestSummary & { pull_request?: unknown })[]>(
      `/repos/${owner}/${repo}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100`,
      { token: await this.appToken() },
    );
    return issues.filter((i) => i.pull_request);
  }

  /** An issue in the repository, opened by the App (feedback from the site). */
  async openIssue(p: { title: string; body: string; labels: string[] }): Promise<{ number: number; url: string }> {
    const { owner, repo } = this.config;
    const issue = await this.call<{ number: number; html_url: string }>(`/repos/${owner}/${repo}/issues`, {
      token: await this.appToken(),
      method: 'POST',
      body: JSON.stringify(p),
    });
    return { number: issue.number, url: issue.html_url };
  }

  /**
   * One commit on a new branch from the base, with these files added,
   * replaced or deleted, authored by the proposer; then the pull request.
   */
  async openPullRequest(p: {
    branch: string;
    files: FileChange[];
    message: string;
    author: { name: string; email: string };
    title: string;
    body: string;
    labels: string[];
  }): Promise<{ number: number; url: string }> {
    const { owner, repo, base } = this.config;
    const token = await this.appToken();
    const r = `/repos/${owner}/${repo}`;
    const head = await this.call<{ object: { sha: string } }>(`${r}/git/ref/heads/${encodeURIComponent(base)}`, { token });
    const parent = await this.call<{ tree: { sha: string } }>(`${r}/git/commits/${head.object.sha}`, { token });
    const tree = await this.call<{ sha: string }>(`${r}/git/trees`, {
      token,
      method: 'POST',
      body: JSON.stringify({
        base_tree: parent.tree.sha,
        tree: p.files.map((f) =>
          f.content === null
            ? { path: f.path, mode: '100644', type: 'blob', sha: null }
            : { path: f.path, mode: '100644', type: 'blob', content: f.content },
        ),
      }),
    });
    const commit = await this.call<{ sha: string }>(`${r}/git/commits`, {
      token,
      method: 'POST',
      body: JSON.stringify({ message: p.message, tree: tree.sha, parents: [head.object.sha], author: p.author }),
    });
    await this.call(`${r}/git/refs`, {
      token,
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${p.branch}`, sha: commit.sha }),
    });
    const pr = await this.call<{ number: number; html_url: string }>(`${r}/pulls`, {
      token,
      method: 'POST',
      body: JSON.stringify({ title: p.title, head: p.branch, base, body: p.body, maintainer_can_modify: true }),
    });
    await this.call(`${r}/issues/${pr.number}/labels`, { token, method: 'POST', body: JSON.stringify({ labels: p.labels }) });
    return { number: pr.number, url: pr.html_url };
  }
}
