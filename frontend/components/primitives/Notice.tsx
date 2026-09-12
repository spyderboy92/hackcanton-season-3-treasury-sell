import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** Command rejection. Says what the ledger refused, not "something went wrong". */
export function Notice({
  tone = 'bad',
  children,
  onDismiss,
}: {
  tone?: 'bad' | 'good' | 'neutral';
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 border-l-2 px-3 py-2 text-xs',
        tone === 'bad' && 'border-neg bg-neg-wash text-ink',
        tone === 'good' && 'border-pos bg-pos-wash text-ink',
        tone === 'neutral' && 'border-line-hi bg-raised text-ink-2',
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-ink-3 hover:text-ink"
          aria-label="Dismiss"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
