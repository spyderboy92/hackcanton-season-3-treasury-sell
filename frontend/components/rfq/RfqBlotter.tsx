'use client';

import { cn } from '@/lib/cn';
import { Amount } from '@/components/primitives/Value';
import { StatusTag } from '@/components/primitives/Status';
import { sortRfqs } from '@/lib/ledger/selectors';
import type { Contract, Rfq } from '@/lib/ledger/types';

import { RfqRef } from './RfqRef';

const TONE = { Open: 'live', Closed: 'inert', Cancelled: 'bad' } as const;

export function RfqBlotter({
  rfqs,
  selected,
  onSelect,
}: {
  rfqs: Contract<Rfq>[];
  selected: string | null;
  onSelect: (rfqId: string) => void;
}) {
  if (rfqs.length === 0) {
    return (
      <p className="px-3 py-4 text-mini text-ink-3">
        No RFQ is addressed to this party yet.
      </p>
    );
  }
  return (
    <ul>
      {sortRfqs(rfqs).map(({ contractId, payload }) => {
        const active = payload.rfqId === selected;
        return (
          <li key={contractId}>
            <button
              type="button"
              onClick={() => onSelect(payload.rfqId)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'w-full border-b border-line-quiet border-l-2 px-3 py-2.5 text-left transition-colors',
                active
                  ? 'border-l-accent bg-accent-wash'
                  : 'border-l-transparent hover:bg-raised',
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <RfqRef rfqId={payload.rfqId} className={active ? 'text-ink' : 'text-ink-2'} />
                <span
                  className={cn(
                    'num text-micro tracking-widest',
                    payload.side === 'Sell' ? 'text-neg' : 'text-pos',
                  )}
                >
                  {payload.side.toUpperCase()}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-mini text-ink-2">
                  <Amount value={payload.quantity} symbol={payload.asset} className="text-mini" />{' '}
                  {payload.asset}
                </span>
                <StatusTag tone={TONE[payload.status]} pulse={payload.status === 'Open'}>
                  {payload.status}
                </StatusTag>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
