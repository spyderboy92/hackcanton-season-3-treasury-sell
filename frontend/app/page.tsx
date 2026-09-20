import Link from 'next/link';

import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { Wordmark } from '@/components/shell/Wordmark';
import { fingerprintOf, hintOf, OPERATING_IDENTITIES, routeFor } from '@/lib/ledger/parties';

const SESSION = [
  ['Ledger', 'in-memory fixture'],
  ['Instrument', 'cETH quoted in USD'],
  ['Dealer panel', '3 dealers, 1 auditor'],
  ['Settlement', 'atomic delivery versus payment'],
];

export default function EntitlementsGate() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
        <Wordmark />
        <ThemeToggle />
      </header>

      <main className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(0,29rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-10 border-b border-line px-6 py-10 lg:border-r lg:border-b-0 lg:px-8 lg:py-12">
          <div>
            <h1 className="max-w-[19ch] text-3xl leading-[1.08] font-semibold tracking-tight text-ink">
              Three dealers price the same trade. None of them sees the others.
            </h1>
            <div className="mt-6 h-px w-10 bg-accent" />
            <p className="mt-6 max-w-[52ch] text-sm leading-relaxed text-ink-2">
              A corporate treasury raises one request for quote. Each price comes back as a
              bilateral contract between the treasury and a single dealer, with no other observer on
              it. Losing dealers learn the request closed, and nothing more. An auditor is added to
              the settlement receipt alone.
            </p>
            <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-ink-3">
              Take a seat below. Every screen renders exactly the contracts that party is a
              stakeholder on. The gaps you will see are the ledger&rsquo;s, not this
              interface&rsquo;s.
            </p>
          </div>

          <dl className="grid max-w-sm grid-cols-[7.5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t border-line pt-5">
            {SESSION.map(([term, value]) => (
              <div key={term} className="contents">
                <dt className="label">{term}</dt>
                <dd className="num text-mini text-ink-2">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-6 py-4">
            <h2 className="text-sm font-medium tracking-tight text-ink">
              Select an operating identity
            </h2>
            <p className="text-mini text-ink-3">
              Entitlements come from signatory and observer sets on each contract
            </p>
          </div>

          <div>
            <ul className="border-t border-line">
            {OPERATING_IDENTITIES.map((info) => {
              const fp = fingerprintOf(info.party);
              return (
                <li key={info.party}>
                  <Link
                    href={routeFor(info)}
                    className="group grid grid-cols-1 gap-x-6 gap-y-1.5 border-b border-line border-l-2 border-l-transparent px-6 py-4 transition-colors hover:border-l-accent hover:bg-raised md:grid-cols-[16rem_minmax(0,1fr)_1.25rem]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium tracking-tight text-ink">
                          {info.institution}
                        </span>
                        <span className="text-mini text-ink-3">{info.label}</span>
                      </div>
                      <span className="num mt-0.5 block text-mini text-ink-4" title={info.party}>
                        <span className="text-ink-3">{hintOf(info.party)}</span>::{fp.slice(0, 10)}…
                      </span>
                    </div>
                    <p className="max-w-[60ch] self-center text-xs leading-relaxed text-ink-2">
                      {info.entitlement}
                    </p>
                    <span
                      aria-hidden
                      className="hidden self-center text-ink-4 transition-colors group-hover:text-accent md:inline"
                    >
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
            </ul>

            <div className="px-6 pt-6">
              <Link
                href="/demo"
                className="group flex flex-wrap items-center gap-x-5 gap-y-2 border border-accent-line px-4 py-3.5 transition-colors hover:bg-accent-wash"
              >
                <span className="text-sm font-medium tracking-tight text-accent">
                  Open the split view
                </span>
                <span className="min-w-0 flex-1 text-xs text-ink-2">
                  Treasury and one dealer side by side, reading the same ledger at the same moment.
                  Three prices on the left, one on the right.
                </span>
                <span aria-hidden className="text-accent">
                  ›
                </span>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
