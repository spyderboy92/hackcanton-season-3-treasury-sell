const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.TEST_LEDGER_BUILD;
const { ledgerConnection } = require(path.join(root, 'ledger/server/config.js'));
const { ledgerEnd, submit, exercise, disclosureFor } = require(path.join(root, 'ledger/server/json-api.js'));
const authPath = path.join(root, 'ledger/server/auth.js');
const originalEnv = { ...process.env };
const originalFetch = global.fetch;
let authorizationHeaders;

beforeEach(() => {
  for (const name of Object.keys(process.env)) if (name.startsWith('LEDGER_')) delete process.env[name];
  delete require.cache[require.resolve(authPath)];
  ({ authorizationHeaders } = require(authPath));
});
afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
});

function devnet() {
  Object.assign(process.env, {
    LEDGER_NETWORK: 'devnet', LEDGER_JSON_API: 'https://participant.example',
    LEDGER_AUTH0_DOMAIN: 'tenant.example', LEDGER_AUTH0_CLIENT_ID: 'client',
    LEDGER_AUTH0_CLIENT_SECRET: 'secret-value', LEDGER_AUTH0_AUDIENCE: 'ledger-audience',
  });
  return ledgerConnection();
}
function token(value = 'access-token', expires = 3600) {
  return Response.json({ access_token: value, token_type: 'Bearer', expires_in: expires });
}

test('sandbox remains unauthenticated and preserves the default endpoint', async () => {
  const connection = ledgerConnection();
  assert.equal(connection.baseUrl, 'http://127.0.0.1:6864');
  assert.equal(connection.auth, 'none');
  assert.deepEqual(await authorizationHeaders(connection), {});
});

test('LocalNet requires an explicit endpoint and JWT without silently using sandbox', async () => {
  process.env.LEDGER_NETWORK = 'localnet';
  assert.throws(ledgerConnection, /LEDGER_JSON_API/);
  process.env.LEDGER_JSON_API = 'http://localhost:7575/';
  assert.throws(ledgerConnection, /LEDGER_JWT_TOKEN/);
  process.env.LEDGER_JWT_TOKEN = 'local-jwt';
  assert.deepEqual(await authorizationHeaders(ledgerConnection()), { Authorization: 'Bearer local-jwt' });
  assert.equal(ledgerConnection().baseUrl, 'http://localhost:7575');
  process.env.LEDGER_JWT_TOKEN = 'Bearer local-jwt';
  assert.throws(ledgerConnection, /Bearer prefix/);
});

test('invalid profiles and credential-bearing URLs fail closed', () => {
  process.env.LEDGER_NETWORK = 'typo';
  assert.throws(ledgerConnection, /LEDGER_NETWORK/);
  process.env.LEDGER_NETWORK = 'sandbox';
  for (const url of ['ftp://host', 'http://user:secret@host', 'http://host?token=secret', 'not a url']) {
    process.env.LEDGER_JSON_API = url;
    assert.throws(ledgerConnection);
  }
});

test('DevNet validates HTTPS, Auth0 host, and all grant settings', () => {
  assert.equal(devnet().tokenUrl, 'https://tenant.example/oauth/token');
  process.env.LEDGER_JSON_API = 'http://participant.example';
  assert.throws(ledgerConnection, /HTTPS/);
  process.env.LEDGER_JSON_API = 'https://participant.example';
  process.env.LEDGER_AUTH0_DOMAIN = 'http://tenant.example';
  assert.throws(ledgerConnection, /HTTPS/);
  process.env.LEDGER_AUTH0_DOMAIN = 'tenant.example/path';
  assert.throws(ledgerConnection, /without a path/);
  process.env.LEDGER_AUTH0_DOMAIN = 'https://tenant.example/';
  for (const name of ['LEDGER_AUTH0_CLIENT_ID', 'LEDGER_AUTH0_CLIENT_SECRET', 'LEDGER_AUTH0_AUDIENCE']) {
    const value = process.env[name];
    delete process.env[name];
    assert.throws(ledgerConnection, new RegExp(name));
    process.env[name] = value;
  }
});

test('Auth0 grant is cached and concurrent requests share one grant', async () => {
  const connection = devnet();
  let grants = 0;
  global.fetch = async (url, options) => {
    grants++;
    assert.equal(url, connection.tokenUrl);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.deepEqual(JSON.parse(options.body), {
      grant_type: 'client_credentials', client_id: 'client', client_secret: 'secret-value', audience: 'ledger-audience',
    });
    return token();
  };
  const results = await Promise.all(Array.from({ length: 5 }, () => authorizationHeaders(connection)));
  assert.equal(grants, 1);
  assert.ok(results.every(r => r.Authorization === 'Bearer access-token'));
  await authorizationHeaders(connection);
  assert.equal(grants, 1);
});

