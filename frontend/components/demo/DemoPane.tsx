import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { PartyId } from '@/components/primitives/PartyTag';
import type { Party } from '@/lib/ledger/types';

import { VisibilityMeter } from './VisibilityMeter';

export function DemoPane({
  party,
  title,
  role,
  visible,
  total,
  tone,
  toolbar,
  children,
  className,
}: {
  party: Party;
  title: string;
  role: string;
  visible: number;
  total: number;
  tone: 'accent' | 'quiet';
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col bg-canvas', className)}>
      <header className="border-b border-line bg-surface px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2.5">
              <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
              <span className="text-mini text-ink-3">{role}</span>
            </div>
            <PartyId party={party} keep={10} className="mt-0.5 block" />
          </div>
          {toolbar}
        </div>
        <div className="mt-3">
          <VisibilityMeter visible={visible} total={total} tone={tone} />
        </div>
      </header>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
