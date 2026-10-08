/**
 * Ledger factory. This is the single swap point.
 *
 * By default the app is on a live participant (through this app's own route
 * handlers) — the ledger holds the party directory and the login accounts, so
 * it is the system of record. `NEXT_PUBLIC_LEDGER=mock`, set explicitly, keeps
 * the in-memory fixture instead, for a machine with no sandbox running. See
 * `ledgerBackend()` in ./config.ts.
 */

import type { LedgerClient } from './client';
import { CantonLedgerClient } from './canton';
import { ledgerBackend } from './config';
import { MockLedgerClient } from './mock';

let singleton: LedgerClient | null = null;

export function getLedgerClient(): LedgerClient {
  singleton ??= ledgerBackend() === 'canton' ? new CantonLedgerClient() : new MockLedgerClient();
  return singleton;
}

export * from './client';
export * from './types';
