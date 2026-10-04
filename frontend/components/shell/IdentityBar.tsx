import { fingerprintOf, hintOf, type PartyInfo } from '@/lib/ledger/parties';

export function IdentityBar({ info, right }: { info: PartyInfo; right?: React.ReactNode }) {
  const fp = fingerprintOf(info.party);
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line bg-sunken px-4 py-4 lg:px-6">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-lg font-semibold tracking-tight text-ink">{info.label} desk</span>
        <span className="text-xs text-ink-2">{info.institution}</span>
        <span className="num hidden text-micro text-ink-3 2xl:inline" title={info.party}>
          <span className="text-ink-2">{hintOf(info.party)}</span>
          <span className="text-ink-4">::</span>
          {fp.slice(0, 12)}
          <span className="text-ink-4">…{fp.slice(-4)}</span>
        </span>
      </div>
      <p className="min-w-0 basis-full text-mini text-ink-3 lg:flex-1 lg:basis-auto">
        <span className="text-ink-2">You can see: </span>
        {info.entitlement}
      </p>
      {right}
    </div>
  );
}
