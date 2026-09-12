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

/**
 * The same book, from a dealer's seat. Deliberately the same columns as the
 * treasury view so the redactions line up with the data they replace.
 *
 * The dealer knows who else was invited — `invitedDealers` is a field on the
 * shared RFQ it observes. It does not and cannot know their prices.
 */
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
        </tr>
      </thead>
      <tbody>
        {ordered.map((party) => {
          const own = party === dealer;
          return (
            <tr
              key={party}
              className={cn(
                'border-l-2',
                own
                  ? ownFill
                    ? 'border-l-pos bg-pos-wash'
                    : 'border-l-accent bg-accent-wash'
                  : 'border-l-transparent',
              )}
            >
              <Td num className="text-ink-4">
                —
              </Td>
              <Td>
                <div className="flex items-baseline gap-2">
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
                <div className="whitespace-nowrap text-mini text-ink-4">{institutionOf(party)}</div>
              </Td>
              <Td className="hidden lg:table-cell">
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
              <Td align="right" className="hidden sm:table-cell">
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
              <Td align="right" className="hidden md:table-cell">
                <span className="text-ink-4">—</span>
              </Td>
              <Td align="right" className="hidden md:table-cell">
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
        Hatched cells are contracts this party is not a stakeholder on. They are absent from its
        active contract set, not hidden by this interface. Ranking needs every price, so it cannot
        be computed here.
      </caption>
    </Table>
  );
}
