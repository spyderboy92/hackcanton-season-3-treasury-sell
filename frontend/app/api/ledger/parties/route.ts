/**
 * GET /api/ledger/parties — the demo roles mapped onto real Canton party ids.
 *
 * The browser needs these to know which party each desk acts as; it must not
 * learn them by talking to the participant itself.
 */

import { NextResponse } from 'next/server';

import { resolveDemoParties } from '@/lib/ledger/server/parties';
import { errorResponse } from '@/lib/ledger/server/http';
import type { PartiesResponse } from '@/lib/ledger/wire';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const resolved = await resolveDemoParties();
    return NextResponse.json<PartiesResponse>(resolved);
  } catch (cause) {
    return errorResponse(cause);
  }
}
