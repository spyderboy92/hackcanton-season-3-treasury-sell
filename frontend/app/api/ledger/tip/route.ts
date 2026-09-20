/**
 * GET /api/ledger/tip — the participant's current ledger end.
 *
 * This is what `subscribe()` polls: one small integer, so a desk left open all
 * afternoon costs the participant a cheap offset read every second and a half
 * rather than a repeated ACS query.
 */

import { NextResponse } from 'next/server';

import { ledgerEnd } from '@/lib/ledger/server/json-api';
import { errorResponse } from '@/lib/ledger/server/http';
import type { TipResponse } from '@/lib/ledger/wire';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json<TipResponse>({ offset: await ledgerEnd() });
  } catch (cause) {
    return errorResponse(cause);
  }
}
