/**
 * Login failure throttle. SERVER ONLY, in-memory, per process.
 *
 * Keyed on username + client address so one noisy client cannot lock a user out
 * from everywhere, and one user's typos do not throttle a shared NAT. Five
 * failures inside fifteen minutes block that pair until the window lapses; a
 * success clears it. In-process state is enough for a single-node demo — a
 * multi-instance deployment would need a shared store, which is a non-goal
 * (AGENTS.md section 8: no Redis).
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const MAX_KEYS = 10_000;

interface Entry {
  failures: number;
  first: number;
}

const store: Map<string, Entry> =
  ((globalThis as Record<string, unknown>).__rfqLoginFailures as Map<string, Entry> | undefined) ??
  ((globalThis as Record<string, unknown>).__rfqLoginFailures = new Map<string, Entry>());

function key(username: string, ip: string): string {
  return `${username}\u0000${ip}`;
}

/** Seconds until the pair may try again, or 0 if it may try now. */
export function retryAfter(username: string, ip: string, now = Date.now()): number {
  const entry = store.get(key(username, ip));
  if (!entry) return 0;
  if (now - entry.first >= WINDOW_MS) {
    store.delete(key(username, ip));
    return 0;
  }
  return entry.failures >= MAX_FAILURES ? Math.ceil((entry.first + WINDOW_MS - now) / 1000) : 0;
}

export function recordFailure(username: string, ip: string, now = Date.now()): void {
  if (store.size >= MAX_KEYS) {
    for (const [k, e] of store) if (now - e.first >= WINDOW_MS) store.delete(k);
    if (store.size >= MAX_KEYS) store.clear();
  }
  const k = key(username, ip);
  const entry = store.get(k);
  if (!entry || now - entry.first >= WINDOW_MS) store.set(k, { failures: 1, first: now });
  else entry.failures += 1;
}

export function recordSuccess(username: string, ip: string): void {
  store.delete(key(username, ip));
}

/** Best-effort client address. Behind no proxy on loopback this is just "local". */
export function clientAddress(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'local'
  );
}
