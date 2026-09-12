/**
 * Read-only derivations over ledger payloads. No formatting, no JSX.
 */

import { basisPoints, compare, multiply } from '../decimal';
import type { AcceptedTrade, Contract, Party, Quote, Rfq, Side } from './types';

/** Notional value of a quote: quantity x price, exact. */
export function notional(quantity: string, price: string): string {
  return multiply(quantity, price);
}

/**
 * On a Sell RFQ the treasury wants the highest bid; on a Buy, the lowest offer.
 */
export function isBetter(side: Side, a: string, b: string): boolean {
  const c = compare(a, b);
  return side === 'Sell' ? c > 0 : c < 0;
}

export interface RankedQuote {
  rank: number;
  contract: Contract<Quote>;
  /** Distance from the best price, in basis points. 0 for the best quote. */
  awayBps: string;
  isBest: boolean;
}

/** Best price first. Ties break on the earlier submission. */
export function rankQuotes(side: Side, quotes: Contract<Quote>[]): RankedQuote[] {
  const sorted = [...quotes].sort((x, y) => {
    const c = compare(x.payload.price, y.payload.price);
    if (c !== 0) return side === 'Sell' ? -c : c;
    return Date.parse(x.payload.submittedAt) - Date.parse(y.payload.submittedAt);
  });
  const best = sorted[0]?.payload.price;
  return sorted.map((contract, i) => ({
    rank: i + 1,
    contract,
    awayBps: best ? basisPoints(contract.payload.price, best) : '0.0',
    isBest: i === 0,
  }));
}

export function bestQuote(side: Side, quotes: Contract<Quote>[]): Contract<Quote> | null {
  return rankQuotes(side, quotes)[0]?.contract ?? null;
}

/** Spread between best and worst quote, in basis points. */
export function quoteSpreadBps(side: Side, quotes: Contract<Quote>[]): string | null {
  const ranked = rankQuotes(side, quotes);
  const worst = ranked[ranked.length - 1];
  if (ranked.length < 2 || !worst) return null;
  return worst.awayBps.startsWith('-') ? worst.awayBps.slice(1) : worst.awayBps;
}

export function quoteOf(quotes: Contract<Quote>[], dealer: Party): Contract<Quote> | null {
  return quotes.find((q) => q.payload.dealer === dealer) ?? null;
}

export function tradeOf(trades: Contract<AcceptedTrade>[], rfqId: string): Contract<AcceptedTrade> | null {
  return trades.find((t) => t.payload.rfqId === rfqId) ?? null;
}

/** Most recently raised RFQ first. */
export function sortRfqs(rfqs: Contract<Rfq>[]): Contract<Rfq>[] {
  const weight: Record<Rfq['status'], number> = { Open: 0, Closed: 1, Cancelled: 2 };
  return [...rfqs].sort((a, b) => weight[a.payload.status] - weight[b.payload.status]);
}
