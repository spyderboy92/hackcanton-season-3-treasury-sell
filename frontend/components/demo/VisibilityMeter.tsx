import { cn } from '@/lib/cn';

/**
 * How many of the RFQ's prices are in this party's active contract set.
 * Filled cells are contracts it holds; hatched cells are contracts that exist
 * on the ledger and are not addressed to it.
 */
export function VisibilityMeter({
  visible,
  total,
  tone = 'accent',
}: {
  visible: number;
  total: number;
  tone?: 'accent' | 'quiet';
}) {
  return (
    <div className="flex items-end gap-4">
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            'num text-4xl leading-none font-medium tracking-tight',
            tone === 'accent' ? 'text-accent' : 'text-ink',
          )}
        >
          {visible}
        </span>
        <span className="num text-lg leading-none text-ink-4">/{total}</span>
      </div>
      <div className="flex gap-1 pb-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-6 w-3.5 border',
              i < visible
                ? tone === 'accent'
                  ? 'border-accent bg-accent'
                  : 'border-ink-2 bg-ink-2'
                : 'sealed border-line-hi',
            )}
          />
        ))}
      </div>
      <p className="pb-0.5 text-mini leading-tight text-ink-3">
        prices in this
        <br />
        party&rsquo;s contract set
      </p>
    </div>
  );
}
