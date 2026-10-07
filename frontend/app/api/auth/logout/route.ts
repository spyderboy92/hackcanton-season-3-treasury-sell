/**
 * POST /api/auth/logout — clear the session cookie.
 *
 * Sessions are stateless, so there is nothing to revoke server-side: dropping
 * the cookie is the whole of it. POST, not GET, so a link or an <img> on some
 * other page cannot sign a user out.
 */

import { NextResponse } from 'next/server';

import { clearSessionCookie } from '@/lib/auth/server/request';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response, request);
  return response;
}
