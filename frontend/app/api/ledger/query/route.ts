/**
 * POST /api/ledger/query — a party-scoped read of the active contract set.
 *
 * The body names the acting party and the templates wanted. The participant
 * computes the answer; this handler adds no filtering of its own, because a
 * filter here would be exactly the mistake the project exists to demonstrate
 * against.
 */

import { NextResponse } from 'next/server';

import { requireActingParty } from '@/lib/auth/server/request';
import { readDesk } from '@/lib/ledger/server/ledger';
import { errorResponse, readJson } from '@/lib/ledger/server/http';
import { parseQueryRequest } from '@/lib/ledger/server/validate';
import type { QueryResponse } from '@/lib/ledger/wire';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const query = parseQueryRequest(await readJson<unknown>(request));
    await requireActingParty(query.asParty);
    return NextResponse.json<QueryResponse>(await readDesk(query));
  } catch (cause) {
    return errorResponse(cause);
  }
}
