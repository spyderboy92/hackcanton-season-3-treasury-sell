'use client';

import { useMemo, useState } from 'react';

import { AppShell } from '@/components/shell/AppShell';
import { IdentityBar } from '@/components/shell/IdentityBar';
import { EmptyState } from '@/components/primitives/EmptyState';
import { Notice } from '@/components/primitives/Notice';
import { Panel, PanelBody, PanelHeader } from '@/components/primitives/Panel';
import { ActivityTape } from '@/components/rfq/ActivityTape';
import { DealerOutcome } from '@/components/rfq/DealerOutcome';
import { DealerQuoteBook } from '@/components/rfq/DealerQuoteBook';
import { HoldingsPanel } from '@/components/rfq/HoldingsPanel';
import { QuoteTicket } from '@/components/rfq/QuoteTicket';
import { RfqBlotter } from '@/components/rfq/RfqBlotter';
import { RfqTerms } from '@/components/rfq/RfqTerms';
import { SettlementLadder } from '@/components/rfq/SettlementLadder';
import type { PartyInfo } from '@/lib/ledger/parties';
import { useCommand, useDesk, useLedger } from '@/lib/ledger/provider';
import { defaultRfqId, filledLeg, holdingFor, rfqView } from '@/lib/ledger/view';

import { BlotterHeader, DeskLayout, DeskLoading } from './DeskLayout';

export function DealerDesk({ info }: { info: PartyInfo }) {
  const client = useLedger();
  const { snapshot, loading } = useDesk(info.party);
  const { pending, error, run, dismiss } = useCommand();
  const [picked, setPicked] = useState<string | null>(null);

  const selected = picked ?? defaultRfqId(snapshot);
  const view = useMemo(
    () => (snapshot && selected ? rfqView(snapshot, selected) : null),
    [snapshot, selected],
  );

  const ownQuote = view?.quotes[0] ?? null;
  const fill = view ? filledLeg(view) : null;
  const visiblePrices = (view?.quotes.length ?? 0) + (fill ? 1 : 0);

  const submit = (price: string) => {
    if (!view?.invitation) return;
    void run('submit', () =>
      client.submitQuote(info.party, {
        invitationContractId: view.invitation!.contractId,
        price,
        expiry: view.rfq.payload.quoteDeadline,
      }),
    );
  };

  const revise = (price: string) => {
    if (!ownQuote) return;
    void run('revise', () =>
      client.reviseQuote(info.party, { quoteContractId: ownQuote.contractId, newPrice: price }),
    );
  };

  const withdraw = () => {
    if (!ownQuote) return;
    void run('withdraw', () => client.withdrawQuote(info.party, ownQuote.contractId));
  };

  const decline = () => {
    if (!view?.invitation) return;
    void run('decline', () => client.declineInvitation(info.party, view.invitation!.contractId));
  };

  const settle = () => {
    if (!snapshot || !view?.instruction) return;
    const i = view.instruction.payload;
    const holding = holdingFor(snapshot, i.buyer, i.quoteCurrency);
    if (!holding) return;
    void run('settle', () =>
      client.settle(info.party, {
        instructionContractId: view.instruction!.contractId,
        paymentHoldingCid: holding.contractId,
      }),
    );
  };

  const allocate = () => {
    if (!snapshot || !view?.trade) return;
    const t = view.trade.payload;
    const holding = holdingFor(snapshot, info.party, t.asset);
    if (!holding) return;
    void run('allocate', () =>
      client.allocateAsset(info.party, {
        tradeContractId: view.trade!.contractId,
        assetHoldingCid: holding.contractId,
        auditor: null,
      }),
    );
  };

  const closed = view ? view.rfq.payload.status !== 'Open' : false;

  return (
    <AppShell>
      <IdentityBar info={info} />
      <DeskLayout
        blotter={
          <>
            <BlotterHeader title="Invitations" />
            <RfqBlotter rfqs={snapshot?.rfqs ?? []} selected={selected} onSelect={setPicked} />
          </>
        }
        context={
          <div className="space-y-3">
            <HoldingsPanel holdings={snapshot?.holdings ?? []} />
            <ActivityTape events={snapshot?.events ?? []} />
          </div>
        }
      >
        {loading ? (
          <DeskLoading label={`Reading the active contract set as ${info.label}…`} />
        ) : !view ? (
          <EmptyState
            headline="No request addressed to this desk"
            body="An RFQ appears here only once the treasury names this party in its dealer panel. Requests raised to other panels are not in this party's active contract set at all."
          />
        ) : (
          <div className="space-y-4 pb-8">
            <RfqTerms rfq={view.rfq} />

            {error && !['submit', 'revise'].includes(pending ?? '') ? (
              <div className="px-4">
                <Notice onDismiss={dismiss}>{error}</Notice>
              </div>
            ) : null}

            <div className="grid gap-4 px-4 2xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              <div className="space-y-4">
                {closed ? (
                  <DealerOutcome view={view} />
                ) : (
                  <QuoteTicket
                    rfq={view.rfq}
                    invitation={view.invitation}
                    quote={ownQuote}
                    pendingKey={pending}
                    error={error}
                    onDismissError={dismiss}
                    onSubmit={submit}
                    onRevise={revise}
                    onWithdraw={withdraw}
                    onDecline={decline}
                  />
                )}
              </div>

              <Panel>
                <PanelHeader
                  title="Quote book"
                  meta={`${visiblePrices} of ${view.rfq.payload.invitedDealers.length} prices in this party's view`}
                  actions={
                    <span className="num text-mini text-ink-4">
                      {view.rfq.payload.invitedDealers.length - visiblePrices} sealed
                    </span>
                  }
                />
                <PanelBody className="p-0">
                  <DealerQuoteBook
                    rfq={view.rfq}
                    dealer={info.party}
                    ownQuote={ownQuote}
                    filled={fill}
                  />
                </PanelBody>
              </Panel>
            </div>

            {view.trade || view.instruction || view.receipt ? (
              <div className="px-4">
                <SettlementLadder
                  view={view}
                  asParty={info.party}
                  onAllocateAsset={allocate}
                  onSettle={settle}
                  pendingKey={pending}
                />
              </div>
            ) : null}
          </div>
        )}
      </DeskLayout>
    </AppShell>
  );
}
