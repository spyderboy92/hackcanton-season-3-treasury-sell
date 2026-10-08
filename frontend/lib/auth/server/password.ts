/**
 * Password hashing and verification. SERVER ONLY (node:crypto).
 *
 * Format, shared with the Daml seed (`Tests.Fixtures.demoAccounts`):
 *
 *   scrypt$<N>$<r>$<p>$<salt, base64url>$<key, base64url>      keylen 32
 *
 * The ledger stores this as opaque text on a `UserAccount` that only the
 * operator can read; Daml never hashes or compares. Verification happens here,
 * after the server has read the account as the operator.
 *
 * The parameters travel with the hash so they can be raised later without
 * invalidating existing accounts — which is also why they are bounded on the
 * way in: a stored hash claiming N = 2^30 must not be able to pin the server.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const KEYLEN = 32;

/** Cost for new signups. Matches the seeded demo hashes. */
export const DEFAULT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

/** Refuse anything costlier than this; it would be a hash we never issued. */
const MAX_N = 1 << 20;
const MAX_R = 32;
const MAX_P = 16;

function scrypt(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEYLEN, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** Node's default 32 MiB ceiling is exactly 128·N·r for N=16384,r=8 — give headroom. */
function maxmem(N: number, r: number, p: number): number {
  return 128 * N * r * p + 64 * 1024 * 1024;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64url');
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

/** Null for anything that is not a well-formed, in-bounds scrypt hash. */
export function parseHash(encoded: string): ParsedHash | null {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [, n, r, p, salt, key] = parts as [string, string, string, string, string, string];
  if (![n, r, p].every((v) => /^[1-9]\d{0,9}$/.test(v))) return null;
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  // N must be a power of two greater than 1, or scrypt throws.
  if (N < 2 || N > MAX_N || (N & (N - 1)) !== 0 || R > MAX_R || P > MAX_P) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(salt) || !/^[A-Za-z0-9_-]+$/.test(key)) return null;
  const saltBuf = Buffer.from(salt, 'base64url');
  const keyBuf = Buffer.from(key, 'base64url');
  if (saltBuf.length < 8 || keyBuf.length !== KEYLEN) return null;
  return { N, r: R, p: P, salt: saltBuf, key: keyBuf };
}

/** A fresh hash with a random 16-byte salt, for a new signup. */
export async function hashPassword(password: string): Promise<string> {
  const { N, r, p } = DEFAULT_PARAMS;
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, { N, r, p, maxmem: maxmem(N, r, p) });
  return `scrypt$${N}$${r}$${p}$${base64url(salt)}$${base64url(key)}`;
}

/**
 * True only when `password` reproduces `encoded`. Malformed hashes are a plain
 * `false`, never a throw: a login must not distinguish "bad password" from
 * "corrupt account" to the caller.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parsed = parseHash(encoded);
  if (!parsed) return false;
  const { N, r, p, salt, key } = parsed;
  try {
    const derived = await scrypt(password, salt, { N, r, p, maxmem: maxmem(N, r, p) });
    return derived.length === key.length && timingSafeEqual(derived, key);
  } catch {
    return false;
  }
}

/**
 * A valid hash of nothing anyone knows. Verifying against it when the username
 * does not exist makes an unknown user cost the same scrypt as a known one, so
 * response time does not reveal which usernames are registered.
 */
const DECOY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export async function burnVerification(password: string): Promise<false> {
  await verifyPassword(password, DECOY_HASH);
  return false;
}
