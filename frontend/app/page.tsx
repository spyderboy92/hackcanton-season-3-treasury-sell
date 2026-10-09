import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { LedgerStatus } from '@/components/shell/LedgerStatus';
import { UserMenu } from '@/components/shell/UserMenu';
import { Wordmark } from '@/components/shell/Wordmark';
import { canOpen, homeFor } from '@/lib/auth/access';
import { currentSession } from '@/lib/auth/server/request';
import { fingerprintOf, OPERATING_IDENTITIES, routeFor, shortHintOf } from '@/lib/ledger/parties';

const SESSION = [
  ['Instrument', 'cETH quoted in USD'],
  ['Dealer panel', '3 dealers, 1 auditor'],
  ['Settlement', 'atomic delivery versus payment'],
];

/**
 * The landing page for a signed-in user. It used to offer every desk; now it
 * offers the ones this account may open — one for a dealer or the auditor, the
 * treasury desk plus the split comparison for the treasury. The other desks
 * are not hidden for privacy (the ledger already would not serve them); they
 * are hidden because a link that only bounces back is noise.
 */
export default async function EntitlementsGate() {
  const session = await currentSession();
  // Middleware already sends anonymous visitors to /login; this covers a
  // cookie that expired between the two checks.
  if (!session) redirect('/login');
  const home = homeFor(session);
  const identities = OPERATING_IDENTITIES.filter((info) => canOpen(session, routeFor(info)));
  const mayCompare = canOpen(session, '/demo');

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-3">
        <Wordmark />
        <div className="flex items-center gap-3"><LedgerStatus /><ThemeToggle /><UserMenu /></div>
      </header>

      <main className="mx-auto grid w-full max-w-[100rem] flex-1 grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-10 border-b border-line px-6 py-10 lg:border-r lg:border-b-0 lg:px-8 lg:py-12">
          <div>
            <p className="label mb-4">Private trading on Canton</p>
            <h1 className="max-w-[19ch] text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Request quotes.<br />Compare privately.<br />Settle together.
            </h1>
            <p className="mt-6 max-w-[52ch] text-sm leading-relaxed text-ink-2">
              Invite dealers to price a trade, compare their private quotes, then exchange
              assets and payment together. Each dealer sees only its own price.
            </p>
            <Link href={home} className="mt-8 inline-flex min-h-11 items-center justify-center rounded-xs bg-accent px-5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hi">
              Open your desk <span aria-hidden className="ml-4">→</span>
            </Link>
            <p className="mt-3 text-mini text-ink-3">
              Signed in as <span className="num text-ink-2">{session.username}</span> ({session.userType}).
            </p>
            <ol className="mt-8 space-y-4 border-t border-line pt-6">
              {[
                ['Request', 'Set your terms and invite dealers.'],
                ['Compare', 'Review prices and accept a quote.'],
                ['Settle', 'Allocate assets, then exchange both legs.'],
              ].map(([title, detail], index) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-raised text-micro text-ink-2">{index + 1}</span>
                  <div><span className="text-sm font-medium">{title}</span><p className="text-xs text-ink-3">{detail}</p></div>
                </li>
              ))}
            </ol>
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

        <div className="min-w-0 px-4 py-6 sm:px-6 lg:py-12">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-6 py-4">
            <h2 className="text-sm font-medium tracking-tight text-ink">
              {identities.length > 1 || mayCompare ? 'Your perspectives' : 'Your desk'}
            </h2>
            <p className="text-mini text-ink-3">
              Each desk sees only what the ledger allows it to read
            </p>
          </div>

          <div>
            <ul className="overflow-hidden rounded-md border border-line bg-surface">
            {identities.map((info) => {
              const fp = fingerprintOf(info.party);
              return (
                <li key={info.party}>
                  <Link
                    href={routeFor(info)}
                    className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 border-b border-line px-5 py-5 transition-colors hover:bg-raised"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-medium tracking-tight text-ink">
                          {info.institution}
                        </span>
                        <span className="text-mini text-ink-3">{info.label}</span>
                      </div>
                      <span className="num mt-1 block text-micro text-ink-4" title={info.party}>
                        <span className="text-ink-3">{shortHintOf(info.party)}</span>::{fp.slice(0, 10)}…
                      </span>
                    </div>
                    <p className="col-start-1 max-w-[60ch] text-xs leading-relaxed text-ink-2">
                      {info.entitlement}
                    </p>
                    <span
                      aria-hidden
                      className="col-start-2 row-start-1 self-center text-lg text-ink-3 transition-colors group-hover:text-ink"
                    >
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
            </ul>

            {mayCompare ? (
            <div className="pt-6">
              <Link
                href="/demo"
                className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 rounded-md border border-line bg-surface px-5 py-5 transition-colors hover:bg-raised"
              >
                <span className="text-sm font-medium tracking-tight text-accent">
                  Compare treasury and dealer views
                </span>
                <span className="col-start-1 row-start-2 text-xs text-ink-2">
                  Treasury and one dealer side by side, reading the same ledger at the same moment.
                  Three prices on the left, one on the right.
                </span>
                <span aria-hidden className="col-start-2 row-span-2 row-start-1 self-center text-accent">
                  ›
                </span>
              </Link>
            </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
