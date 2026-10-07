/**
 * Session access for route handlers and server components. SERVER ONLY.
 *
 * Kept apart from `session.ts` because this file touches `next/headers` and
 * `next/server`, while `session.ts` stays framework-free so it can be unit
 * tested under plain Node.
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import type { Party } from '../../ledger/types';
import { resolveDemoParties } from '../../ledger/server/parties';
import type { SessionUser } from '../access';
import { AuthError, assertMayActAs } from './policy';
import {
  SESSION_COOKIE,
  isHttps,
  sessionCookieOptions,
  signSession,
  verifySession,
  type Session,
} from './session';

/** The verified session on this request, or null. */
export async function currentSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

/** The verified session, or a 401. */
export async function requireSession(): Promise<Session> {
  const session = await currentSession();
  if (!session) throw new AuthError(401, 'Sign in to use the ledger.');
  return session;
}

/**
 * The privacy gate every `asParty` passes through: a 401 without a session, a
 * 403 if the session may not act as `asParty`. Seats resolve to the
 * participant's CURRENT party ids, so the check follows a re-seeded ledger.
 */
export async function requireActingParty(asParty: Party): Promise<Session> {
  const session = await requireSession();
  const { ids } = await resolveDemoParties();
  assertMayActAs(session, ids, asParty);
  return session;
}

/** Sign `user` in on `response`. */
export async function setSessionCookie(response: NextResponse, request: Request, user: SessionUser): Promise<Session> {
  const { token, session } = await signSession(user);
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(isHttps(request)));
  return session;
}

export function clearSessionCookie(response: NextResponse, request: Request): void {
  response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(isHttps(request), 0));
}
