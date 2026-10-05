'use client';

import { cn } from '@/lib/cn';
import { Amount } from '@/components/primitives/Value';
import { PartyId } from '@/components/primitives/PartyTag';
import { Sealed } from '@/components/primitives/Sealed';
import { Table, Td, Th } from '@/components/primitives/Table';
import { Timestamp } from '@/components/primitives/Timestamp';
import { multiply } from '@/lib/decimal';
import { institutionOf, partyLabel } from '@/lib/ledger/parties';
import type { Contract, Party, Quote, Rfq } from '@/lib/ledger/types';
import type { FilledLeg } from '@/lib/ledger/view';

export function DealerQuoteBook({
  rfq,
  dealer,
  ownQuote,
  filled = null,
}: {
  rfq: Contract<Rfq>;
  dealer: Party;
  ownQuote: Contract<Quote> | null;
  /** Set once this dealer's own price has traded and left the Quote template. */
  filled?: FilledLeg | null;
}) {
  const { quoteCurrency, quantity, invitedDealers } = rfq.payload;
  const ordered = [dealer, ...invitedDealers.filter((d) => d !== dealer)];
  const ownFill = filled && filled.dealer === dealer ? filled : null;
  const ownPrice = ownQuote?.payload.price ?? ownFill?.price ?? null;
  const ownAt = ownQuote?.payload.submittedAt ?? ownFill?.at ?? null;

  return (
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
        </tr>
      </thead>
      <tbody>
        {ordered.map((party) => {
          const own = party === dealer;
          return (
            <tr
              key={party}
              className={cn(
                own
                  ? ownFill
                    ? 'bg-pos-wash'
                    : 'bg-accent-wash'
                  : '',
              )}
            >
              <Td num className="hidden text-ink-4 @min-[36rem]:table-cell">
                —
              </Td>
              <Td>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={cn('font-medium whitespace-nowrap', own ? 'text-ink' : 'text-ink-3')}>
                    {partyLabel(party)}
                  </span>
                  {own ? (
                    <span
                      className={cn(
                        'text-micro tracking-wider',
                        ownFill ? 'text-pos' : 'text-accent',
                      )}
                    >
                      {ownFill ? 'YOUR FILL' : 'YOUR QUOTE'}
                    </span>
                  ) : null}
                </div>
                <div className="text-mini text-ink-4">{institutionOf(party)}</div>
              </Td>
              <Td className="hidden @min-[54rem]:table-cell">
                <PartyId party={party} />
              </Td>
              <Td align="right">
                {own ? (
                  ownPrice ? (
                    <Amount
                      value={ownPrice}
                      symbol={quoteCurrency}
                      className={cn(
                        'text-sm font-medium',
                        ownFill ? 'text-pos' : 'text-accent',
                      )}
                    />
                  ) : (
                    <span className="text-mini text-ink-4">not submitted</span>
                  )
                ) : (
                  <span className="flex justify-end">
                    <Sealed width="w-16" />
                  </span>
                )}
              </Td>
              <Td align="right" className="hidden @min-[36rem]:table-cell">
                {own ? (
                  ownPrice ? (
                    <Amount value={multiply(quantity, ownPrice)} dp={2} className="text-ink-2" />
                  ) : (
                    <span className="text-ink-4">—</span>
                  )
                ) : (
                  <span className="flex justify-end">
                    <Sealed width="w-20" />
                  </span>
                )}
              </Td>
              <Td align="right" className="hidden @min-[48rem]:table-cell">
                <span className="text-ink-4">—</span>
              </Td>
              <Td align="right" className="hidden @min-[60rem]:table-cell">
                {own && ownAt ? (
                  <Timestamp iso={ownAt} />
                ) : (
                  <span className="text-ink-4">—</span>
                )}
              </Td>
            </tr>
          );
        })}
      </tbody>
      <caption className="caption-bottom px-3 py-2 text-left text-mini text-ink-4">
        Hatched cells mean this desk cannot read that dealer’s quote from the ledger.
        Only the treasury can compare prices.
      </caption>
    </Table>
  );
}
