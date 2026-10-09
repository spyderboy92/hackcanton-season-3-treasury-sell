const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.TEST_LEDGER_BUILD;
const { explorerBase, explorerUrlForUpdate } = require(path.join(root, 'ledger/server/explorer.js'));
const { updateIdAt } = require(path.join(root, 'ledger/server/json-api.js'));

const UPDATE_ID = '1220' + 'ab'.repeat(32);
const originalEnv = { ...process.env };
const originalFetch = global.fetch;
afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
});

test('DevNet links an update to Lighthouse by default', () => {
  const env = { LEDGER_NETWORK: 'devnet' };
  assert.equal(explorerBase(env), 'https://lighthouse.devnet.cantonloop.com');
  assert.equal(
    explorerUrlForUpdate(UPDATE_ID, env),
    `https://lighthouse.devnet.cantonloop.com/transactions/${UPDATE_ID}`,
  );
});

test('sandbox and LocalNet show the id without a link', () => {
  assert.equal(explorerUrlForUpdate(UPDATE_ID, {}), null);
  assert.equal(explorerUrlForUpdate(UPDATE_ID, { LEDGER_NETWORK: 'sandbox' }), null);
  assert.equal(explorerUrlForUpdate(UPDATE_ID, { LEDGER_NETWORK: 'localnet' }), null);
});

test('LEDGER_EXPLORER_URL overrides, and off disables, the explorer', () => {
  assert.equal(
    explorerUrlForUpdate(UPDATE_ID, {
      LEDGER_NETWORK: 'localnet',
      LEDGER_EXPLORER_URL: 'https://lighthouse.testnet.cantonloop.com/',
    }),
    `https://lighthouse.testnet.cantonloop.com/transactions/${UPDATE_ID}`,
  );
  assert.equal(explorerUrlForUpdate(UPDATE_ID, { LEDGER_NETWORK: 'devnet', LEDGER_EXPLORER_URL: 'off' }), null);
});

test('an unsafe explorer URL disables links instead of reaching the browser', () => {
  for (const bad of [
    'http://lighthouse.devnet.cantonloop.com',
    'javascript:alert(1)',
    'https://u:p@x.example',
    'https://x.example/?q=1',
    'not a url',
  ]) {
    assert.equal(explorerUrlForUpdate(UPDATE_ID, { LEDGER_NETWORK: 'devnet', LEDGER_EXPLORER_URL: bad }), null, bad);
  }
});

test('the update id is encoded into the path', () => {
  assert.equal(
    explorerUrlForUpdate('a/b?c', { LEDGER_NETWORK: 'devnet' }),
    'https://lighthouse.devnet.cantonloop.com/transactions/a%2Fb%3Fc',
  );
});

test('updateIdAt looks the offset up as the reading party only, and remembers the answer', async () => {
  process.env.LEDGER_NETWORK = 'sandbox';
  process.env.LEDGER_JSON_API = 'http://participant.test';
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ update: { Transaction: { value: { updateId: UPDATE_ID, offset: 42, events: [] } } } }), { status: 200 });
  };

  assert.equal(await updateIdAt('Auditor::1220aa', 42, ['SettlementReceipt']), UPDATE_ID);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://participant.test/v2/updates/update-by-offset');
  assert.equal(calls[0].body.offset, 42);
  const filters = calls[0].body.updateFormat.includeTransactions.eventFormat.filtersByParty;
  assert.deepEqual(Object.keys(filters), ['Auditor::1220aa']);

  // Same party, same offset: cached. A different party asks the participant itself.
  assert.equal(await updateIdAt('Auditor::1220aa', 42, ['SettlementReceipt']), UPDATE_ID);
  assert.equal(calls.length, 1);
  await updateIdAt('Treasury::1220bb', 42, ['SettlementReceipt']);
  assert.equal(calls.length, 2);
  assert.deepEqual(Object.keys(calls[1].body.updateFormat.includeTransactions.eventFormat.filtersByParty), ['Treasury::1220bb']);
});

test('updateIdAt rejects a response with no transaction', async () => {
  process.env.LEDGER_NETWORK = 'sandbox';
  process.env.LEDGER_JSON_API = 'http://participant.test';
  global.fetch = async () => new Response(JSON.stringify({ update: { OffsetCheckpoint: {} } }), { status: 200 });
  await assert.rejects(updateIdAt('Dealer::1220cc', 7, ['SettlementReceipt']), { code: 'NOT_FOUND' });
});
