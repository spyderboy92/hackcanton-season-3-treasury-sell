'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';
import { DEALERS } from '@/lib/ledger/parties';

interface Item {
  href: string;
  label: string;
}

const ITEMS: Item[] = [
  { href: '/treasury', label: 'Treasury' },
  ...DEALERS.map((d) => ({ href: `/dealer/${d.slug}`, label: d.label })),
  { href: '/auditor', label: 'Auditor' },
];

export function DeskNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1" aria-label="Switch desk">
      <span className="mr-2 text-mini text-ink-3">View as</span>
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-9 items-center rounded-xs px-3 py-2 text-mini font-medium transition-colors',
              active ? 'bg-raised text-ink' : 'text-ink-3 hover:bg-surface hover:text-ink',
            )}
          >
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/demo"
        aria-current={pathname === '/demo' ? 'page' : undefined}
        className={cn(
          'inline-flex min-h-9 items-center rounded-xs px-3 py-2 text-mini transition-colors',
          pathname === '/demo'
            ? 'bg-raised text-ink'
            : 'text-ink-3 hover:bg-surface hover:text-ink',
        )}
      >
        Compare views
      </Link>
    </nav>
  );
}
