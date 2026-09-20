'use client';

import { AppShell } from '@/components/shell/AppShell';
import { IdentityBar } from '@/components/shell/IdentityBar';
import { EmptyState } from '@/components/primitives/EmptyState';
import { Panel, PanelBody, PanelHeader } from '@/components/primitives/Panel';
import { Amount } from '@/components/primitives/Value';
import { ActivityTape } from '@/components/rfq/ActivityTape';
import { EntitlementMatrix, type EntitlementRow } from '@/components/rfq/EntitlementMatrix';
import { ReceiptTable } from '@/components/rfq/ReceiptTable';
import { AUDITOR } from '@/lib/ledger/parties';
import { useDesk } from '@/lib/ledger/provider';

import { DeskLoading } from './DeskLayout';

export function AuditorDesk() {
  const { snapshot, loading } = useDesk(AUDITOR.party);
  const receipts = snapshot?.receipts ?? [];

  const rows: EntitlementRow[] = [
    {
      template: 'SettlementReceipt',
      count: receipts.length,
      entitled: true,
      reason: 'Named as observer when the seller allocated its leg.',
    },
    {
      template: 'RFQ',
      count: null,
      entitled: false,
      reason: 'Signatory treasury, observers the invited dealers. This party is neither.',
    },
    {
      template: 'RfqInvitation',
      count: null,
      entitled: false,
      reason: 'Bilateral between the treasury and one dealer.',
    },
    {
      template: 'Quote',
      count: null,
      entitled: false,
      reason: 'Signatories treasury and dealer, no observers at all.',
    },
    {
      template: 'AcceptedTrade',
      count: null,
      entitled: false,
      reason: 'Pre-settlement position of the two counterparties.',
    },
    {
      template: 'SettlementInstruction',
      count: null,
      entitled: false,
      reason: 'Allocation detail between the counterparties.',
    },
  ];

  const totalNotional = receipts.reduce<string | null>(
    (acc, r) => (acc === null ? r.payload.paymentAmount : acc),
    null,
  );

  return (
    <AppShell>
      <IdentityBar info={AUDITOR} />
      <div className="grid min-h-[calc(100dvh-5.25rem)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="min-w-0 space-y-4 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-ink">Settlement evidence</h1>
            <p className="text-mini text-ink-3">
              {receipts.length === 0
                ? 'Nothing has been disclosed to this party'
                : `${receipts.length} receipt${receipts.length === 1 ? '' : 's'} disclosed`}
              {totalNotional ? (
                <>
                  {' · latest consideration '}
                  <Amount value={totalNotional} dp={2} className="text-ink-2" />
                </>
              ) : null}
            </p>
          </div>

          <Panel>
            <PanelHeader
              title="Receipts"
              meta="Immutable, post-trade, signed by both counterparties"
            />
            <PanelBody className="p-0">
              {loading ? (
                <DeskLoading label="Reading the active contract set as Auditor…" />
              ) : receipts.length > 0 ? (
                <ReceiptTable receipts={receipts} />
              ) : (
                <EmptyState
                  headline="Nothing has settled yet"
                  body={
                    <>
                      This party is an observer on <span className="num">SettlementReceipt</span>{' '}
                      and on no other template. Its active contract set is empty because no contract
                      names it — the table below is not being filtered.
                    </>
                  }
                  footnote="Competing quotes will not appear here after settlement either. The audit trail is the trade that happened, not the prices that lost."
                />
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Read entitlement"
              meta="Resolved from signatory and observer sets on the ledger"
            />
            <PanelBody className="p-0">
              <EntitlementMatrix rows={rows} />
            </PanelBody>
          </Panel>
        </section>

        <aside className="border-t border-line bg-sunken p-3 xl:border-t-0 xl:border-l">
          <ActivityTape events={snapshot?.events ?? []} />
        </aside>
      </div>
    </AppShell>
  );
}
