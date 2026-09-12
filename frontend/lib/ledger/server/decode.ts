/**
 * Decoding of Daml-LF JSON payloads into the app's payload types. SERVER ONLY.
 *
 * Two rules the decoders exist to enforce:
 *
 *  - Decimals stay STRINGS. The participant sends "3040.0000000000"; that is
 *    the value. Parsing it into a JS number and printing it back is how money
 *    silently loses cents, so nothing here touches `Number`.
 *  - `Optional a` arrives as the value or `null`, enums as their constructor
 *    name, `Time` as an ISO-8601 instant. No re-encoding needed either way.
 */

import { LedgerError, type LedgerEvent, type LedgerTemplate } from '../client';
import {
  buyerOf,
  sellerOf,
  type AcceptedTrade,
  type Instant,
  type Party,
  type Quote,
  type Rfq,
  type RfqInvitation,
  type SettlementInstruction,
  type SettlementReceipt,
  type Side,
  type TokenHolding,
} from '../types';
import { format, precisionFor } from '../../decimal';
import { templateOf, type CreatedEvent, type Transaction } from './json-api';

type Row = Record<string, unknown>;

function str(row: Row, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') {
    throw new LedgerError('INVALID_ARGUMENT', `ledger payload is missing "${field}"`);
  }
  return value;
}

function optStr(row: Row, field: string): string | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new LedgerError('INVALID_ARGUMENT', `ledger payload has a malformed "${field}"`);
  }
  return value;
}

function strList(row: Row, field: string): string[] {
  const value = row[field];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new LedgerError('INVALID_ARGUMENT', `ledger payload has a malformed "${field}"`);
  }
  return value as string[];
}

function side(row: Row): Side {
  const value = str(row, 'side');
  if (value !== 'Buy' && value !== 'Sell') {
    throw new LedgerError('INVALID_ARGUMENT', `unknown Side "${value}"`);
  }
  return value;
}

function status(row: Row): Rfq['status'] {
  const value = str(row, 'status');
  if (value !== 'Open' && value !== 'Closed' && value !== 'Cancelled') {
    throw new LedgerError('INVALID_ARGUMENT', `unknown RfqStatus "${value}"`);
  }
  return value;
}

export function decodeRfq(row: Row): Rfq {
  return {
    rfqId: str(row, 'rfqId'),
    treasury: str(row, 'treasury'),
    asset: str(row, 'asset'),
    quoteCurrency: str(row, 'quoteCurrency'),
    side: side(row),
    quantity: str(row, 'quantity'),
    quoteDeadline: optStr(row, 'quoteDeadline'),
    invitedDealers: strList(row, 'invitedDealers'),
    status: status(row),
  };
}

export function decodeInvitation(row: Row): RfqInvitation {
  return {
    rfqId: str(row, 'rfqId'),
    treasury: str(row, 'treasury'),
    dealer: str(row, 'dealer'),
    asset: str(row, 'asset'),
    quoteCurrency: str(row, 'quoteCurrency'),
    side: side(row),
    quantity: str(row, 'quantity'),
    quoteDeadline: optStr(row, 'quoteDeadline'),
  };
}

export function decodeQuote(row: Row): Quote {
  // The Daml template also carries `quoteDeadline` (so Withdraw can restore the
  // invitation). The UI has no use for it, so it is dropped here rather than
  // widened into the shared type.
  return {
    rfqId: str(row, 'rfqId'),
    treasury: str(row, 'treasury'),
    dealer: str(row, 'dealer'),
    asset: str(row, 'asset'),
    quoteCurrency: str(row, 'quoteCurrency'),
    side: side(row),
    quantity: str(row, 'quantity'),
    price: str(row, 'price'),
    expiry: optStr(row, 'expiry'),
    submittedAt: str(row, 'submittedAt'),
  };
}

export function decodeTrade(row: Row): AcceptedTrade {
  return {
    rfqId: str(row, 'rfqId'),
    treasury: str(row, 'treasury'),
    dealer: str(row, 'dealer'),
    asset: str(row, 'asset'),
    quoteCurrency: str(row, 'quoteCurrency'),
    side: side(row),
    quantity: str(row, 'quantity'),
    price: str(row, 'price'),
    acceptedAt: str(row, 'acceptedAt'),
  };
}

export function decodeInstruction(row: Row): SettlementInstruction {
  // SettlementInstruction stores `side`, not buyer/seller: the Daml model
  // derives the two legs from one definition so they cannot drift. The UI type
  // wants them spelled out, so the same derivation runs here.
  const s = side(row);
  const treasury = str(row, 'treasury');
  const dealer = str(row, 'dealer');
  return {
    rfqId: str(row, 'rfqId'),
    treasury,
    dealer,
    buyer: buyerOf(s, treasury, dealer),
    seller: sellerOf(s, treasury, dealer),
    asset: str(row, 'asset'),
    assetQuantity: str(row, 'assetQuantity'),
    quoteCurrency: str(row, 'quoteCurrency'),
    paymentAmount: str(row, 'paymentAmount'),
    price: str(row, 'price'),
    assetHoldingCid: str(row, 'assetHoldingCid'),
    auditor: optStr(row, 'auditor'),
  };
}

