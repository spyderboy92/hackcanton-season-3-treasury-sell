import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { Wordmark } from '@/components/shell/Wordmark';

/**
 * The frame shared by /login and /signup: the gate's header and two-column
 * split, with the thesis on the left and the form on the right. Stacks to one
 * column at phone width.
 */
export function AuthFrame({
  eyebrow,
  title,
  children,
  aside,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <Wordmark href="/login" />
        <ThemeToggle />
      </header>

      <main className="mx-auto grid w-full max-w-[100rem] flex-1 grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-8 border-b border-line px-4 py-8 sm:px-6 lg:border-r lg:border-b-0 lg:px-8 lg:py-12">
          <div>
            <p className="label mb-4">Private trading on Canton</p>
            <h1 className="max-w-[19ch] text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Request quotes.<br />Compare privately.<br />Settle together.
            </h1>
            <p className="mt-6 max-w-[52ch] text-sm leading-relaxed text-ink-2">
              Each account opens one desk. What a desk can read is decided by the ledger: a dealer
              sees its own price and nothing about its competitors, whoever is signed in.
            </p>
          </div>
          {aside}
        </div>

        <div className="min-w-0 px-4 py-8 sm:px-6 lg:py-12">
          <div className="mx-auto w-full max-w-md">
            <p className="label mb-2">{eyebrow}</p>
            <h2 className="mb-6 text-xl font-semibold tracking-tight text-ink">{title}</h2>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
