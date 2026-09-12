/**
 * The JSON shapes exchanged between the browser-side `CantonLedgerClient` and
 * this app's own route handlers. Shared by both sides so the proxy stays a
 * pass-through: no shape is invented in the middle.
 */

import type { LedgerEvent, LedgerErrorCode, LedgerTemplate } from './client';
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
import type { DemoRole } from './parties';

/* ── reads ────────────────────────────────────────────────────────────── */

export interface QueryRequest {
  asParty: Party;
  /** Templates to read. Omitted means every template in the workflow. */
  templates?: LedgerTemplate[];
  /** Include the party's slice of the transaction stream. */
  events?: boolean;
}

export interface WireContract {
  template: LedgerTemplate;
  contractId: ContractId;
  payload: unknown;
}

export interface QueryResponse {
  asParty: Party;
  at: Instant;
  offset: number;
  contracts: WireContract[];
  events: LedgerEvent[];
}

export interface TipResponse {
  offset: number;
}

export interface PartiesResponse {
  ids: Record<DemoRole, Party>;
  unresolved: DemoRole[];
  source: 'mock' | 'participant';
}

/* ── commands ─────────────────────────────────────────────────────────── */

export type CommandRequest =
  | {
      kind: 'createRfq';
      asParty: Party;
      rfqId?: string;
      asset: string;
      quoteCurrency: string;
      side: Side;
      quantity: Decimal;
      quoteDeadline: Instant | null;
      invitedDealers: Party[];
    }
  | { kind: 'closeRfq'; asParty: Party; rfqContractId: ContractId }
  | { kind: 'cancelRfq'; asParty: Party; rfqContractId: ContractId }
  | { kind: 'acceptQuote'; asParty: Party; quoteContractId: ContractId; rfqContractId: ContractId }
  | {
      kind: 'submitQuote';
      asParty: Party;
      invitationContractId: ContractId;
      price: Decimal;
      expiry: Instant | null;
    }
  | { kind: 'reviseQuote'; asParty: Party; quoteContractId: ContractId; newPrice: Decimal }
  | { kind: 'withdrawQuote'; asParty: Party; quoteContractId: ContractId }
  | { kind: 'declineInvitation'; asParty: Party; invitationContractId: ContractId }
  | {
      kind: 'allocateAsset';
      asParty: Party;
      tradeContractId: ContractId;
      assetHoldingCid: ContractId;
      auditor: Party | null;
    }
  | { kind: 'settle'; asParty: Party; instructionContractId: ContractId; paymentHoldingCid: ContractId };

export type CommandKind = CommandRequest['kind'];

/** Whatever the command produced that the acting party can see. */
export interface CommandResponse {
  offset: number;
  rfq?: Contract<Rfq>;
  invitation?: Contract<RfqInvitation>;
  quote?: Contract<Quote>;
  trade?: Contract<AcceptedTrade>;
  instruction?: Contract<SettlementInstruction>;
  receipt?: Contract<SettlementReceipt>;
  holdings?: Contract<TokenHolding>[];
}

/** How a `LedgerError` crosses the HTTP boundary without becoming an HTML 500. */
export interface WireError {
  error: { code: LedgerErrorCode; message: string };
}
