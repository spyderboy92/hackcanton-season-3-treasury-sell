import Link from 'next/link';

/**
 * The mark is the thesis: one shared outline, one private filled square inside
 * it that only one party can see.
 */
export function Wordmark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5 whitespace-nowrap">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0">
        <rect x="0.5" y="0.5" width="13" height="13" fill="none" stroke="var(--ink-3)" />
        <rect x="3" y="3" width="4" height="4" fill="var(--accent)" />
        <rect x="8" y="8" width="3" height="3" fill="var(--ink-4)" />
      </svg>
      <span className="text-xs font-semibold tracking-tight text-ink">Treasury RFQ</span>
      <span className="hidden text-mini text-ink-4 lg:inline">Canton</span>
    </Link>
  );
}
