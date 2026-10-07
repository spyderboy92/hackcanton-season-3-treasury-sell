/**
 * Stateless signed session cookie. SERVER ONLY by convention (it holds the
 * signing secret), but written against Web Crypto alone — no `node:` imports —
 * so the same code verifies in `middleware.ts`, in route handlers and in server
 * components without caring which runtime it is on.
 *
 * Token: `<base64url(JSON payload)>.<base64url(HMAC-SHA256(payload part))>`.
 *
 * The payload is `{ username, userType, seat, exp }` and deliberately NOT a party
 * id. Party ids change with every fresh sandbox (`<hint>-<n>::<fingerprint>`);
 * the seat is resolved to the participant's current party at request time, so a
 * re-seeded ledger does not strand every signed-in user on a dead id. There is
 * no server-side session table: logout clears the cookie, and the 8-hour expiry
 * bounds a cookie copied before that.
 */

import { seatMatches, isUserType, type SessionUser } from '../access';

export const SESSION_COOKIE = 'rfq_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface Session extends SessionUser {
  /** Expiry, seconds since the epoch. */
  exp: number;
}

/* ── secret ───────────────────────────────────────────────────────────── */

/**
 * The HMAC secret.
 *
 * `SESSION_SECRET` when set. Otherwise a random secret generated once per
 * server PROCESS and parked in `process.env`, with a one-time warning. Parking
 * it in the process environment is what lets the middleware and the route
 * handlers agree: they are separately bundled module graphs, so a module-level
 * variable would be two different secrets, but `middleware.ts` runs on the
 * Node.js runtime (see its `config`) in the same process as the handlers and
 * reads the same `process.env`. The cost of the fallback is that every restart
 * signs everyone out — acceptable on a laptop, and the reason Docker and any
 * shared deployment should set `SESSION_SECRET`.
 */
const EPHEMERAL_KEY = 'RFQ_SESSION_SECRET_EPHEMERAL';

export function sessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) {
    if (configured.length < 32 && !warned.short) {
      warned.short = true;
      console.warn('[auth] SESSION_SECRET is shorter than 32 characters; use a long random value.');
    }
    return configured;
  }
  let ephemeral = process.env[EPHEMERAL_KEY];
  if (!ephemeral) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    ephemeral = toBase64url(bytes);
    process.env[EPHEMERAL_KEY] = ephemeral;
    console.warn(
      '[auth] SESSION_SECRET is not set: signing sessions with a random per-process secret. ' +
        'Every restart signs all users out. Set SESSION_SECRET (32+ random chars) for anything shared.',
    );
  }
  return ephemeral;
}

const warned = { short: false };

/* ── encoding ─────────────────────────────────────────────────────────── */

function toBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
    const out = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    // Canonical encodings only. The last character of an unpadded group
    // carries spare bits that `atob` ignores, so several spellings decode to
    // the same bytes; accepting them would make one session token have many
    // valid forms.
    return toBase64url(out) === text ? out : null;
  } catch {
    return null;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

/* ── sign / verify ────────────────────────────────────────────────────── */

export interface SessionOptions {
  /** Override the secret (tests). */
  secret?: string;
  /** "Now", in milliseconds (tests). */
  now?: number;
}

/** A signed token for `user`, valid for `SESSION_TTL_SECONDS` from now. */
export async function signSession(
  user: SessionUser,
  options: SessionOptions & { ttlSeconds?: number } = {},
): Promise<{ token: string; session: Session }> {
  const now = options.now ?? Date.now();
  const session: Session = {
    username: user.username,
    userType: user.userType,
    seat: user.seat,
    exp: Math.floor(now / 1000) + (options.ttlSeconds ?? SESSION_TTL_SECONDS),
  };
  const body = toBase64url(encoder.encode(JSON.stringify(session)));
  const key = await hmacKey(options.secret ?? sessionSecret());
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return { token: `${body}.${toBase64url(mac)}`, session };
}

/**
 * The session in `token`, or null if it is missing, malformed, tampered with,
 * expired, or internally inconsistent. `crypto.subtle.verify` compares in
 * constant time, so a forged MAC learns nothing from timing.
 */
export async function verifySession(
  token: string | undefined | null,
  options: SessionOptions = {},
): Promise<Session | null> {
  if (!token || token.length > 4096) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const body = token.slice(0, dot);
  const mac = fromBase64url(token.slice(dot + 1));
  if (!mac) return null;

  const key = await hmacKey(options.secret ?? sessionSecret());
  const valid = await crypto.subtle.verify('HMAC', key, mac, encoder.encode(body));
  if (!valid) return null;

  const raw = fromBase64url(body);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(raw));
  } catch {
    return null;
  }
  const s = parsed as Partial<Session> | null;
  if (
    !s ||
    typeof s.username !== 'string' ||
    !isUserType(s.userType) ||
    typeof s.seat !== 'string' ||
    !seatMatches(s.userType, s.seat) ||
    typeof s.exp !== 'number'
  ) {
    return null;
  }
  const now = options.now ?? Date.now();
  if (s.exp * 1000 <= now) return null;
  return { username: s.username, userType: s.userType, seat: s.seat, exp: s.exp };
}

/** `Set-Cookie` attributes. `Secure` only over HTTPS so loopback http still works. */
export function sessionCookieOptions(secure: boolean, maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure,
    maxAge,
  };
}

/** Whether the request reached us over HTTPS (directly or via a proxy that says so). */
export function isHttps(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwarded) return forwarded === 'https';
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}
