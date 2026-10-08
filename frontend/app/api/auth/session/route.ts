/**
 * GET /api/auth/session — who is signed in, if anyone.
 *
 * Always 200: "nobody" is an answer, not an error. Returns the account's seat
 * and home route, never a party id or the expiry-bearing token.
 */

import { NextResponse } from 'next/server';

import { homeFor } from '@/lib/auth/access';
import { currentSession } from '@/lib/auth/server/request';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ user: null });
  const user = { username: session.username, userType: session.userType, seat: session.seat };
  return NextResponse.json({ user, home: homeFor(user), expiresAt: new Date(session.exp * 1000).toISOString() });
}
