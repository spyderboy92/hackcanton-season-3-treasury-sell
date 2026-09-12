import { cn } from '@/lib/cn';
import { Panel, PanelBody, PanelHeader } from '@/components/primitives/Panel';
import { Timestamp } from '@/components/primitives/Timestamp';
import type { LedgerEvent } from '@/lib/ledger/client';

const TEMPLATE_TONE: Record<string, string> = {
  RFQ: 'text-ink-2',
  RfqInvitation: 'text-ink-3',
  Quote: 'text-accent',
  AcceptedTrade: 'text-pos',
  SettlementInstruction: 'text-ink-2',
  SettlementReceipt: 'text-pos',
  TokenHolding: 'text-ink-3',
};

/**
 * The transaction stream as this party witnessed it. What is absent from the
 * tape is the point: a losing dealer never sees the accept.
 */
export function ActivityTape({
  events,
  limit = 6,
  variant = 'panel',
}: {
  events: LedgerEvent[];
  limit?: number;
  variant?: 'panel' | 'flush';
}) {
  const title = 'Disclosed to this party';
  const meta = `${events.length} event${events.length === 1 ? '' : 's'}`;

  const list =
    events.length === 0 ? (
      <p className="px-3 py-3 text-mini text-ink-3">
        Nothing on the transaction stream has named this party yet.
      </p>
    ) : (
      <ol>
        {events.slice(0, limit).map((e) => (
          <li
            key={e.id}
            className={cn(
              'border-b border-line-quiet last:border-b-0',
              variant === 'panel' ? 'px-3 py-2' : 'flex items-baseline gap-3 px-4 py-1.5',
            )}
          >
            {variant === 'flush' ? (
              <>
                <Timestamp iso={e.at} />
                <span className={cn('num w-28 shrink-0 text-micro', TEMPLATE_TONE[e.template] ?? 'text-ink-3')}>
                  {e.template}
                </span>
                <span className="min-w-0 flex-1 text-mini text-ink-2">{e.summary}</span>
              </>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn('num text-micro', TEMPLATE_TONE[e.template] ?? 'text-ink-3')}>
                    {e.template}
                  </span>
                  <Timestamp iso={e.at} />
                </div>
                <p className="mt-0.5 text-mini text-ink-2">{e.summary}</p>
              </>
            )}
          </li>
        ))}
      </ol>
    );

  if (variant === 'flush') {
    return (
      <div className="border-t border-line">
        <div className="flex items-baseline gap-3 border-b border-line bg-sunken px-4 py-1.5">
          <span className="label">{title}</span>
          <span className="num text-micro text-ink-4">{meta}</span>
        </div>
        {list}
      </div>
    );
  }

  return (
    <Panel>
      <PanelHeader title={title} meta={meta} />
      <PanelBody className="p-0">{list}</PanelBody>
    </Panel>
  );
}
