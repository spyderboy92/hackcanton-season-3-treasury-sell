'use client';

import { useMemo, useState } from 'react';

import { cn } from '@/lib/cn';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/primitives/Button';
import { Notice } from '@/components/primitives/Notice';
import { RfqStatusTag, SideTag } from '@/components/primitives/Status';
import { Sealed } from '@/components/primitives/Sealed';
import { Amount } from '@/components/primitives/Value';
import { ActivityTape } from '@/components/rfq/ActivityTape';
import { DealerQuoteBook } from '@/components/rfq/DealerQuoteBook';
import { QuoteBook } from '@/components/rfq/QuoteBook';
import { RfqRef } from '@/components/rfq/RfqRef';
import { multiply } from '@/lib/decimal';
import { LedgerError } from '@/lib/ledger/client';
import { AUDITOR, DEALERS, TREASURY, partyLabel, type PartyInfo } from '@/lib/ledger/parties';
import { useCommand, useDesk, useLedger } from '@/lib/ledger/provider';
import { bestQuote } from '@/lib/ledger/selectors';
import { sellerOf } from '@/lib/ledger/types';
import { filledLeg, holdingFor, rfqView, type RfqView } from '@/lib/ledger/view';

import { DemoPane } from './DemoPane';

type Stage = 'loading' | 'quoting' | 'accepted' | 'allocated' | 'settled';

const NARRATIVE: Record<Stage, string> = {
  loading: 'Reading both active contract sets.',
  quoting:
    'One instant, two seats. The treasury holds a bilateral Quote contract with every dealer. Each dealer holds exactly one — its own.',
  accepted:
    'Accept and Close went in as sibling commands in a single transaction. The losing dealer witnessed the Close. The Accept subtree was never disclosed to it.',
  allocated:
    'The seller has allocated its asset leg. That instruction is bilateral too, so the losing dealer still has nothing new to read.',
  settled:
    'Both legs moved in one transaction. The auditor was added as an observer on the receipt alone — never on a quote.',
};

/** Prices this party can actually read, counting the one it traded on. */
function pricesVisible(view: RfqView | null): number {
  if (!view) return 0;
  const settledLeg = view.trade ?? view.instruction ?? view.receipt;
  return view.quotes.length + (settledLeg ? 1 : 0);
}

