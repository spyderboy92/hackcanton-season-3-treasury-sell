const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.TEST_LEDGER_BUILD;
const {
  demoTopUpMints,
  topUpEnabled,
  DEMO_ASSET,
  DEMO_CURRENCY,
  TREASURY_ASSET_BALANCE,
  DEALER_CASH_BALANCE,
} = require(path.join(root, 'ledger/server/topup.js'));

const IDS = {
  registry: 'Registry::1',
  treasury: 'Treasury::1',
  dealerA: 'DealerA::1',
  dealerB: 'DealerB::1',
  dealerC: 'DealerC::1',
};

test('top-up is enabled only on DevNet canton (not mock, sandbox, or localnet)', () => {
  assert.equal(topUpEnabled({ LEDGER_NETWORK: 'devnet' }), true);
  assert.equal(topUpEnabled({ LEDGER_NETWORK: 'devnet', NEXT_PUBLIC_LEDGER: 'canton' }), true);
  assert.equal(topUpEnabled({ LEDGER_NETWORK: 'devnet', NEXT_PUBLIC_LEDGER: 'mock' }), false);
  assert.equal(topUpEnabled({ LEDGER_NETWORK: 'sandbox' }), false);
  assert.equal(topUpEnabled({ LEDGER_NETWORK: 'localnet' }), false);
  assert.equal(topUpEnabled({}), false);
});

test('demoTopUpMints matches Bootstrap opening balances', () => {
  const mints = demoTopUpMints(IDS);
  assert.deepEqual(mints, [
    { owner: IDS.treasury, symbol: DEMO_ASSET, amount: TREASURY_ASSET_BALANCE },
    { owner: IDS.dealerA, symbol: DEMO_CURRENCY, amount: DEALER_CASH_BALANCE },
    { owner: IDS.dealerB, symbol: DEMO_CURRENCY, amount: DEALER_CASH_BALANCE },
    { owner: IDS.dealerC, symbol: DEMO_CURRENCY, amount: DEALER_CASH_BALANCE },
  ]);
  assert.equal(DEMO_ASSET, 'cETH');
  assert.equal(DEMO_CURRENCY, 'USD');
  assert.equal(TREASURY_ASSET_BALANCE, '25.0');
  assert.equal(DEALER_CASH_BALANCE, '1000000.0');
});
