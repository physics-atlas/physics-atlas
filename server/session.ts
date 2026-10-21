import { base64url, fromBase64url, hmacSign, hmacVerify } from './crypto';

// Who is signed in: a small signed cookie, not a server-side store. It holds
// the GitHub identity only — the user's GitHub token is used once at sign-in
// to read their profile and then thrown away.

export interface SessionUser {
  /** GitHub login (handle) */
  login: string;
  /** GitHub numeric id — for the noreply commit e-mail */
  id: number;
  name: string;
  avatar?: string;
}

interface SessionBody extends SessionUser {
  /** Expiry, seconds since the epoch */
  exp: number;
}

export const SESSION_COOKIE = 'atlas_session';
export const STATE_COOKIE = 'atlas_oauth_state';
/** A week; signing in again is one click. */
export const SESSION_SECONDS = 7 * 24 * 3600;

const dec = new TextDecoder();

export async function sealSession(user: SessionUser, secret: string, now = Date.now()): Promise<string> {
  const body = base64url(JSON.stringify({ ...user, exp: Math.floor(now / 1000) + SESSION_SECONDS } satisfies SessionBody));
  return `${body}.${await hmacSign(secret, body)}`;
}

export async function openSession(value: string | undefined, secret: string, now = Date.now()): Promise<SessionUser | null> {
  if (!value) return null;
  const [body, signature] = value.split('.');
  if (!body || !signature || !(await hmacVerify(secret, body, signature))) return null;
  try {
    const s = JSON.parse(dec.decode(fromBase64url(body))) as SessionBody;
    if (typeof s.login !== 'string' || typeof s.id !== 'number' || s.exp * 1000 < now) return null;
    return { login: s.login, id: s.id, name: s.name, avatar: s.avatar };
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** HttpOnly, Secure, SameSite=Lax — a cross-site form or script can't use it to submit. */
export function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
