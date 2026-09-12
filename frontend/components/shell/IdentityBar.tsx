import { fingerprintOf, hintOf, type PartyInfo } from '@/lib/ledger/parties';

/**
 * Who the interface is acting as, and what that identity is entitled to read.
 * Present on every desk — the acting party is never ambiguous.
 */
export function IdentityBar({ info, right }: { info: PartyInfo; right?: React.ReactNode }) {
  const fp = fingerprintOf(info.party);
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-sunken px-4 py-2">
      <div className="flex items-baseline gap-2.5">
        <span className="text-sm font-semibold tracking-tight text-ink">{info.institution}</span>
        <span className="num text-mini text-ink-3" title={info.party}>
          <span className="text-ink-2">{hintOf(info.party)}</span>
          <span className="text-ink-4">::</span>
          {fp.slice(0, 12)}
          <span className="text-ink-4">…{fp.slice(-4)}</span>
        </span>
      </div>
      <p className="min-w-0 flex-1 text-mini text-ink-3">
        <span className="text-ink-2">Reads: </span>
        {info.entitlement}
      </p>
      {right}
    </div>
  );
}
