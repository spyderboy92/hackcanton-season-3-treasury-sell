import { cn } from '@/lib/cn';
import { fingerprintOf, hintOf, institutionOf, partyLabel } from '@/lib/ledger/parties';
import type { Party } from '@/lib/ledger/types';

/** Party id rendered the way a ledger operator expects to see it. */
export function PartyId({
  party,
  keep = 6,
  className,
}: {
  party: Party;
  keep?: number;
  className?: string;
}) {
  const fp = fingerprintOf(party);
  return (
    <span className={cn('num text-mini text-ink-3', className)} title={party}>
      <span className="text-ink-2">{hintOf(party)}</span>
      {fp ? (
        <>
          <span className="text-ink-4">::</span>
          {fp.slice(0, keep)}
          <span className="text-ink-4">…</span>
        </>
      ) : null}
    </span>
  );
}

export function PartyName({
  party,
  withInstitution = false,
  className,
}: {
  party: Party;
  withInstitution?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      <span className="font-medium text-ink">{partyLabel(party)}</span>
      {withInstitution ? (
        <span className="text-mini text-ink-3">{institutionOf(party)}</span>
      ) : null}
    </span>
  );
}
