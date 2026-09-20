import type { ReactNode } from 'react';

import { DeskNav } from './DeskNav';
import { LedgerStatus } from './LedgerStatus';
import { ThemeToggle } from './ThemeToggle';
import { Wordmark } from './Wordmark';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex h-11 shrink-0 items-center gap-4 border-b border-line bg-canvas/95 px-4 backdrop-blur">
        <Wordmark />
        <div className="hidden flex-1 md:block">
          <DeskNav />
        </div>
        <div className="flex flex-1 items-center justify-end gap-3 md:flex-none">
          <LedgerStatus />
          <ThemeToggle />
        </div>
      </header>
      <div className="border-b border-line px-4 py-1.5 md:hidden">
        <DeskNav />
      </div>
      <main className="flex-1">{children}</main>
    </div>
  );
}
