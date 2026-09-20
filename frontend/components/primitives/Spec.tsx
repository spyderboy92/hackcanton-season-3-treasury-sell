import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** A horizontal strip of labelled facts. Used for contract terms. */
export function SpecStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn('flex flex-wrap items-start gap-x-8 gap-y-3', className)}>{children}</dl>
  );
}

export function Spec({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="label mb-0.5">{label}</dt>
      <dd className="text-xs text-ink">{children}</dd>
    </div>
  );
}