export function decodeReceipt(row: Row): SettlementReceipt {
  return {
    rfqId: str(row, 'rfqId'),
    treasury: str(row, 'treasury'),
    dealer: str(row, 'dealer'),
    buyer: str(row, 'buyer'),
    seller: str(row, 'seller'),
    asset: str(row, 'asset'),
    assetQuantity: str(row, 'assetQuantity'),
    quoteCurrency: str(row, 'quoteCurrency'),
    paymentAmount: str(row, 'paymentAmount'),
    price: str(row, 'price'),
    auditor: optStr(row, 'auditor'),
    settledAt: str(row, 'settledAt'),
  };
}

export function decodeHolding(row: Row): TokenHolding {
  return {
    issuer: str(row, 'issuer'),
    owner: str(row, 'owner'),
    symbol: str(row, 'symbol'),
    amount: str(row, 'amount'),
  };
}

const DECODERS: Record<LedgerTemplate, (row: Row) => unknown> = {
  RFQ: decodeRfq,
  RfqInvitation: decodeInvitation,
  Quote: decodeQuote,
  AcceptedTrade: decodeTrade,
  SettlementInstruction: decodeInstruction,
  SettlementReceipt: decodeReceipt,
  TokenHolding: decodeHolding,
};

export function decodeCreated(event: CreatedEvent): {
  template: LedgerTemplate;
  contractId: string;
  payload: unknown;
} | null {
  const template = templateOf(event.templateId);
  if (!template) return null;
  return {
    template,
    contractId: event.contractId,
    payload: DECODERS[template](event.createArgument as Row),
  };
}

/* ── the activity tape ────────────────────────────────────────────────── */

/**
 * The party-scoped transaction stream, rendered as one line per created
 * contract. Only creates are logged: in this workflow every state change
 * archives and recreates, so the creates alone tell the whole story, and the
 * matching archive would double every line.
 *
 * `witnesses` comes from the participant's own `witnessParties`, so the tape
 * says who was disclosed the event rather than who this app thinks should have
 * been.
 */
export function eventsFrom(transactions: Transaction[]): LedgerEvent[] {
  const events: LedgerEvent[] = [];
  for (const tx of transactions) {
    for (const wrapper of tx.events) {
      const created = wrapper.CreatedEvent;
      if (!created) continue;
      const decoded = decodeCreated(created);
      if (!decoded) continue;
      events.push({
        id: `${created.offset}-${created.nodeId}`,
        at: created.createdAt as Instant,
        template: decoded.template,
        summary: summarise(decoded.template, decoded.payload),
        rfqId: rfqIdOf(decoded.payload),
        witnesses: created.witnessParties as Party[],
      });
    }
  }
  return events;
}

function rfqIdOf(payload: unknown): string | null {
  const row = payload as Row;
  return typeof row.rfqId === 'string' ? row.rfqId : null;
}

function amount(value: string, symbol: string): string {
  return `${format(value, { dp: precisionFor(symbol) })} ${symbol}`;
}

function summarise(template: LedgerTemplate, payload: unknown): string {
  switch (template) {
    case 'RFQ': {
      const p = payload as Rfq;
      if (p.status === 'Closed') return 'RFQ closed';
      if (p.status === 'Cancelled') return 'RFQ cancelled';
      return `RFQ raised — ${p.side} ${amount(p.quantity, p.asset)} against ${p.quoteCurrency}`;
    }
    case 'RfqInvitation':
      return 'Invitation issued';
    case 'Quote': {
      const p = payload as Quote;
      return `Quote submitted at ${format(p.price, { dp: precisionFor(p.quoteCurrency) })}`;
    }
    case 'AcceptedTrade': {
      const p = payload as AcceptedTrade;
      return `Trade agreed at ${format(p.price, { dp: precisionFor(p.quoteCurrency) })}`;
    }
    case 'SettlementInstruction':
      return 'Asset leg allocated';
    case 'SettlementReceipt': {
      const p = payload as SettlementReceipt;
      return `Settled ${amount(p.assetQuantity, p.asset)} against ${amount(p.paymentAmount, p.quoteCurrency)}`;
    }
    case 'TokenHolding': {
      const p = payload as TokenHolding;
      return `Holding ${amount(p.amount, p.symbol)}`;
    }
  }
}
