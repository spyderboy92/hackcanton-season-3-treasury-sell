import { LedgerError } from '../client';
import type { LedgerConnection } from './config';

type Auth0Connection = Extract<LedgerConnection, { auth: 'auth0' }>;
type Token = { value: string; refreshAt: number };
let cached: { key: string; token: Token } | undefined;
let pending: { key: string; request: Promise<Token> } | undefined;

async function requestToken(connection: Auth0Connection): Promise<Token> {
  let response: Response;
  try {
    response = await fetch(connection.tokenUrl, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: connection.clientId,
        client_secret: connection.clientSecret,
        audience: connection.audience,
      }),
    });
  } catch {
    throw new LedgerError('UNAVAILABLE', 'Auth0 token endpoint did not answer.');
  }
  // Auth0 error bodies may contain sensitive details, so never forward them to the browser.
  if (!response.ok) throw new LedgerError('NOT_AUTHORIZED', `Auth0 token request rejected (HTTP ${response.status}).`);
  let body: { access_token?: unknown; token_type?: unknown; expires_in?: unknown };
  try {
    body = await response.json();
  } catch {
    throw new LedgerError('UNAVAILABLE', 'Auth0 returned an invalid token response.');
  }
  if (!body || typeof body.access_token !== 'string' || !body.access_token || /\s/.test(body.access_token) ||
      typeof body.token_type !== 'string' || body.token_type.toLowerCase() !== 'bearer' ||
      typeof body.expires_in !== 'number' || !Number.isFinite(body.expires_in) || body.expires_in <= 0) {
    throw new LedgerError('UNAVAILABLE', 'Auth0 returned an invalid token response.');
  }
  const lifetime = body.expires_in * 1000;
  return { value: body.access_token, refreshAt: Date.now() + lifetime - Math.min(30_000, lifetime / 10) };
}

export async function authorizationHeaders(connection: LedgerConnection): Promise<Record<string, string>> {
  if (connection.auth === 'none') return {};
  if (connection.auth === 'jwt') return { Authorization: `Bearer ${connection.token}` };

  // Bind the cache to the credentials and audience so rotation cannot reuse a previous identity's token.
  const key = JSON.stringify([connection.tokenUrl, connection.clientId, connection.clientSecret, connection.audience]);
  if (cached?.key === key && Date.now() < cached.token.refreshAt) {
    return { Authorization: `Bearer ${cached.token.value}` };
  }
  // Share an in-flight grant so concurrent desk reads do not flood Auth0.
  if (pending?.key !== key) {
    const request = requestToken(connection);
    pending = { key, request };
  }
  const request = pending.request;
  try {
    const token = await request;
    cached = { key, token };
    return { Authorization: `Bearer ${token.value}` };
  } finally {
    if (pending?.request === request) pending = undefined;
  }
}
