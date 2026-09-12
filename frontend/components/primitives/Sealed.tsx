import { cn } from '@/lib/cn';

/**
 * A value that exists on the ledger but is outside this party's entitlement.
 * Rendered as a redaction rather than an absence, so the omission is legible.
 */
export function Sealed({
  width = 'w-20',
  label,
  className,
}: {
  width?: string;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden
        className={cn('sealed inline-block h-3.5 border border-line-hi/60', width)}
      />
      <span className="sr-only">Not visible to this party</span>
      {label ? <span className="text-mini text-ink-4">{label}</span> : null}
    </span>
  );
}
