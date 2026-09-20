import { cn } from '@/lib/cn';
import type { RfqStatus } from '@/lib/ledger/types';

type Tone = 'live' | 'inert' | 'good' | 'bad';

const DOT: Record<Tone, string> = {
  live: 'bg-accent',
  inert: 'bg-ink-4',
  good: 'bg-pos',
  bad: 'bg-neg',
};

const TEXT: Record<Tone, string> = {
  live: 'text-accent',
  inert: 'text-ink-3',
  good: 'text-pos',
  bad: 'text-neg',
};

export function StatusTag({
  tone,
  children,
  pulse = false,
}: {
  tone: Tone;
  children: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-mini', TEXT[tone])}>
      <span className={cn('size-1.5 rounded-full', DOT[tone], pulse && 'breathe')} />
      {children}
    </span>
  );
}

const RFQ_TONE: Record<RfqStatus, Tone> = {
  Open: 'live',
  Closed: 'inert',
  Cancelled: 'bad',
};

const RFQ_WORD: Record<RfqStatus, string> = {
  Open: 'Open for quotes',
  Closed: 'Closed',
  Cancelled: 'Cancelled',
};

export function RfqStatusTag({ status }: { status: RfqStatus }) {
  return (
    <StatusTag tone={RFQ_TONE[status]} pulse={status === 'Open'}>
      {RFQ_WORD[status]}
    </StatusTag>
  );
}

/** SELL / BUY marker. The side is structural, so it gets a border not a fill. */
export function SideTag({ side }: { side: 'Buy' | 'Sell' }) {
  return (
    <span
      className={cn(
        'num inline-flex h-4.5 items-center border px-1 text-micro font-medium tracking-widest',
        side === 'Sell' ? 'border-neg/50 text-neg' : 'border-pos/50 text-pos',
      )}
    >
      {side === 'Sell' ? 'SELL' : 'BUY'}
    </span>
  );
}
