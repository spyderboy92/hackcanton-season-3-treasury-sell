/**
 * The contract between the UI and the ledger.
 *
 * Every component in this application reads and writes through `LedgerClient`
 * and nothing else. `mock.ts` implements it in memory; a Canton JSON Ledger API
 * implementation drops in behind the same interface with no component changes.
 *
 * Three rules the implementation must honour:
 *
 *  1. EVERY method is party-scoped. `asParty` is the acting party — the party
 *     the command is submitted as, and the party whose ACS is being read. A
 *     read must return exactly what that party is a stakeholder on, never more.
 *     Do not filter for privacy in the UI; the ledger decides.
 *  2. Reads return `Contract<T>` (id + payload), because commands need the id.
 *  3. Money is a decimal string end to end.
 */

import type {
  AcceptedTrade,
  Contract,
  ContractId,
  Decimal,
  Instant,
  Party,
  Quote,
  Rfq,
  RfqInvitation,
  SettlementInstruction,
  SettlementReceipt,
  Side,
  TokenHolding,
} from './types';

/* ── Commands ─────────────────────────────────────────────────────────── */

export interface CreateRfqCommand {
  /** Optional; the client mints a UUID-ish id when omitted. */
  rfqId?: string;
  asset: string;
  quoteCurrency: string;
  side: Side;
  quantity: Decimal;
  quoteDeadline: Instant | null;
  invitedDealers: Party[];
}

export interface SubmitQuoteCommand {
  invitationContractId: ContractId;
  price: Decimal;
  expiry: Instant | null;
}

export interface ReviseQuoteCommand {
  quoteContractId: ContractId;
  newPrice: Decimal;
}

/**
 * Accept is submitted as TWO SIBLING COMMANDS in ONE submission: exercise
 * `Accept` on the winning Quote and `Close` on the RFQ. Never nested — a losing
 * dealer is a stakeholder on the RFQ node only and must not see the Accept
 * subtree. (BUILD-SPEC section 2.)
 */
export interface AcceptQuoteCommand {
  quoteContractId: ContractId;
  rfqContractId: ContractId;
}

export interface AcceptQuoteResult {
  trade: Contract<AcceptedTrade>;
  rfq: Contract<Rfq>;
}

/** First DvP leg — exercised by the seller of the trade. */
export interface AllocateAssetCommand {
  tradeContractId: ContractId;
  assetHoldingCid: ContractId;
  auditor: Party | null;
}

/** Second DvP leg — exercised by the buyer; both transfers land atomically. */
export interface SettleCommand {
  instructionContractId: ContractId;
  paymentHoldingCid: ContractId;
}

/* ── Queries ──────────────────────────────────────────────────────────── */

export interface RfqFilter {
  rfqId?: string;
}

export interface HoldingFilter {
  symbol?: string;
}

/**
 * Everything one desk can see, in one round trip. The real client can implement
 * this as a single ACS query; the granular `list*` methods stay available for
 * targeted refreshes.
 */
export interface DeskSnapshot {
  asParty: Party;
  /** Ledger time the snapshot was taken. */
  at: Instant;
  rfqs: Contract<Rfq>[];
  invitations: Contract<RfqInvitation>[];
  quotes: Contract<Quote>[];
  trades: Contract<AcceptedTrade>[];
  instructions: Contract<SettlementInstruction>[];
  receipts: Contract<SettlementReceipt>[];
  holdings: Contract<TokenHolding>[];
  /** Transaction-stream entries this party was disclosed. */
  events: LedgerEvent[];
}

/** One entry of the party-scoped transaction stream. */
export interface LedgerEvent {
  id: string;
  at: Instant;
  /** Template the event happened on. */
  template: LedgerTemplate;
  /** Human-readable summary, already party-appropriate. */
  summary: string;
  rfqId: string | null;
  /** Parties disclosed this event. */
  witnesses: Party[];
}

export type LedgerTemplate =
  | 'RFQ'
  | 'RfqInvitation'
  | 'Quote'
  | 'AcceptedTrade'
  | 'SettlementInstruction'
  | 'SettlementReceipt'
  | 'TokenHolding';

/* ── Errors ───────────────────────────────────────────────────────────── */

export type LedgerErrorCode =
  | 'NOT_FOUND'
  | 'NOT_AUTHORIZED'
  | 'PRECONDITION_FAILED'
  | 'CONTRACT_NOT_ACTIVE'
  | 'INVALID_ARGUMENT'
  | 'UNAVAILABLE';

export class LedgerError extends Error {
  readonly code: LedgerErrorCode;

  constructor(code: LedgerErrorCode, message: string) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
  }
}

/* ── The client ───────────────────────────────────────────────────────── */

export type Unsubscribe = () => void;

export interface LedgerClient {
  /** Which backend is answering. Surfaced in the status rail. */
  readonly kind: 'mock' | 'canton';
  /** Endpoint description for the status rail, e.g. "127.0.0.1:6864". */
  readonly endpoint: string;

  /* Reads — all party-scoped, all returning only what `asParty` may see. */
  snapshot(asParty: Party): Promise<DeskSnapshot>;
  listRfqs(asParty: Party, filter?: RfqFilter): Promise<Contract<Rfq>[]>;
  getRfq(asParty: Party, rfqId: string): Promise<Contract<Rfq> | null>;
  listInvitations(asParty: Party, filter?: RfqFilter): Promise<Contract<RfqInvitation>[]>;
  listQuotes(asParty: Party, filter?: RfqFilter): Promise<Contract<Quote>[]>;
  listTrades(asParty: Party, filter?: RfqFilter): Promise<Contract<AcceptedTrade>[]>;
  listInstructions(asParty: Party, filter?: RfqFilter): Promise<Contract<SettlementInstruction>[]>;
  listReceipts(asParty: Party, filter?: RfqFilter): Promise<Contract<SettlementReceipt>[]>;
  listHoldings(asParty: Party, filter?: HoldingFilter): Promise<Contract<TokenHolding>[]>;

  /* Treasury commands. */
  createRfq(asParty: Party, command: CreateRfqCommand): Promise<Contract<Rfq>>;
  closeRfq(asParty: Party, rfqContractId: ContractId): Promise<Contract<Rfq>>;
  cancelRfq(asParty: Party, rfqContractId: ContractId): Promise<Contract<Rfq>>;
  acceptQuote(asParty: Party, command: AcceptQuoteCommand): Promise<AcceptQuoteResult>;

  /* Dealer commands. */
  submitQuote(asParty: Party, command: SubmitQuoteCommand): Promise<Contract<Quote>>;
  reviseQuote(asParty: Party, command: ReviseQuoteCommand): Promise<Contract<Quote>>;
  /** Archives the quote and hands the dealer its invitation back. */
  withdrawQuote(asParty: Party, quoteContractId: ContractId): Promise<Contract<RfqInvitation>>;
  declineInvitation(asParty: Party, invitationContractId: ContractId): Promise<void>;

  /* Settlement — two-step DvP. */
  allocateAsset(asParty: Party, command: AllocateAssetCommand): Promise<Contract<SettlementInstruction>>;
  settle(asParty: Party, command: SettleCommand): Promise<Contract<SettlementReceipt>>;

  /**
   * Notifies on any ledger change. The mock fires synchronously after each
   * command; a Canton client can back this with the transaction stream or a
   * poll. Components re-read through the same party-scoped methods.
   */
  subscribe(listener: () => void): Unsubscribe;

  /** Demo affordance. Absent on backends that cannot rewind. */
  reset?(): Promise<void>;
}
