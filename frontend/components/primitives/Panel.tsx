import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export function Panel({
  children,
  className,
  tone = 'default',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'sunken';
}) {
  return (
    <section
      className={cn(
        'min-w-0 overflow-hidden rounded-md border border-line',
        tone === 'sunken' ? 'bg-sunken' : 'bg-surface',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3',
        className,
      )}
    >
      <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
      {meta ? <div className="min-w-0 flex-1 text-mini text-ink-3">{meta}</div> : <div className="flex-1" />}
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </header>
  );
}

export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-4', className)}>{children}</div>;
}
