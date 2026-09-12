/**
 * Party-scoped projection of a snapshot onto one RFQ. Pure; no formatting.
 */

import type { DeskSnapshot } from './client';
import type {
  AcceptedTrade,
  Contract,
  Decimal,
  Instant,
  Party,
  Quote,
  Rfq,
  RfqInvitation,
  SettlementInstruction,
  SettlementReceipt,
} from './types';
import { sortRfqs } from './selectors';

export interface RfqView {
  rfq: Contract<Rfq>;
  /** Live invitation held by the acting party, if it still has one. */
  invitation: Contract<RfqInvitation> | null;
  /** Only ever what the acting party is a stakeholder on. */
  quotes: Contract<Quote>[];
  trade: Contract<AcceptedTrade> | null;
  instruction: Contract<SettlementInstruction> | null;
  receipt: Contract<SettlementReceipt> | null;
}

export function rfqView(snapshot: DeskSnapshot, rfqId: string): RfqView | null {
  const rfq = snapshot.rfqs.find((r) => r.payload.rfqId === rfqId);
  if (!rfq) return null;
  const on = <T extends { rfqId: string }>(rows: Contract<T>[]) =>
    rows.filter((r) => r.payload.rfqId === rfqId);
  return {
    rfq,
    invitation: on(snapshot.invitations)[0] ?? null,
    quotes: on(snapshot.quotes),
    trade: on(snapshot.trades)[0] ?? null,
    instruction: on(snapshot.instructions)[0] ?? null,
    receipt: on(snapshot.receipts)[0] ?? null,
  };
}

/** The RFQ a desk should land on: the first open one, else the most recent. */
export function defaultRfqId(snapshot: DeskSnapshot | null): string | null {
  if (!snapshot) return null;
  return sortRfqs(snapshot.rfqs)[0]?.payload.rfqId ?? null;
}

export function holdingFor(
  snapshot: DeskSnapshot,
  owner: Party,
  symbol: string,
): Contract<{ issuer: Party; owner: Party; symbol: string; amount: string }> | null {
  return snapshot.holdings.find((h) => h.payload.owner === owner && h.payload.symbol === symbol) ?? null;
}

/** The one price that traded, wherever it currently lives in the DvP flow. */
export interface FilledLeg {
  dealer: Party;
  price: Decimal;
  /** Null between allocation and settlement, where no timestamp exists yet. */
  at: Instant | null;
  contractId: string;
}

export function filledLeg(view: RfqView): FilledLeg | null {
  if (view.trade) {
    const t = view.trade.payload;
    return { dealer: t.dealer, price: t.price, at: t.acceptedAt, contractId: view.trade.contractId };
  }
  if (view.instruction) {
    const i = view.instruction.payload;
    return { dealer: i.dealer, price: i.price, at: null, contractId: view.instruction.contractId };
  }
  if (view.receipt) {
    const r = view.receipt.payload;
    return { dealer: r.dealer, price: r.price, at: r.settledAt, contractId: view.receipt.contractId };
  }
  return null;
}
