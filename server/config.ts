// The backend's settings, from Cloudflare environment variables / secrets.
// See docs/COMMUNITY-BACKEND-SETUP.md for how to create each one.
import type { D1Database } from './d1';

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
  /** "off" turns direct publishing off for everyone, whatever community/experts.json says */
  DIRECT_PUBLISH?: string;
  /**
   * The personal maps' D1 database (Decision 50), bound in wrangler.jsonc as "MAPS_DB".
   * Optional: until it's created and bound, personal maps are simply not offered.
   */
  MAPS_DB?: D1Database;
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
  /** Experts marked "publish" may merge their proposal at once (Decision 43) */
  directPublish: boolean;
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
    directPublish: env.DIRECT_PUBLISH?.trim().toLowerCase() !== 'off',
  };
}
