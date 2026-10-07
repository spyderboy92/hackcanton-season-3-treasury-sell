/**
 * POST /api/auth/login — `{ username, password }` → session cookie.
 *
 * Every failure that involves a credential says the same thing, "Invalid
 * username or password", and costs the same scrypt: an unknown username is
 * verified against a decoy hash. Neither the message nor the timing tells a
 * caller which usernames exist.
 */

import { NextResponse } from 'next/server';

import { homeFor } from '@/lib/auth/access';
import { accountStore } from '@/lib/auth/server/accounts';
import { burnVerification, verifyPassword } from '@/lib/auth/server/password';
import { clientAddress, recordFailure, recordSuccess, retryAfter } from '@/lib/auth/server/rate-limit';
import { setSessionCookie } from '@/lib/auth/server/request';
import { PASSWORD_MAX, normalizeUsername } from '@/lib/auth/validate';
import { errorResponse, readJson } from '@/lib/ledger/server/http';

export const dynamic = 'force-dynamic';

const INVALID = 'Invalid username or password.';

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown> | null>(request);
    const username = normalizeUsername(body?.username);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!username || !password) {
      return NextResponse.json(
        { error: { code: 'INVALID_ARGUMENT', message: 'Enter a username and a password.' } },
        { status: 400 },
      );
    }

    const ip = clientAddress(request);
    const wait = retryAfter(username, ip);
    if (wait > 0) {
      return NextResponse.json(
        { error: { code: 'NOT_AUTHORIZED', message: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} min.` } },
        { status: 429, headers: { 'retry-after': String(wait) } },
      );
    }

    const account = await accountStore().find(username);
    const ok =
      password.length <= PASSWORD_MAX && account
        ? await verifyPassword(password, account.passwordHash)
        : await burnVerification(password.slice(0, PASSWORD_MAX));

    if (!ok || !account) {
      recordFailure(username, ip);
      return NextResponse.json({ error: { code: 'NOT_AUTHORIZED', message: INVALID } }, { status: 401 });
    }

    recordSuccess(username, ip);
    const user = { username: account.username, userType: account.userType, seat: account.seat };
    const response = NextResponse.json({ user, home: homeFor(user) });
    await setSessionCookie(response, request, user);
    return response;
  } catch (cause) {
    return errorResponse(cause);
  }
}
