// Small Web Crypto helpers for the community backend. They run unchanged on
// Cloudflare and in Node (Vitest), with no dependency.

const enc = new TextEncoder();

export function base64url(bytes: ArrayBuffer | Uint8Array | string): string {
  const b = typeof bytes === 'string' ? enc.encode(bytes) : bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function fromBase64url(s: string): Uint8Array {
  const b = atob(s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export const randomToken = (bytes = 24): string => base64url(crypto.getRandomValues(new Uint8Array(bytes)));

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function hmacSign(secret: string, data: string): Promise<string> {
  return base64url(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data)));
}

export async function hmacVerify(secret: string, data: string, signature: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify('HMAC', await hmacKey(secret), fromBase64url(signature) as BufferSource, enc.encode(data));
  } catch {
    return false;
  }
}

/** DER length bytes. */
function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const out: number[] = [];
  for (let x = n; x > 0; x >>= 8) out.unshift(x & 0xff);
  return [0x80 | out.length, ...out];
}

const der = (tag: number, body: Uint8Array) => Uint8Array.from([tag, ...derLength(body.length), ...body]);

/**
 * GitHub hands out an App's private key as PKCS#1 ("BEGIN RSA PRIVATE KEY");
 * Web Crypto only imports PKCS#8. This wraps the one in the other, so the key
 * can be pasted into the secret exactly as downloaded.
 */
export function pemToPkcs8(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  if (!pem.includes('BEGIN RSA PRIVATE KEY')) return bytes;
  // PrivateKeyInfo ::= SEQUENCE { version 0, AlgorithmIdentifier rsaEncryption, OCTET STRING pkcs1 }
  const version = Uint8Array.from([0x02, 0x01, 0x00]);
  const algorithm = Uint8Array.from([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  const key = der(0x04, bytes);
  return der(0x30, Uint8Array.from([...version, ...algorithm, ...key]));
}

/** An RS256 JSON Web Token — what a GitHub App signs to ask for an installation token. */
export async function signJwt(payload: Record<string, unknown>, privateKeyPem: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKeyPem) as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const head = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${base64url(signature)}`;
}
