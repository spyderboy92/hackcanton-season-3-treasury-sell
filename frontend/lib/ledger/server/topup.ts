/**
 * DevNet balance faucet helpers. SERVER ONLY.
 *
 * Holdings are signed by Registry alone (`TokenHolding`), so only a submission
 * that acts as Registry can create them. Desk sessions never may — see
 * `allowedParties` — so the login-page faucet posts to `/api/auth/topup`, which
 * resolves parties and submits as Registry.
 *
 * Additive by design: each call creates new contracts for the fixture amounts.
 * It does not archive prior holdings or rewind RFQ state.
 */

import type { Party } from '../types';
import { create, type CreateCommand } from './json-api';

/** Same numbers as `Tests.Fixtures` / `Demo.Bootstrap` / the mock seed. */
export const DEMO_ASSET = 'cETH';
export const DEMO_CURRENCY = 'USD';
export const TREASURY_ASSET_BALANCE = '25.0';
export const DEALER_CASH_BALANCE = '1000000.0';

export type TopUpMint = {
  owner: Party;
  symbol: string;
  amount: string;
};

/**
 * The four holdings Bootstrap creates: treasury cETH and each dealer's USD.
 * Auditor and Registry get nothing — they are not counterparties on the cash
 * or asset legs of the demo path.
 */
export function demoTopUpMints(ids: {
  treasury: Party;
  dealerA: Party;
  dealerB: Party;
  dealerC: Party;
}): TopUpMint[] {
  return [
    { owner: ids.treasury, symbol: DEMO_ASSET, amount: TREASURY_ASSET_BALANCE },
    { owner: ids.dealerA, symbol: DEMO_CURRENCY, amount: DEALER_CASH_BALANCE },
    { owner: ids.dealerB, symbol: DEMO_CURRENCY, amount: DEALER_CASH_BALANCE },
    { owner: ids.dealerC, symbol: DEMO_CURRENCY, amount: DEALER_CASH_BALANCE },
  ];
}

export function topUpEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  // Mock has no Registry submission path; DevNet is the only profile that needs
  // a faucet after the seed balances are spent.
  return (env.LEDGER_NETWORK ?? 'sandbox') === 'devnet' && env.NEXT_PUBLIC_LEDGER !== 'mock';
}

/** Sibling `create TokenHolding` commands for one Registry submission. */
export function topUpCreateCommands(
  registry: Party,
  ids: {
    treasury: Party;
    dealerA: Party;
    dealerB: Party;
    dealerC: Party;
  },
): CreateCommand[] {
  return demoTopUpMints(ids).map((m) =>
    create('TokenHolding', {
      issuer: registry,
      owner: m.owner,
      symbol: m.symbol,
      amount: m.amount,
    }),
  );
}
