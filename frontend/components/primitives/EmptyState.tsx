import type { ReactNode } from 'react';

/**
 * Emptiness with a reason. Every blank surface in this app explains which
 * entitlement produced it, so nothing reads as a failed load.
 */
export function EmptyState({
  headline,
  body,
  footnote,
  action,
}: {
  headline: string;
  body: ReactNode;
  footnote?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 px-4 py-8">
      <div className="mb-1 h-px w-8 bg-accent" />
      <p className="text-sm font-medium text-ink">{headline}</p>
      <p className="max-w-[54ch] text-xs leading-relaxed text-ink-2">{body}</p>
      {footnote ? <p className="max-w-[54ch] text-mini text-ink-3">{footnote}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
