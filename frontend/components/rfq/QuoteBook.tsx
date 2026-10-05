'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/primitives/Button';
import { Amount, BasisPoints } from '@/components/primitives/Value';
import { PartyId } from '@/components/primitives/PartyTag';
import { Table, Td, Th } from '@/components/primitives/Table';
import { Timestamp } from '@/components/primitives/Timestamp';
import { multiply } from '@/lib/decimal';
import { partyLabel, institutionOf } from '@/lib/ledger/parties';
import { rankQuotes } from '@/lib/ledger/selectors';
import type { Contract, Party, Quote, Rfq } from '@/lib/ledger/types';
import type { FilledLeg } from '@/lib/ledger/view';

type RowState = 'live' | 'accepted' | 'passed' | 'awaiting';

interface BookRow {
  key: string;
  dealer: Party;
  price: string | null;
  submittedAt: string | null;
  rank: number | null;
  awayBps: string;
  state: RowState;
  quoteContractId: string | null;
}

/**
 * Every price the treasury is a stakeholder on, ranked. Dealers who were
 * invited but have not answered stay on the book as open lines.
 */
export function QuoteBook({
  rfq,
  quotes,
  filled,
  onAccept,
  pendingKey,
}: {
  rfq: Contract<Rfq>;
  quotes: Contract<Quote>[];
  /** The price that traded, if one has. Kept out of `quotes` by the ledger. */
  filled: FilledLeg | null;
  onAccept: (quoteContractId: string) => void;
  pendingKey: string | null;
}) {
  const { side, quantity, quoteCurrency, asset, status, invitedDealers } = rfq.payload;
  const [reviewing, setReviewing] = useState<string | null>(null);
  const reviewedQuote = status === 'Open' ? quotes.find((quote) => quote.contractId === reviewing) : undefined;

  const asQuotes: Contract<Quote>[] = filled
    ? [
        ...quotes,
        {
          contractId: filled.contractId,
          payload: {
            ...rfq.payload,
            dealer: filled.dealer,
            price: filled.price,
            expiry: null,
            submittedAt: filled.at ?? new Date(0).toISOString(),
          },
        },
      ]
    : quotes;

  const ranked = rankQuotes(side, asQuotes);
  const rows: BookRow[] = ranked.map((r) => ({
    key: r.contract.contractId,
    dealer: r.contract.payload.dealer,
    price: r.contract.payload.price,
    submittedAt:
      filled && r.contract.contractId === filled.contractId
        ? filled.at
        : r.contract.payload.submittedAt,
    rank: r.rank,
    awayBps: r.awayBps,
    state:
      filled && r.contract.contractId === filled.contractId
        ? 'accepted'
        : status === 'Open'
          ? 'live'
          : 'passed',
    quoteContractId: r.contract.contractId,
  }));

  const quoted = new Set(rows.map((r) => r.dealer));
  for (const dealer of invitedDealers) {
    if (quoted.has(dealer)) continue;
    rows.push({
      key: `awaiting-${dealer}`,
      dealer,
      price: null,
      submittedAt: null,
      rank: null,
      awayBps: '0.0',
      state: 'awaiting',
      quoteContractId: null,
    });
  }

  return (
    <>
    {reviewedQuote ? (
      <section aria-label="Review quote" className="space-y-4 border-b border-line bg-raised p-4">
        <div>
          <h3 className="text-sm font-semibold">Accept {partyLabel(reviewedQuote.payload.dealer)}’s quote?</h3>
          <p className="mt-1 text-xs text-ink-2">This closes the request and commits both desks to the trade.</p>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <div><dt className="label">Unit price</dt><dd className="mt-1"><Amount value={reviewedQuote.payload.price} /> {quoteCurrency}</dd></div>
          <div><dt className="label">Total value</dt><dd className="mt-1 font-medium"><Amount value={multiply(quantity, reviewedQuote.payload.price)} dp={2} /> {quoteCurrency}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={Boolean(pendingKey)} busy={pendingKey === `accept:${reviewedQuote.contractId}`}
            onClick={() => onAccept(reviewedQuote.contractId)}>Confirm acceptance</Button>
          <Button disabled={Boolean(pendingKey)} onClick={() => setReviewing(null)}>Cancel</Button>
        </div>
      </section>
    ) : null}
    <Table>
      <thead>
        <tr>
          <Th className="hidden w-8 @min-[36rem]:table-cell">#</Th>
          <Th>Dealer</Th>
          <Th className="hidden @min-[54rem]:table-cell">Party</Th>
          <Th align="right">Price {quoteCurrency}</Th>
          <Th align="right" className="hidden @min-[36rem]:table-cell">
            Notional {quoteCurrency}
          </Th>
          <Th align="right" className="hidden @min-[48rem]:table-cell">
            vs best
          </Th>
          <Th align="right" className="hidden @min-[60rem]:table-cell">
            Received
          </Th>
          <Th align="right" className="w-24" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const best = row.rank === 1 && row.state !== 'awaiting';
          const won = row.state === 'accepted';
          return (
            <tr
              key={row.key}
              className={cn(
                'group transition-colors',
                won
                  ? 'bg-pos-wash'
                  : best
                    ? 'bg-accent-wash'
                    : 'hover:bg-raised',
              )}
            >
              <Td num className="hidden text-ink-4 @min-[36rem]:table-cell">
                {row.rank ?? '—'}
              </Td>
              <Td>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={cn('font-medium whitespace-nowrap', won ? 'text-pos' : 'text-ink')}>
                    {partyLabel(row.dealer)}
                  </span>
                  {won ? <span className="text-micro tracking-wider text-pos">FILLED</span> : null}
                  {best && !won ? (
                    <span className="text-micro tracking-wider text-accent">BEST</span>
                  ) : null}
                </div>
                <div className="text-mini text-ink-3">{institutionOf(row.dealer)}</div>
                {reviewing === row.quoteContractId && row.state === 'live' ? (
                  <span className="mt-1 block text-mini text-ink-2">Review before accepting</span>
                ) : null}
              </Td>
              <Td className="hidden @min-[54rem]:table-cell">
                <PartyId party={row.dealer} />
              </Td>
              <Td align="right">
                {row.price ? (
                  <Amount
                    value={row.price}
                    symbol={quoteCurrency}
                    className={cn(
                      'text-sm',
                      won ? 'font-medium text-pos' : best ? 'font-medium text-accent' : 'text-ink',
                    )}
                  />
                ) : (
                  <span className="text-mini text-ink-4">awaiting</span>
                )}
              </Td>
              <Td align="right" className="hidden @min-[36rem]:table-cell">
                {row.price ? (
                  <Amount
                    value={multiply(quantity, row.price)}
                    dp={2}
                    className="text-ink-2"
                  />
                ) : (
                  <span className="text-ink-4">—</span>
                )}
              </Td>
              <Td align="right" className="hidden @min-[48rem]:table-cell">
                {row.price ? <BasisPoints value={row.awayBps} /> : <span className="text-ink-4">—</span>}
              </Td>
              <Td align="right" className="hidden @min-[60rem]:table-cell">
                {row.submittedAt ? <Timestamp iso={row.submittedAt} /> : <span className="text-ink-4">—</span>}
              </Td>
              <Td align="right">
                {row.state === 'live' && row.quoteContractId ? (
                    <Button size="sm" variant={best ? 'primary' : 'secondary'} disabled={Boolean(pendingKey)}
                      aria-label={`Review ${partyLabel(row.dealer)} quote`}
                      onClick={() => setReviewing(row.quoteContractId)}>
                      Review
                    </Button>
                ) : row.state === 'passed' ? (
                  <span className="text-mini text-ink-4">not filled</span>
                ) : null}
              </Td>
            </tr>
          );
        })}
      </tbody>
      <caption className="caption-bottom px-3 py-2 text-left text-mini text-ink-4">
        {status === 'Open'
          ? 'Review a quote to check its total, then confirm to accept it and close this request.'
          : filled
            ? 'The accepted quote is shown alongside the remaining dealer prices. This request is closed.'
            : 'This request has ended. These quotes are available for reference.'}
        {' '}Prices are per {asset}; other dealers cannot see these quotes.
      </caption>
    </Table>
    </>
  );
}
