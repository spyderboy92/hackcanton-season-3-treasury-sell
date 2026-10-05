import { LedgerError } from '../client';

export type LedgerNetwork = 'sandbox' | 'localnet' | 'devnet';

export type LedgerConnection = {
  network: LedgerNetwork;
  baseUrl: string;
  userId: string;
} & (
  | { auth: 'none' }
  | { auth: 'jwt'; token: string }
  | { auth: 'auth0'; tokenUrl: string; clientId: string; clientSecret: string; audience: string }
);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new LedgerError('UNAVAILABLE', `Missing server configuration: ${name}.`);
  return value;
}

function validatedUrl(value: string, name: string, httpsOnly = false): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LedgerError('UNAVAILABLE', `${name} must be a valid URL.`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || (httpsOnly && url.protocol !== 'https:') ||
      url.username || url.password || url.search || url.hash) {
    throw new LedgerError('UNAVAILABLE', `${name} must use ${httpsOnly ? 'HTTPS' : 'HTTP or HTTPS'} without credentials, query, or fragment.`);
  }
  return url.toString().replace(/\/+$/, '');
}

// Keep credentials in the server directory so shared UI configuration cannot expose them.
export function ledgerConnection(): LedgerConnection {
  const network = process.env.LEDGER_NETWORK ?? 'sandbox';
  if (network !== 'sandbox' && network !== 'localnet' && network !== 'devnet') {
    throw new LedgerError('UNAVAILABLE', 'LEDGER_NETWORK must be sandbox, localnet, or devnet.');
  }
  const baseUrl = validatedUrl(
    network === 'sandbox' ? (process.env.LEDGER_JSON_API ?? 'http://127.0.0.1:6864') : required('LEDGER_JSON_API'),
    'LEDGER_JSON_API',
    network === 'devnet',
  );
  const userId = process.env.LEDGER_USER_ID?.trim() || 'treasury-rfq-ui';
  const connection: Pick<LedgerConnection, 'network' | 'baseUrl' | 'userId'> = { network, baseUrl, userId };
  if (network === 'sandbox') return { ...connection, auth: 'none' };
  if (network === 'localnet') {
    const token = required('LEDGER_JWT_TOKEN');
    if (/\s/.test(token)) throw new LedgerError('UNAVAILABLE', 'LEDGER_JWT_TOKEN must be a token without a Bearer prefix or whitespace.');
    return { ...connection, auth: 'jwt', token };
  }
  const domain = required('LEDGER_AUTH0_DOMAIN');
  const auth0Url = validatedUrl(domain.includes('://') ? domain : `https://${domain}`, 'LEDGER_AUTH0_DOMAIN', true);
  if (new URL(auth0Url).pathname !== '/') {
    throw new LedgerError('UNAVAILABLE', 'LEDGER_AUTH0_DOMAIN must be an HTTPS host without a path.');
  }
  return {
    ...connection,
    auth: 'auth0',
    tokenUrl: `${auth0Url}/oauth/token`,
    clientId: required('LEDGER_AUTH0_CLIENT_ID'),
    clientSecret: required('LEDGER_AUTH0_CLIENT_SECRET'),
    audience: required('LEDGER_AUTH0_AUDIENCE'),
  };
}
