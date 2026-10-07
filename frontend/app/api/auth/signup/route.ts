/**
 * POST /api/auth/signup — create an account and sign it in.
 *
 * Body: `{ username, password, confirmPassword, userType, dealerDesk? }`.
 * Invalid input is a 400 with a message per field; a taken username is a 409.
 * On the canton backend the account is a `UserAccount` contract created through
 * `AccountDirectory.Register` as the operator — the ledger, not this handler,
 * is what makes the username unique (see `lib/auth/server/accounts.ts`).
 *
 * A new account binds to an EXISTING demo seat (Treasury, Dealer A/B/C,
 * Auditor). It does not allocate a new party: the RFQ in the fixture invites
 * three dealers, and a fourth party would have nothing to quote on.
 */

import { NextResponse } from 'next/server';

import { homeFor } from '@/lib/auth/access';
import { UsernameTakenError, accountStore } from '@/lib/auth/server/accounts';
import { hashPassword } from '@/lib/auth/server/password';
import { setSessionCookie } from '@/lib/auth/server/request';
import { validateSignup } from '@/lib/auth/validate';
import { errorResponse, readJson } from '@/lib/ledger/server/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const result = validateSignup(await readJson<unknown>(request));
    if (!result.ok) {
      return NextResponse.json(
        { error: { code: 'INVALID_ARGUMENT', message: 'Check the highlighted fields.', fields: result.fields } },
        { status: 400 },
      );
    }

    const { username, password, userType, seat } = result.value;
    const store = accountStore();
    // Cheap pre-check so a duplicate does not pay for a hash. The store's own
    // check (the ledger's, on canton) is the one that counts.
    if (await store.find(username)) return taken();

    const passwordHash = await hashPassword(password);
    const user = { username, userType, seat };
    await store.register({ ...user, passwordHash });

    const response = NextResponse.json({ user, home: homeFor(user) });
    await setSessionCookie(response, request, user);
    return response;
  } catch (cause) {
    if (cause instanceof UsernameTakenError) return taken();
    return errorResponse(cause);
  }
}

function taken() {
  return NextResponse.json(
    {
      error: {
        code: 'PRECONDITION_FAILED',
        message: 'Username is already taken.',
        fields: { username: 'Username is already taken.' },
      },
    },
    { status: 409 },
  );
}
