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
    <nav className="flex items-center" aria-label="Desks">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative border-r border-line px-3 py-1 text-mini transition-colors first:border-l',
              active ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {active ? (
              <span className="absolute inset-x-0 -bottom-px h-px bg-accent" aria-hidden />
            ) : null}
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/demo"
        aria-current={pathname === '/demo' ? 'page' : undefined}
        className={cn(
          'ml-2 border px-3 py-1 text-mini transition-colors',
          pathname === '/demo'
            ? 'border-accent text-accent'
            : 'border-line text-ink-3 hover:border-line-hi hover:text-ink-2',
        )}
      >
        Split view
      </Link>
    </nav>
  );
}
