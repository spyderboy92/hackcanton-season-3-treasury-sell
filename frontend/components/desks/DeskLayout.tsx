import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

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
        'grid min-h-[calc(100dvh-8rem)] grid-cols-1',
        'md:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_18rem]',
        className,
      )}
    >
      <aside className="min-w-0 border-b border-line bg-surface md:border-r md:border-b-0" aria-label="Request list">{blotter}</aside>
      <section className="min-w-0 pt-4">{children}</section>
      <aside className="min-w-0 space-y-px border-t border-line bg-sunken p-4 md:col-span-2 xl:col-span-1 xl:border-t-0 xl:border-l" aria-label="Positions and activity">
        {context}
      </aside>
    </div>
  );
}

export function BlotterHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex min-h-16 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
      <h2 className="text-sm font-semibold">{title}</h2>
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
