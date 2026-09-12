/**
 * Ledger factory. This is the single swap point.
 *
 * `NEXT_PUBLIC_LEDGER=canton` puts the app on a live participant (through this
 * app's own route handlers); anything else — including nothing at all — keeps
 * the in-memory fixture. The default matters: the app has to build, boot and
 * demo on a machine with no sandbox running, so a missing ledger degrades to
 * the mock rather than failing.
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
