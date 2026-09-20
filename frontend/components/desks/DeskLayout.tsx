import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** Blotter / working area / context. The proportions of a dealing screen. */
export function DeskLayout({
  blotter,
  children,
  context,
  className,
}: {
  blotter: ReactNode;
  children: ReactNode;
  context: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid min-h-[calc(100dvh-5.25rem)] grid-cols-1',
        'xl:grid-cols-[12.5rem_minmax(0,1fr)_16.5rem]',
        className,
      )}
    >
      <aside className="border-b border-line xl:border-r xl:border-b-0">{blotter}</aside>
      <section className="min-w-0">{children}</section>
      <aside className="space-y-px border-t border-line bg-sunken p-3 xl:border-t-0 xl:border-l">
        {context}
      </aside>
    </div>
  );
}

export function BlotterHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex h-9 items-center justify-between gap-2 border-b border-line px-3">
      <span className="label">{title}</span>
      {actions}
    </div>
  );
}

export function DeskLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-6 text-mini text-ink-3">
      <span className="size-1.5 rounded-full bg-accent breathe" />
      {label}
    </div>
  );
}
