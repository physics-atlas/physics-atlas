// The backend's settings, from Cloudflare environment variables / secrets.
// See docs/COMMUNITY-BACKEND-SETUP.md for how to create each one.

export interface Env {
  /** "owner/name" of the repository proposals go to — a test repository while trying it out */
  GITHUB_REPO?: string;
  /** Branch proposals start from and are merged into (default "main") */
  GITHUB_BASE?: string;
  /** The GitHub App: its id, private key (PEM, as downloaded), and OAuth client id and secret */
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** A long random string that signs the session cookie */
  SESSION_SECRET?: string;
  /** Extra invited GitHub handles, comma-separated, on top of community/experts.json */
  ALLOWED_PROPOSERS?: string;
}

export interface Config {
  owner: string;
  repo: string;
  base: string;
  appId: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  extraProposers: string[];
}

const REQUIRED = [
  'GITHUB_REPO',
  'GITHUB_APP_ID',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'SESSION_SECRET',
] as const;

/** The settings, or the names of the ones still missing. */
export function readConfig(env: Env): Config | { missing: string[] } {
  const missing = REQUIRED.filter((k) => !env[k]?.trim());
  const [owner, repo] = (env.GITHUB_REPO ?? '').split('/');
  if (!missing.length && (!owner || !repo)) missing.push('GITHUB_REPO');
  if (missing.length) return { missing };
  return {
    owner,
    repo,
    base: env.GITHUB_BASE?.trim() || 'main',
    appId: env.GITHUB_APP_ID!.trim(),
    // Secrets pasted through some UIs arrive with literal "\n".
    privateKey: env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    clientId: env.GITHUB_CLIENT_ID!.trim(),
    clientSecret: env.GITHUB_CLIENT_SECRET!.trim(),
    sessionSecret: env.SESSION_SECRET!,
    extraProposers: (env.ALLOWED_PROPOSERS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  };
}
