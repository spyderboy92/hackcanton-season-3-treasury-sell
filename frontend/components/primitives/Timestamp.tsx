'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';

function hhmmss(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** UTC clock time. Institutional desks do not show "3 minutes ago" on a fill. */
export function Timestamp({ iso, className }: { iso: string; className?: string }) {
  return (
    <span className={cn('num text-mini text-ink-3', className)} title={iso}>
      {hhmmss(iso)}
      <span className="ml-1 text-ink-4">UTC</span>
    </span>
  );
}

/** Counts down to the quote deadline. Renders nothing until mounted. */
export function Countdown({ iso, className }: { iso: string | null; className?: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!iso) return;
    const tick = () => setRemaining(Date.parse(iso) - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [iso]);

  if (!iso) return <span className={cn('text-mini text-ink-4', className)}>no deadline</span>;
  if (remaining === null) return <span className={cn('num text-mini text-ink-3', className)}>--:--</span>;

  const expired = remaining <= 0;
  const total = Math.max(0, Math.floor(remaining / 1000));
  const mm = Math.floor(total / 60);
  const ss = (total % 60).toString().padStart(2, '0');

  return (
    <span
      className={cn('num text-mini', expired ? 'text-neg' : total < 120 ? 'text-accent' : 'text-ink-2', className)}
    >
      {expired ? 'deadline passed' : `${mm}m ${ss}s`}
    </span>
  );
}
