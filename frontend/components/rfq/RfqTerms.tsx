import { Amount } from '@/components/primitives/Value';
import { RfqStatusTag, SideTag } from '@/components/primitives/Status';
import { Spec, SpecStrip } from '@/components/primitives/Spec';
import { Countdown } from '@/components/primitives/Timestamp';
import type { Contract, Rfq } from '@/lib/ledger/types';

import { RfqRef } from './RfqRef';

/** The shared terms every invited party sees. Never contains a price. */
export function RfqTerms({ rfq, extra }: { rfq: Contract<Rfq>; extra?: React.ReactNode }) {
  const p = rfq.payload;
  return (
    <div className="mx-4 rounded-md border border-line bg-surface px-4 py-5 sm:px-5">
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <SideTag side={p.side} />
        <h1 className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-2xl font-semibold tracking-tight text-ink">
          <Amount value={p.quantity} symbol={p.asset} className="text-2xl" />
          <span className="text-ink-2">{p.asset}</span>
          <span className="text-xs font-normal text-ink-3">quoted in {p.quoteCurrency}</span>
        </h1>
        <div className="ml-auto">
          <RfqStatusTag status={p.status} />
        </div>
      </div>
      <SpecStrip>
        <Spec label="Reference">
          <RfqRef rfqId={p.rfqId} />
        </Spec>
        <Spec label="Quotes close">
          {p.status === 'Open' ? (
            <Countdown iso={p.quoteDeadline} className="text-xs" />
          ) : (
            <span className="text-xs text-ink-3">Quote window ended</span>
          )}
        </Spec>
        <Spec label="Invited">
          <span className="num text-xs">{p.invitedDealers.length}</span>
          <span className="ml-1 text-ink-3">dealers</span>
        </Spec>
        <Spec label="Settlement">
          <span className="text-xs text-ink-2">Asset and payment exchanged together</span>
        </Spec>
        {extra}
      </SpecStrip>
    </div>
  );
}