export function SplitDemo() {
  const client = useLedger();
  const { pending, error, run, dismiss } = useCommand();
  const [dealerSlug, setDealerSlug] = useState('a');

  const dealer: PartyInfo = DEALERS.find((d) => d.slug === dealerSlug) ?? DEALERS[0]!;
  const treasury = useDesk(TREASURY.party);
  const dealerDesk = useDesk(dealer.party);

  const rfqId = treasury.snapshot?.rfqs[0]?.payload.rfqId ?? null;

  const tView = useMemo(
    () => (treasury.snapshot && rfqId ? rfqView(treasury.snapshot, rfqId) : null),
    [treasury.snapshot, rfqId],
  );
  const dView = useMemo(
    () => (dealerDesk.snapshot && rfqId ? rfqView(dealerDesk.snapshot, rfqId) : null),
    [dealerDesk.snapshot, rfqId],
  );

  const stage: Stage = !tView
    ? 'loading'
    : tView.receipt
      ? 'settled'
      : tView.instruction
        ? 'allocated'
        : tView.trade
          ? 'accepted'
          : 'quoting';

  const ACTION: Record<Stage, string> = {
    loading: 'Loading',
    quoting: 'Accept the best price and close',
    accepted: `Allocate the ${tView?.rfq.payload.asset ?? 'asset'} leg`,
    allocated: 'Allocate payment and settle',
    settled: 'Settled',
  };

  const advance = () => {
    if (!tView || !treasury.snapshot) return;
    const snap = treasury.snapshot;

    if (stage === 'quoting') {
      const best = bestQuote(tView.rfq.payload.side, tView.quotes);
      if (!best) return;
      void run('advance', () =>
        client.acceptQuote(TREASURY.party, {
          quoteContractId: best.contractId,
          rfqContractId: tView.rfq.contractId,
        }),
      );
      return;
    }

    if (stage === 'accepted' && tView.trade) {
      const trade = tView.trade;
      const t = trade.payload;
      const seller = sellerOf(t.side, t.treasury, t.dealer);
      void run('advance', async () => {
        const holding =
          seller === TREASURY.party
            ? holdingFor(snap, seller, t.asset)
            : (await client.listHoldings(seller, { symbol: t.asset }))[0] ?? null;
        if (!holding) throw new LedgerError('PRECONDITION_FAILED', 'Seller holds no deliverable.');
        await client.allocateAsset(seller, {
          tradeContractId: trade.contractId,
          assetHoldingCid: holding.contractId,
          auditor: AUDITOR.party,
        });
      });
      return;
    }

    if (stage === 'allocated' && tView.instruction) {
      const instruction = tView.instruction;
      const i = instruction.payload;
      void run('advance', async () => {
        const holdings = await client.listHoldings(i.buyer, { symbol: i.quoteCurrency });
        const cid = holdings[0]?.contractId;
        if (!cid) throw new LedgerError('PRECONDITION_FAILED', 'Buyer holds no payment asset.');
        await client.settle(i.buyer, {
          instructionContractId: instruction.contractId,
          paymentHoldingCid: cid,
        });
      });
    }
  };

  const totalPrices = tView?.rfq.payload.invitedDealers.length ?? 3;
  const dealerFilled = Boolean(dView?.trade ?? dView?.instruction ?? dView?.receipt);
  const dealerClosed = dView ? dView.rfq.payload.status !== 'Open' : false;

  return (
    <AppShell>
      <div className="grid grid-cols-1 items-center gap-4 border-b border-line bg-sunken px-4 py-4 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
        <div className="flex flex-wrap items-center gap-2.5">
          {tView ? <SideTag side={tView.rfq.payload.side} /> : null}
          <span className="text-sm font-semibold tracking-tight text-ink">
            {tView ? (
              <>
                <Amount value={tView.rfq.payload.quantity} symbol={tView.rfq.payload.asset} />{' '}
                {tView.rfq.payload.asset}
              </>
            ) : (
              '—'
            )}
          </span>
          {tView ? <RfqRef rfqId={tView.rfq.payload.rfqId} className="text-ink-3" /> : null}
          {tView ? <RfqStatusTag status={tView.rfq.payload.status} /> : null}
        </div>

        <p className="min-w-0 max-w-[65ch] text-xs leading-relaxed text-ink-2">{NARRATIVE[stage]}</p>

        <div className="flex flex-wrap items-center gap-2">
          {stage === 'settled' ? (
            <span className="num text-mini text-pos">DvP COMPLETE</span>
          ) : (
            <Button
              variant="primary"
              busy={pending === 'advance'}
              disabled={stage === 'loading'}
              onClick={advance}
            >
              {ACTION[stage]}
            </Button>
          )}
          {client.reset ? (
            <Button variant="ghost" onClick={() => void client.reset?.()}>
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="px-4 py-2">
          <Notice onDismiss={dismiss}>{error}</Notice>
        </div>
      ) : null}

      <div className="grid grid-cols-1 divide-y divide-line lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <DemoPane
          party={TREASURY.party}
          title="Treasury"
          role={TREASURY.institution}
          visible={pricesVisible(tView)}
          total={totalPrices}
          tone="accent"
        >
          {tView ? (
            <>
              <QuoteBook
                rfq={tView.rfq}
                quotes={tView.quotes}
                filled={filledLeg(tView)}
                pendingKey={pending}
                onAccept={(cid) =>
                  void run(`accept:${cid}`, () =>
                    client.acceptQuote(TREASURY.party, {
                      quoteContractId: cid,
                      rfqContractId: tView.rfq.contractId,
                    }),
                  )
                }
              />
              {tView.receipt ? (
                <OutcomeStrip
                  tone="good"
                  label="Receipt in this party's contract set"
                  detail={
                    <>
                      <Amount value={tView.receipt.payload.paymentAmount} dp={2} />{' '}
                      {tView.receipt.payload.quoteCurrency} received from{' '}
                      {partyLabel(tView.receipt.payload.buyer)}
                    </>
                  }
                />
              ) : null}
              <ActivityTape events={treasury.snapshot?.events ?? []} limit={9} variant="flush" />
            </>
          ) : null}
        </DemoPane>

        <DemoPane
          party={dealer.party}
          title={dealer.label}
          role={dealer.institution}
          visible={pricesVisible(dView)}
          total={totalPrices}
          tone="quiet"
          toolbar={
            <div className="flex">
              {DEALERS.map((d, i) => (
                <button
                  key={d.slug}
                  type="button"
                  onClick={() => setDealerSlug(d.slug)}
                  aria-pressed={d.slug === dealerSlug}
                  className={cn(
                    'num h-6 border px-2 text-micro transition-colors',
                    d.slug === dealerSlug
                      ? 'border-ink-3 bg-raised text-ink'
                      : 'border-line text-ink-4 hover:text-ink-2',
                    i > 0 && '-ml-px',
                  )}
                >
                  {d.label.replace('Dealer ', '')}
                </button>
              ))}
            </div>
          }
        >
          {dView ? (
            <>
              <DealerQuoteBook
                rfq={dView.rfq}
                dealer={dealer.party}
                ownQuote={dView.quotes[0] ?? null}
                filled={filledLeg(dView)}
              />
              {dealerClosed && dealerFilled ? (
                <OutcomeStrip
                  tone="good"
                  label="Filled"
                  detail={
                    <>
                      <Amount value={dView.rfq.payload.quantity} symbol={dView.rfq.payload.asset} />{' '}
                      {dView.rfq.payload.asset} at{' '}
                      <Amount
                        value={
                          dView.trade?.payload.price ??
                          dView.instruction?.payload.price ??
                          dView.receipt?.payload.price ??
                          '0'
                        }
                        symbol={dView.rfq.payload.quoteCurrency}
                      />{' '}
                      {dView.rfq.payload.quoteCurrency}
                    </>
                  }
                />
              ) : dealerClosed ? (
                <OutcomeStrip
                  tone="sealed"
                  label="RFQ closed — no fill"
                  detail={
                    <span className="inline-flex flex-wrap items-center gap-x-5 gap-y-1">
                      <span className="inline-flex items-center gap-2">
                        <span className="text-ink-4">winner</span>
                        <Sealed width="w-20" />
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="text-ink-4">clearing price</span>
                        <Sealed width="w-16" />
                      </span>
                    </span>
                  }
                />
              ) : null}
              <ActivityTape events={dealerDesk.snapshot?.events ?? []} limit={9} variant="flush" />
            </>
          ) : null}
        </DemoPane>
      </div>

      <footer className="border-t border-line px-4 py-3 text-mini text-ink-4">
        Both panes read the same ledger at the same moment through the same client. What differs is
        the stakeholder set on each contract — nothing in this interface filters anything.
        {tView?.trade ?? tView?.receipt ? (
          <>
            {' '}
            Notional{' '}
            <Amount
              value={multiply(
                tView.rfq.payload.quantity,
                tView.trade?.payload.price ?? tView.receipt?.payload.price ?? '0',
              )}
              dp={2}
              className="text-ink-2"
            />{' '}
            {tView.rfq.payload.quoteCurrency}.
          </>
        ) : null}
      </footer>
    </AppShell>
  );
}

function OutcomeStrip({
  label,
  detail,
  tone,
}: {
  label: string;
  detail: React.ReactNode;
  tone: 'good' | 'sealed';
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3',
        tone === 'good' ? 'bg-pos-wash' : 'bg-raised',
      )}
    >
      <span className={cn('text-xs font-medium', tone === 'good' ? 'text-pos' : 'text-ink-2')}>
        {label}
      </span>
      <span className="num text-mini text-ink-2">{detail}</span>
    </div>
  );
}
