/**
 * Ledger backend selection and endpoint plumbing.
 *
 * `NEXT_PUBLIC_LEDGER` is the single switch: `mock` (default) keeps the app
 * self-contained, `canton` points it at a live participant through this app's
 * own route handlers. A missing or unreachable ledger must never be a build or
 * boot failure — the demo has to run on a laptop with no sandbox.
 *
 * The browser only ever learns `NEXT_PUBLIC_*` values. The JSON Ledger API base
 * URL is server-side only: no component, and no bundle, ever addresses the
 * participant directly.
 */

export type LedgerBackend = 'mock' | 'canton';

/** Which implementation `getLedgerClient()` hands out. Defaults to the mock. */
export function ledgerBackend(): LedgerBackend {
  return process.env.NEXT_PUBLIC_LEDGER === 'canton' ? 'canton' : 'mock';
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
