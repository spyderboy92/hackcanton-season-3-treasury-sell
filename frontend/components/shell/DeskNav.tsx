'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';
import { navFor } from '@/lib/auth/access';
import { useSession } from '@/lib/auth/SessionProvider';
import { infoForRole } from '@/lib/ledger/parties';

/**
 * The desks the signed-in user may open — and only those. A dealer sees its own
 * desk; the treasury sees its desk and the split "Compare views" screen; the
 * auditor sees its own. Hiding the others is courtesy (middleware would bounce
 * the click anyway); the API's `asParty` check is what actually stops them.
 *
 * Built at render time, not module load, so dealer labels come from the
 * on-ledger directory once <PartyBootstrap> has applied it.
 */
export function DeskNav() {
  const pathname = usePathname();
  const user = useSession();
  if (!user) return null;
  const items = navFor(user, (seat) => infoForRole(seat).label);

  return (
    <nav className="flex flex-wrap items-center gap-1" aria-label="Your desks">
      <span className="mr-2 text-mini text-ink-3">{items.length > 1 ? 'Desks' : 'Desk'}</span>
      {items.map((item) => {
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
    </nav>
  );
}
