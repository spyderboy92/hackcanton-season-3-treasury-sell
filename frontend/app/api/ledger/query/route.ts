/**
 * POST /api/ledger/query — a party-scoped read of the active contract set.
 *
 * The body names the acting party and the templates wanted. The participant
 * computes the answer; this handler adds no filtering of its own, because a
 * filter here would be exactly the mistake the project exists to demonstrate
 * against.
 */

import { NextResponse } from 'next/server';

import { readDesk } from '@/lib/ledger/server/ledger';
import { errorResponse, readJson } from '@/lib/ledger/server/http';
import type { QueryRequest, QueryResponse } from '@/lib/ledger/wire';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await readJson<QueryRequest>(request);
    return NextResponse.json<QueryResponse>(await readDesk(body));
  } catch (cause) {
    return errorResponse(cause);
  }
}
