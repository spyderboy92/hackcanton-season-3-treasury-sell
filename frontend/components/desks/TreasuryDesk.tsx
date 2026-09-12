'use client';

import { useMemo, useState } from 'react';

import { AppShell } from '@/components/shell/AppShell';
import { IdentityBar } from '@/components/shell/IdentityBar';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { Notice } from '@/components/primitives/Notice';
import { Panel, PanelBody, PanelHeader } from '@/components/primitives/Panel';
import { ActivityTape } from '@/components/rfq/ActivityTape';
import { CreateRfqPanel } from '@/components/rfq/CreateRfqPanel';
import { HoldingsPanel } from '@/components/rfq/HoldingsPanel';
import { QuoteBook } from '@/components/rfq/QuoteBook';
import { ReceiptTable } from '@/components/rfq/ReceiptTable';
import { RfqBlotter } from '@/components/rfq/RfqBlotter';
import { RfqTerms } from '@/components/rfq/RfqTerms';
import { SettlementLadder } from '@/components/rfq/SettlementLadder';
import { Spec } from '@/components/primitives/Spec';
import type { CreateRfqCommand } from '@/lib/ledger/client';
import { AUDITOR, TREASURY } from '@/lib/ledger/parties';
import { useCommand, useDesk, useLedger } from '@/lib/ledger/provider';
import { quoteSpreadBps } from '@/lib/ledger/selectors';
import { sellerOf } from '@/lib/ledger/types';
import { defaultRfqId, filledLeg, holdingFor, rfqView } from '@/lib/ledger/view';

import { BlotterHeader, DeskLayout, DeskLoading } from './DeskLayout';

export function TreasuryDesk() {
  const client = useLedger();
  const { snapshot, loading } = useDesk(TREASURY.party);
  const { pending, error, run, dismiss } = useCommand();
  const [picked, setPicked] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = picked ?? defaultRfqId(snapshot);
  const view = useMemo(
    () => (snapshot && selected ? rfqView(snapshot, selected) : null),
    [snapshot, selected],
  );

  const openCreate = () => {
    setCreating(true);
    dismiss();
  };

  const create = (command: CreateRfqCommand) =>
    run('create', async () => {
      const created = await client.createRfq(TREASURY.party, command);
      setPicked(created.payload.rfqId);
      setCreating(false);
    });

  const accept = (quoteContractId: string) => {
    if (!view) return;
    void run(`accept:${quoteContractId}`, () =>
      client.acceptQuote(TREASURY.party, {
        quoteContractId,
        rfqContractId: view.rfq.contractId,
      }),
    );
  };

  const cancel = () => {
    if (!view) return;
    void run('cancel', () => client.cancelRfq(TREASURY.party, view.rfq.contractId));
  };

  const allocate = () => {
    if (!snapshot || !view?.trade) return;
    const t = view.trade.payload;
    const seller = sellerOf(t.side, t.treasury, t.dealer);
    const holding = holdingFor(snapshot, seller, t.asset);
    if (!holding) return;
    void run('allocate', () =>
      client.allocateAsset(TREASURY.party, {
        tradeContractId: view.trade!.contractId,
        assetHoldingCid: holding.contractId,
        auditor: AUDITOR.party,
      }),
    );
  };

  const settle = () => {
    if (!snapshot || !view?.instruction) return;
    const i = view.instruction.payload;
    const holding = holdingFor(snapshot, i.buyer, i.quoteCurrency);
    if (!holding) return;
    void run('settle', () =>
      client.settle(TREASURY.party, {
        instructionContractId: view.instruction!.contractId,
        paymentHoldingCid: holding.contractId,
      }),
    );
  };

  const spread = view ? quoteSpreadBps(view.rfq.payload.side, view.quotes) : null;

  return (
    <AppShell>
      <IdentityBar
        info={TREASURY}
        right={
          client.reset ? (
            <Button size="sm" variant="ghost" onClick={() => void client.reset?.()}>
              Reset fixture
            </Button>
          ) : null
        }
      />
      <DeskLayout
        blotter={
          <>
            <BlotterHeader
              title="Requests"
              actions={
                <Button size="sm" variant={creating ? 'primary' : 'secondary'} onClick={openCreate}>
                  New
                </Button>
              }
            />
            <RfqBlotter
              rfqs={snapshot?.rfqs ?? []}
              selected={creating ? null : selected}
              onSelect={(id) => {
                setPicked(id);
                setCreating(false);
              }}
            />
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
          <DeskLoading label="Reading the active contract set as Treasury…" />
        ) : creating || !view ? (
          <div className="max-w-xl p-4">
            {!view && !creating ? (
              <EmptyState
                headline="No request on the desk"
                body="Raise an RFQ to put terms in front of your dealer panel. The request carries size and direction only — prices never touch the shared contract."
                action={
                  <Button variant="primary" onClick={openCreate}>
                    Raise an RFQ
                  </Button>
                }
              />
            ) : (
              <CreateRfqPanel
                onSubmit={(c) => void create(c)}
                busy={pending === 'create'}
                error={error}
                onDismissError={dismiss}
              />
            )}
          </div>
        ) : (
          <div className="space-y-4 pb-8">
            <RfqTerms
              rfq={view.rfq}
              extra={
                <Spec label="Prices in">
                  <span className="num text-xs">
                    {view.quotes.length + (filledLeg(view) ? 1 : 0)}
                  </span>
                  <span className="ml-1 text-ink-3">
                    of {view.rfq.payload.invitedDealers.length}
                  </span>
                </Spec>
              }
            />

            {error ? (
              <div className="px-4">
                <Notice onDismiss={dismiss}>{error}</Notice>
              </div>
            ) : null}

            <div className="px-4">
              <Panel>
                <PanelHeader
                  title="Quote book"
                  meta={
                    spread
                      ? `Best to worst spread ${spread} bp`
                      : 'Ranked best price first for this direction'
                  }
                  actions={
                    view.rfq.payload.status === 'Open' ? (
                      <Button size="sm" variant="danger" busy={pending === 'cancel'} onClick={cancel}>
                        Cancel RFQ
                      </Button>
                    ) : null
                  }
                />
                <PanelBody className="p-0">
                  <QuoteBook
                    rfq={view.rfq}
                    quotes={view.quotes}
                    filled={filledLeg(view)}
                    onAccept={accept}
                    pendingKey={pending}
                  />
                </PanelBody>
              </Panel>
            </div>

            {view.trade || view.instruction || view.receipt ? (
              <div className="px-4">
                <SettlementLadder
                  view={view}
                  asParty={TREASURY.party}
                  onAllocateAsset={allocate}
                  onSettle={settle}
                  pendingKey={pending}
                />
              </div>
            ) : null}

            {snapshot && snapshot.receipts.length > 0 ? (
              <div className="px-4">
                <Panel>
                  <PanelHeader title="Settled" meta="Receipts this desk is a signatory on" />
                  <PanelBody className="p-0">
                    <ReceiptTable receipts={snapshot.receipts} />
                  </PanelBody>
                </Panel>
              </div>
            ) : null}

            <p className="max-w-[92ch] px-4 text-mini leading-relaxed text-ink-4">
              Accepting a quote submits two sibling commands in one transaction: Accept on the
              winning bilateral Quote, Close on the shared RFQ. Losing dealers are stakeholders on
              the RFQ node alone, so the close reaches them and the acceptance does not.
            </p>
          </div>
        )}
      </DeskLayout>
    </AppShell>
  );
}
