import type { ReactNode } from 'react';

import { DeskNav } from './DeskNav';
import { LedgerStatus } from './LedgerStatus';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { Wordmark } from './Wordmark';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#desk-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-4 focus:z-50 focus:rounded-xs focus:bg-accent focus:p-3 focus:text-accent-ink">
        Skip to workspace
      </a>
      <header className="sticky top-0 z-30 flex min-h-16 shrink-0 flex-wrap items-center gap-4 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur lg:px-6">
        <Wordmark />
        <div className="hidden flex-1 xl:block">
          <DeskNav />
        </div>
        <div className="flex flex-1 items-center justify-end gap-3 xl:flex-none">
          <LedgerStatus />
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>
      <div className="border-b border-line px-4 py-3 xl:hidden">
        <DeskNav />
      </div>
      <main id="desk-content" tabIndex={-1} className="mx-auto w-full max-w-[100rem] flex-1">{children}</main>
    </div>
  );
}
