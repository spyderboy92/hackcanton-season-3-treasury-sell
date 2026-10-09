'use client';

import { cn } from '@/lib/cn';
import { Button } from '@/components/primitives/Button';
import { Amount } from '@/components/primitives/Value';
import { Panel, PanelBody, PanelHeader } from '@/components/primitives/Panel';
import { Timestamp } from '@/components/primitives/Timestamp';
import { multiply } from '@/lib/decimal';
import { institutionOf, partyLabel } from '@/lib/ledger/parties';
import { buyerOf, sellerOf, type Party } from '@/lib/ledger/types';
import type { RfqView } from '@/lib/ledger/view';

import { LedgerRecordRef } from './LedgerRecordRef';

interface Step {
  title: string;
  detail: React.ReactNode;
  controller: Party;
  done: boolean;
  active: boolean;
  action?: { label: string; key: string; run: () => void };
}

/**
 * Two-step delivery versus payment. Each side allocates its own leg; the second
 * command moves both holdings in one transaction.
 */
export function SettlementLadder({
  view,
  asParty,
  onAllocateAsset,
  onSettle,
  pendingKey,
}: {
  view: RfqView;
  asParty: Party;
  onAllocateAsset: () => void;
  onSettle: () => void;
  pendingKey: string | null;
}) {
  const { rfq, trade, instruction, receipt } = view;
  const p = rfq.payload;
  const counterparty = trade?.payload.dealer ?? instruction?.payload.dealer ?? receipt?.payload.dealer;
  if (!counterparty) return null;

  const seller = sellerOf(p.side, p.treasury, counterparty);
  const buyer = buyerOf(p.side, p.treasury, counterparty);
  const price = trade?.payload.price ?? instruction?.payload.price ?? receipt?.payload.price ?? '0';
  const payment = multiply(p.quantity, price);

  const steps: Step[] = [
    {
      title: 'Trade agreed',
      detail: (
        <>
          <Amount value={p.quantity} symbol={p.asset} /> {p.asset} at{' '}
          <Amount value={price} symbol={p.quoteCurrency} /> {p.quoteCurrency}
        </>
      ),
      controller: p.treasury,
      done: true,
      active: false,
    },
    {
      title: `Allocate ${p.asset}`,
      detail: (
        <>
          <Amount value={p.quantity} symbol={p.asset} /> {p.asset} from {partyLabel(seller)} to{' '}
          {partyLabel(buyer)}
        </>
      ),
      controller: seller,
      done: Boolean(instruction ?? receipt),
      active: Boolean(trade) && !instruction && !receipt,
      action:
        asParty === seller && trade && !instruction && !receipt
          ? { label: `Allocate ${p.asset} leg`, key: 'allocate', run: onAllocateAsset }
          : undefined,
    },
    {
      title: `Pay ${p.quoteCurrency}`,
      detail: (
        <>
          <Amount value={payment} dp={2} /> {p.quoteCurrency} from {partyLabel(buyer)} to{' '}
          {partyLabel(seller)}
        </>
      ),
      controller: buyer,
      done: Boolean(receipt),
      active: Boolean(instruction) && !receipt,
      action:
        asParty === buyer && instruction && !receipt
          ? { label: 'Allocate payment and settle', key: 'settle', run: onSettle }
          : undefined,
    },
  ];

  return (
    <Panel>
      <PanelHeader
        title="Settlement"
        meta={
          receipt ? (
            <span className="text-pos">Settled — both legs moved in one transaction</span>
          ) : (
            'Each side allocates its own leg; the final command is atomic'
          )
        }
        actions={
          receipt ? (
            <span className="num text-mini text-pos">DvP COMPLETE</span>
          ) : (
            <span className="num text-mini text-ink-4">
              {steps.filter((s) => s.done).length}/3
            </span>
          )
        }
      />
      <PanelBody className="p-0">
        <ol>
          {steps.map((step, i) => (
            <li
              key={step.title}
              className={cn(
                'grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border-b border-line-quiet px-4 py-4 last:border-b-0 lg:grid-cols-[auto_minmax(0,1fr)_auto]',
                step.active && 'bg-accent-wash',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-micro',
                  step.done
                    ? 'bg-pos-wash text-pos'
                    : step.active
                      ? 'bg-raised text-ink'
                      : 'bg-canvas text-ink-4',
                )}
              >
                {step.done ? '✓' : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={cn('text-xs font-medium', step.done ? 'text-ink' : 'text-ink-2')}>
                    {step.title}
                  </span>
                  <span className="text-mini text-ink-4">
                    {partyLabel(step.controller)}
                  </span>
                </div>
                <div className="mt-0.5 text-mini text-ink-2">{step.detail}</div>
              </div>
              {step.action ? (
                <Button
                  size="sm"
                  variant="primary"
                  className="col-start-2 justify-self-start lg:col-start-auto lg:justify-self-end"
                  disabled={Boolean(pendingKey)}
                  busy={pendingKey === step.action.key}
                  onClick={step.action.run}
                >
                  {step.action.label}
                </Button>
              ) : step.active ? (
                <span className="col-start-2 text-mini text-ink-3 lg:col-start-auto">
                  Waiting for {partyLabel(step.controller)}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
        {receipt ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line bg-pos-wash px-4 py-2.5">
            <span className="text-mini text-ink-2">Receipt issued</span>
            <Timestamp iso={receipt.payload.settledAt} />
            <span className="inline-flex items-baseline gap-2" data-testid="settlement-ledger-tx">
              <span className="text-mini text-ink-3">Ledger tx</span>
              <LedgerRecordRef record={receipt.record} keep={16} />
            </span>
            <span className="inline-flex items-baseline gap-2">
              <span className="text-mini text-ink-3">Receipt</span>
              <span className="num text-mini text-ink-3" title={receipt.contractId}>
                {receipt.contractId.slice(0, 14)}…
              </span>
            </span>
            <span className="ml-auto text-mini text-ink-2">
              {receipt.payload.auditor
                ? `${institutionOf(receipt.payload.auditor)} is an observer on this receipt`
                : 'No auditor attached'}
            </span>
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
