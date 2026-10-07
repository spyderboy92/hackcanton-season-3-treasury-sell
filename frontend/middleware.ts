/**
 * Page-level access: who gets which screen.
 *
 *   no session          pages → /login?next=<path>      /api/* → 401 JSON
 *   session, wrong desk pages → the user's own desk
 *   session on /login or /signup → the user's own desk
 *
 * This is routing, not the privacy boundary. A page shell shows nothing
 * without data, and the data comes through `/api/ledger/*`, whose handlers
 * check the session against `asParty` themselves (lib/auth/server/policy.ts).
 * The redirects keep honest users on the desk they own; the handlers stop the
 * dishonest ones.
 *
 * Runs on the Node.js runtime rather than the edge: the session cookie is
 * HMAC-signed, and when `SESSION_SECRET` is unset the fallback secret is
 * generated per process and parked in `process.env`. Only a middleware in the
 * same process as the route handlers can see it (lib/auth/server/session.ts).
 * The verification code itself is Web Crypto only, so moving back to the edge
 * is a one-line change once a secret is always configured.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { canOpen, homeFor } from '@/lib/auth/access';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/server/session';

/** Reachable without a session. Everything else needs one. */
const PUBLIC_PAGES = new Set(['/login', '/signup']);

/**
 * A 307 to `location` on the host the BROWSER used. `NextResponse.redirect`
 * needs an absolute URL (a relative `Location` throws "Invalid URL" inside the
 * standalone server), and `request.url` behind the standalone server in Docker
 * carries the bind address (`HOSTNAME=0.0.0.0`) rather than the host the
 * browser asked for. The `Host` header is what the browser asked for, so the
 * redirect lands on the same origin and the session cookie keeps being sent.
 * Spoofing `Host` only redirects the spoofer to themselves.
 */
function redirectTo(request: NextRequest, location: string): NextResponse {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto =
    request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(/:$/, '');
  const base = host ? `${proto}://${host}` : request.nextUrl.origin;
  return NextResponse.redirect(new URL(location, base), 307);
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/api/auth/')) return NextResponse.next();

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith('/api/')) {
    if (session) return NextResponse.next();
    return NextResponse.json(
      { error: { code: 'NOT_AUTHORIZED', message: 'Sign in to use the ledger.' } },
      { status: 401 },
    );
  }

  if (PUBLIC_PAGES.has(pathname)) {
    return session ? redirectTo(request, homeFor(session)) : NextResponse.next();
  }

  if (!session) {
    const next = pathname === '/' ? '' : `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    const response = redirectTo(request, `/login${next}`);
    // A cookie that failed verification (tampered, expired, signed by a
    // previous process's secret) is dropped so the browser stops sending it.
    if (request.cookies.has(SESSION_COOKIE)) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (!canOpen(session, pathname)) {
    return redirectTo(request, homeFor(session));
  }

  return NextResponse.next();
}

export const config = {
  runtime: 'nodejs',
  // Static assets and Next internals never need a session. Everything else —
  // pages and every API route — goes through the function above.
  matcher: ['/((?!_next/static|_next/image|_next/data|favicon\\.ico|robots\\.txt).*)'],
};