test('Auth0 refreshes before expiry and does not reuse tokens after credential rotation', async () => {
  const connection = devnet();
  const originalNow = Date.now;
  let now = 100_000;
  let grants = 0;
  Date.now = () => now;
  global.fetch = async () => token(`token-${++grants}`, 100);
  try {
    await authorizationHeaders(connection);
    now += 89_000;
    await authorizationHeaders(connection);
    assert.equal(grants, 1);
    now += 2_000;
    assert.equal((await authorizationHeaders(connection)).Authorization, 'Bearer token-2');
    assert.equal((await authorizationHeaders({ ...connection, clientSecret: 'rotated' })).Authorization, 'Bearer token-3');
    assert.equal((await authorizationHeaders({ ...connection, audience: 'other' })).Authorization, 'Bearer token-4');
  } finally { Date.now = originalNow; }
});

test('failed grants are redacted and can be retried', async () => {
  const connection = devnet();
  global.fetch = async () => new Response('secret-value access-token', { status: 401 });
  await assert.rejects(authorizationHeaders(connection), error => {
    assert.equal(error.code, 'NOT_AUTHORIZED');
    assert.ok(!error.message.includes('secret-value'));
    return true;
  });
  global.fetch = async () => token();
  assert.equal((await authorizationHeaders(connection)).Authorization, 'Bearer access-token');
});

test('malformed token responses and transport failures are redacted', async () => {
  const connection = devnet();
  for (const body of [null, {}, { access_token: 'x', token_type: 'Bearer', expires_in: -1 },
    { access_token: 'x', token_type: 'Basic', expires_in: 100 }]) {
    global.fetch = async () => Response.json(body);
    await assert.rejects(authorizationHeaders(connection), /invalid token response/);
  }
  global.fetch = async () => { throw new Error('secret-value'); };
  await assert.rejects(authorizationHeaders(connection), /Auth0 token endpoint did not answer/);
});

test('adapter attaches JWT to reads and submissions without changing sibling commands', async () => {
  Object.assign(process.env, { LEDGER_NETWORK: 'localnet', LEDGER_JSON_API: 'http://localhost:7575',
    LEDGER_JWT_TOKEN: 'test-jwt', LEDGER_USER_ID: 'provisioned-user' });
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, 'Bearer test-jwt');
    assert.equal(options.redirect, 'error');
    if (url.endsWith('/ledger-end')) return Response.json({ offset: 10 });
    const body = JSON.parse(options.body);
    assert.deepEqual(body.commands.actAs, ['Treasury']);
    assert.equal(body.commands.userId, 'provisioned-user');
    assert.deepEqual(body.commands.commands.map(c => c.ExerciseCommand.choice), ['Accept', 'Close']);
    assert.deepEqual(Object.keys(body.transactionFormat.eventFormat.filtersByParty), ['Treasury']);
    return Response.json({ transaction: { offset: 11, events: [] } });
  };
  assert.equal(await ledgerEnd(), 10);
  await submit('Treasury', [exercise('Quote', 'quote', 'Accept', { fillCid: 'fill' }), exercise('RFQ', 'rfq', 'Close')]);
  assert.equal(calls, 2);
});

test('seller disclosure reads retain seller-only filters and authentication', async () => {
  Object.assign(process.env, { LEDGER_NETWORK: 'localnet', LEDGER_JSON_API: 'http://localhost:7575', LEDGER_JWT_TOKEN: 'test-jwt' });
  global.fetch = async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-jwt');
    const body = JSON.parse(options.body);
    assert.deepEqual(Object.keys(body.eventFormat.filtersByParty), ['Seller']);
    return Response.json([{ contractEntry: { JsActiveContract: {
      synchronizerId: 'sync', createdEvent: { contractId: 'asset', templateId: 'holding', createdEventBlob: 'blob' },
    } } }]);
  };
  assert.deepEqual(await disclosureFor('Seller', 'TokenHolding', 'asset', 10), {
    templateId: 'holding', contractId: 'asset', createdEventBlob: 'blob', synchronizerId: 'sync',
  });
});

test('DevNet adapter exchanges client credentials then sends only the bearer token to Canton', async () => {
  const connection = devnet();
  const urls = [];
  global.fetch = async (url, options) => {
    urls.push(url);
    if (url === connection.tokenUrl) return token('devnet-token');
    assert.equal(options.headers.Authorization, 'Bearer devnet-token');
    assert.ok(!JSON.stringify(options).includes('secret-value'));
    return Response.json({ offset: 80 });
  };
  assert.equal(await ledgerEnd(), 80);
  assert.deepEqual(urls, [connection.tokenUrl, 'https://participant.example/v2/state/ledger-end']);
});

test('participant HTTP auth errors do not forward upstream bodies', async () => {
  for (const status of [401, 403]) {
    global.fetch = async () => new Response('secret-value', { status });
    await assert.rejects(ledgerEnd(), error => error.code === 'NOT_AUTHORIZED' && !error.message.includes('secret-value'));
  }
});
