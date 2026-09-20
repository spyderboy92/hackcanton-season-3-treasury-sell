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
        'border border-line',
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
        'flex min-h-9 items-center gap-3 border-b border-line px-3 py-1.5',
        className,
      )}
    >
      <h2 className="text-xs font-medium tracking-tight text-ink">{title}</h2>
      {meta ? <div className="min-w-0 flex-1 text-mini text-ink-3">{meta}</div> : <div className="flex-1" />}
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </header>
  );
}

export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-3', className)}>{children}</div>;
}
