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
    <Table>
      <thead>
        <tr>
          <Th className="w-8">#</Th>
          <Th>Dealer</Th>
          <Th className="hidden lg:table-cell">Party</Th>
          <Th align="right">Price {quoteCurrency}</Th>
          <Th align="right" className="hidden sm:table-cell">
            Notional {quoteCurrency}
          </Th>
          <Th align="right" className="hidden md:table-cell">
            vs best
          </Th>
          <Th align="right" className="hidden md:table-cell">
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
              <Td num className="text-ink-4">
                {row.rank ?? '—'}
              </Td>
              <Td>
                <div className="flex items-baseline gap-2">
                  <span className={cn('font-medium whitespace-nowrap', won ? 'text-pos' : 'text-ink')}>
                    {partyLabel(row.dealer)}
                  </span>
                  {won ? <span className="text-micro tracking-wider text-pos">FILLED</span> : null}
                  {best && !won ? (
                    <span className="text-micro tracking-wider text-accent">BEST</span>
                  ) : null}
                </div>
                <div className="whitespace-nowrap text-mini text-ink-3">{institutionOf(row.dealer)}</div>
                {reviewing === row.quoteContractId && row.state === 'live' ? (
                  <span className="mt-1 block text-mini text-ink-2">Review before accepting</span>
                ) : null}
              </Td>
              <Td className="hidden lg:table-cell">
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
              <Td align="right" className="hidden sm:table-cell">
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
              <Td align="right" className="hidden md:table-cell">
                {row.price ? <BasisPoints value={row.awayBps} /> : <span className="text-ink-4">—</span>}
              </Td>
              <Td align="right" className="hidden md:table-cell">
                {row.submittedAt ? <Timestamp iso={row.submittedAt} /> : <span className="text-ink-4">—</span>}
              </Td>
              <Td align="right">
                {row.state === 'live' && row.quoteContractId ? (
                  reviewing === row.quoteContractId ? (
                    <div className="space-y-2">
                      <p className="text-mini text-ink-2">
                        Total <Amount value={multiply(quantity, row.price!)} dp={2} /> {quoteCurrency}
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" disabled={Boolean(pendingKey)} onClick={() => setReviewing(null)}>Cancel</Button>
                        <Button size="sm" variant="primary" disabled={Boolean(pendingKey)} busy={pendingKey === `accept:${row.quoteContractId}`}
                          aria-label={`Confirm acceptance of ${partyLabel(row.dealer)} quote`}
                          onClick={() => { if (row.quoteContractId) onAccept(row.quoteContractId); }}>
                          Confirm
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant={best ? 'primary' : 'secondary'} disabled={Boolean(pendingKey)}
                      aria-label={`Review ${partyLabel(row.dealer)} quote`}
                      onClick={() => setReviewing(row.quoteContractId)}>
                      Review
                    </Button>
                  )
                ) : row.state === 'passed' ? (
                  <span className="text-mini text-ink-4">not filled</span>
                ) : null}
              </Td>
            </tr>
          );
        })}
      </tbody>
      <caption className="caption-bottom px-3 py-2 text-left text-mini text-ink-4">
        Review a quote to check its total, then confirm to accept it and close this request.
        Prices are per {asset}; other dealers cannot see these quotes.
      </caption>
    </Table>
  );
}
