/**
 * Ledger payload types.
 *
 * These mirror the Daml records in `daml/`, with two deliberate exceptions the
 * server decoder reconciles (see `lib/ledger/server/decode.ts`):
 *
 *  - `SettlementInstruction` stores `side` and `acceptedAt` on the ledger and
 *    derives buyer/seller from them, so that no denormalised copy can contradict
 *    the trade terms. The UI wants the parties named, so this type carries
 *    `buyer`/`seller` and drops `side`/`acceptedAt`; the decoder applies the same
 *    rule as `TreasuryRfq.Types.buyerOf`/`sellerOf`.
 *  - `RfqFill` has no type here at all. It is disclosed to the treasury alone and
 *    no screen renders it, so it stays internal to the ledger clients.
 *
 * Rules that must survive the swap from the mock to the real JSON Ledger API:
 *
 *  - `Party` is an opaque Canton party id, e.g. "Treasury-d4d9::1220e254...".
 *    Never construct one in the UI; only ever pass through what the ledger gave.
 *  - `Decimal` is a STRING over the wire. Never `parseFloat` money. Use the
 *    helpers in `lib/decimal.ts` for arithmetic, comparison and formatting.
 *  - Times are ISO-8601 UTC strings.
 *  - Every contract read from the ledger arrives wrapped as `Contract<T>`.
 */

export type Party = string;
export type ContractId = string;
/** Fixed-point decimal carried as a string, e.g. "3040.00". */
export type Decimal = string;
/** ISO-8601 instant, e.g. "2026-09-12T09:41:07.318Z". */
export type Instant = string;

export type Side = 'Buy' | 'Sell';
export type RfqStatus = 'Open' | 'Closed' | 'Cancelled';

/**
 * The committed transaction that created a contract: Canton's update id, plus
 * where to look it up when the network has a public explorer (CCView on DevNet).
 * The server decides `explorerUrl`; the browser never builds one.
 */
export interface LedgerRecord {
  /** Canton update id — the ledger transaction id. */
  updateId: string;
  /** Participant offset of that transaction; null in the mock, which has none. */
  offset: number | null;
  explorerUrl: string | null;
}

/** A contract as returned by the ledger: an id plus its payload. */
export interface Contract<T> {
  contractId: ContractId;
  payload: T;
  /** Set on settlement receipts: the transaction that settled the trade. */
  record?: LedgerRecord;
}

/** Shared market request. Terms only — never a price. */
export interface Rfq {
  rfqId: string;
  treasury: Party;
  asset: string;
  quoteCurrency: string;
  side: Side;
  quantity: Decimal;
  quoteDeadline: Instant | null;
  invitedDealers: Party[];
  status: RfqStatus;
}

/** Per-dealer private factory for SubmitQuote. Observer: that dealer only. */
export interface RfqInvitation {
  rfqId: string;
  treasury: Party;
  dealer: Party;
  asset: string;
  quoteCurrency: string;
  side: Side;
  quantity: Decimal;
  quoteDeadline: Instant | null;
}

/** Bilateral price. Signatories treasury + dealer, no observers. */
export interface Quote {
  rfqId: string;
  treasury: Party;
  dealer: Party;
  asset: string;
  quoteCurrency: string;
  side: Side;
  quantity: Decimal;
  price: Decimal;
  expiry: Instant | null;
  submittedAt: Instant;
}

/** Binding accepted terms. Signatories treasury + winning dealer. */
export interface AcceptedTrade {
  rfqId: string;
  treasury: Party;
  dealer: Party;
  asset: string;
  quoteCurrency: string;
  side: Side;
  quantity: Decimal;
  price: Decimal;
  acceptedAt: Instant;
}

/** Mock CIP-56-shaped holding. Signatory issuer, observer owner. */
export interface TokenHolding {
  issuer: Party;
  owner: Party;
  symbol: string;
  amount: Decimal;
}

/**
 * First leg of the two-step DvP (BUILD-SPEC D2). Not listed in spec section 3,
 * but the UI must render the half-settled state, so the payload is typed here.
 * Signatories treasury + dealer.
 */
export interface SettlementInstruction {
  rfqId: string;
  treasury: Party;
  dealer: Party;
  buyer: Party;
  seller: Party;
  asset: string;
  assetQuantity: Decimal;
  quoteCurrency: string;
  paymentAmount: Decimal;
  price: Decimal;
  assetHoldingCid: ContractId;
  auditor: Party | null;
}

/** Immutable post-trade evidence. Observer: the optional auditor. */
export interface SettlementReceipt {
  rfqId: string;
  treasury: Party;
  dealer: Party;
  buyer: Party;
  seller: Party;
  asset: string;
  assetQuantity: Decimal;
  quoteCurrency: string;
  paymentAmount: Decimal;
  price: Decimal;
  auditor: Party | null;
  settledAt: Instant;
}

/** `side` is expressed from the treasury's point of view. */
export function sellerOf(side: Side, treasury: Party, dealer: Party): Party {
  return side === 'Sell' ? treasury : dealer;
}

export function buyerOf(side: Side, treasury: Party, dealer: Party): Party {
  return side === 'Sell' ? dealer : treasury;
}
