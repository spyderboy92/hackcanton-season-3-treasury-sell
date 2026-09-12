/**
 * POST /api/ledger/command — submit one command set as the acting party.
 *
 * One request, one submission, one atomic transaction. The body is the command
 * the UI asked for; the mapping onto Daml choices lives in
 * `lib/ledger/server/ledger.ts` so the browser never composes ledger commands.
 */

import { NextResponse } from 'next/server';

import { runCommand } from '@/lib/ledger/server/ledger';
import { errorResponse, readJson } from '@/lib/ledger/server/http';
import type { CommandRequest, CommandResponse } from '@/lib/ledger/wire';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await readJson<CommandRequest>(request);
    return NextResponse.json<CommandResponse>(await runCommand(body));
  } catch (cause) {
    return errorResponse(cause);
  }
}
