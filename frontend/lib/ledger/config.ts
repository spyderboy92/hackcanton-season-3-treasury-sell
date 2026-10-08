/**
 * Ledger backend selection and endpoint plumbing.
 *
 * `NEXT_PUBLIC_LEDGER` is the single switch. The live participant (`canton`) is
 * the DEFAULT: the party directory and the login accounts live on the ledger,
 * so the ledger is the system of record and the app should be on it unless told
 * otherwise. `NEXT_PUBLIC_LEDGER=mock` — exactly that value — opts into the
 * self-contained in-memory fixture for a laptop with no sandbox. Either way a
 * missing or unreachable ledger is never a build or boot failure: on canton the
 * desks render empty and say the participant did not answer.
 *
 * The browser only ever learns `NEXT_PUBLIC_*` values. The JSON Ledger API base
 * URL is server-side only: no component, and no bundle, ever addresses the
 * participant directly.
 */

export type LedgerBackend = 'mock' | 'canton';

/**
 * Which implementation `getLedgerClient()` hands out. Defaults to the live
 * ledger; only an explicit `NEXT_PUBLIC_LEDGER=mock` selects the fixture, so a
 * typo fails towards the real ledger rather than silently into a mock.
 */
export function ledgerBackend(): LedgerBackend {
  return process.env.NEXT_PUBLIC_LEDGER === 'mock' ? 'mock' : 'canton';
}

/** Shown in the status rail. Host and port only; no scheme, no secrets. */
export function ledgerEndpointLabel(): string {
  const configured = process.env.NEXT_PUBLIC_LEDGER_ENDPOINT;
  if (configured) return configured;
  return '127.0.0.1:6864';
}

/** How often the browser asks the participant for its ledger end. */
export function pollIntervalMs(): number {
  const raw = Number(process.env.NEXT_PUBLIC_LEDGER_POLL_MS);
  return Number.isFinite(raw) && raw >= 250 ? raw : 1500;
}

/** Where the browser-side client posts. Same origin in the browser. */
export function apiBaseUrl(): string {
  if (typeof window !== 'undefined') return '';
  return (process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
}
