/**
 * POST /api/auth/topup — mint the demo opening holdings again (DevNet only).
 *
 * Public on purpose: the login page needs a faucet before anyone is signed in.
 * Submits as Registry (issuer of `TokenHolding`), not as a desk session. The
 * participant must grant the app's ledger user `actAs` Registry.
 *
 * Additive: creates new holdings at the Bootstrap amounts; does not archive
 * prior balances or rewind RFQ/trade state.
 */

import { NextResponse } from 'next/server';

import { clientAddress, recordTopUp, topUpRetryAfter } from '@/lib/auth/server/rate-limit';
import { LedgerError } from '@/lib/ledger/client';
import { errorResponse } from '@/lib/ledger/server/http';
import { submit } from '@/lib/ledger/server/json-api';
import { resolveDemoParties } from '@/lib/ledger/server/parties';
import { topUpCreateCommands, topUpEnabled } from '@/lib/ledger/server/topup';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!topUpEnabled()) {
      return NextResponse.json(
        { error: { code: 'NOT_AUTHORIZED', message: 'Balance top-up is only available on DevNet.' } },
        { status: 403 },
      );
    }

    const ip = clientAddress(request);
    const wait = topUpRetryAfter(ip);
    if (wait > 0) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_AUTHORIZED',
            message: `Top-up is cooling down. Try again in ${wait}s.`,
          },
        },
        { status: 429, headers: { 'retry-after': String(wait) } },
      );
    }

    const { ids, unresolved } = await resolveDemoParties();
    const needed = ['registry', 'treasury', 'dealerA', 'dealerB', 'dealerC'] as const;
    const missing = needed.filter((role) => unresolved.includes(role));
    if (missing.length > 0) {
      throw new LedgerError(
        'UNAVAILABLE',
        `Cannot top up: unresolved parties (${missing.join(', ')}). Pin LEDGER_PARTY_* or wait for Bootstrap.`,
      );
    }

    const commands = topUpCreateCommands(ids.registry, ids);
    await submit(ids.registry, commands);
    recordTopUp(ip);

    return NextResponse.json({
      ok: true,
      minted: commands.length,
      message: 'Minted demo balances: Treasury 25 cETH; Dealers A/B/C 1,000,000 USD each.',
    });
  } catch (cause) {
    return errorResponse(cause);
  }
}
