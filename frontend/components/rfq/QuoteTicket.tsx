'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/primitives/Button';
import { Field, TextInput } from '@/components/primitives/Field';
import { Notice } from '@/components/primitives/Notice';
import { Panel, PanelBody, PanelHeader } from '@/components/primitives/Panel';
import { Amount } from '@/components/primitives/Value';
import { Timestamp } from '@/components/primitives/Timestamp';
import { isDecimal, isPositive, multiply } from '@/lib/decimal';
import type { Contract, Quote, Rfq, RfqInvitation } from '@/lib/ledger/types';

type Mode = 'submit' | 'live' | 'revise' | 'closed';

/** The dealer's price entry. One number, and what it commits them to. */
export function QuoteTicket({
  rfq,
  invitation,
  quote,
  pendingKey,
  error,
  onDismissError,
  onSubmit,
  onRevise,
  onWithdraw,
  onDecline,
}: {
  rfq: Contract<Rfq>;
  invitation: Contract<RfqInvitation> | null;
  quote: Contract<Quote> | null;
  pendingKey: string | null;
  error: string | null;
  onDismissError: () => void;
  onSubmit: (price: string) => void;
  onRevise: (price: string) => void;
  onWithdraw: () => void;
  onDecline: () => void;
}) {
  const p = rfq.payload;
  const open = p.status === 'Open';
  const [price, setPrice] = useState('');
  const [revising, setRevising] = useState(false);

  useEffect(() => {
    setRevising(false);
  }, [quote?.contractId]);

  const mode: Mode = !open ? 'closed' : quote ? (revising ? 'revise' : 'live') : 'submit';
  const valid = isDecimal(price) && isPositive(price);
  const preview = valid ? multiply(p.quantity, price) : null;
  const verb = p.side === 'Sell' ? 'bid' : 'offer';

  return (
    <Panel>
      <PanelHeader
        title={`Your ${verb}`}
        meta={
          open
            ? `Bilateral with ${p.treasury.split('::')[0]} — no other dealer is on this contract`
            : 'This RFQ is no longer accepting prices'
        }
      />
      <PanelBody className="space-y-3">
        {mode === 'live' && quote ? (
          <>
            <div className="flex items-end justify-between gap-4 border-l-2 border-accent bg-accent-wash px-3 py-2.5">
              <div>
                <span className="label mb-0.5 block">Standing {verb}</span>
                <Amount
                  value={quote.payload.price}
                  symbol={p.quoteCurrency}
                  className="text-3xl font-medium text-accent"
                />
                <span className="ml-2 text-xs text-ink-3">{p.quoteCurrency}</span>
              </div>
              <div className="text-right">
                <span className="label mb-0.5 block">Commits you to</span>
                <Amount
                  value={multiply(p.quantity, quote.payload.price)}
                  dp={2}
                  className="text-sm text-ink"
                />
                <span className="ml-1 text-mini text-ink-3">{p.quoteCurrency}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Timestamp iso={quote.payload.submittedAt} />
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  onClick={() => {
                    setPrice(quote.payload.price);
                    setRevising(true);
                  }}
                >
                  Revise price
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  busy={pendingKey === 'withdraw'}
                  onClick={onWithdraw}
                >
                  Withdraw
                </Button>
              </div>
            </div>
          </>
        ) : null}

        {mode === 'submit' || mode === 'revise' ? (
          <>
            <Field
              label={`Price per ${p.asset} in ${p.quoteCurrency}`}
              hint={
                preview ? (
                  <>
                    Notional <Amount value={preview} dp={2} className="text-ink-2" />{' '}
                    {p.quoteCurrency} for <Amount value={p.quantity} symbol={p.asset} />{' '}
                    {p.asset}
                  </>
                ) : (
                  'Decimal, exact. Never rounded through a float.'
                )
              }
            >
              <TextInput
                mono
                autoFocus
                inputMode="decimal"
                placeholder="0.00"
                value={price}
                suffix={p.quoteCurrency}
                onChange={(e) => setPrice(e.target.value)}
                className="h-11 text-lg"
              />
            </Field>

            {error ? <Notice onDismiss={onDismissError}>{error}</Notice> : null}

            <div className="flex gap-1.5">
              <Button
                variant="primary"
                className="flex-1"
                disabled={!valid}
                busy={pendingKey === 'submit' || pendingKey === 'revise'}
                onClick={() => (mode === 'revise' ? onRevise(price) : onSubmit(price))}
              >
                {mode === 'revise' ? 'Replace standing price' : `Submit ${verb}`}
              </Button>
              {mode === 'revise' ? (
                <Button onClick={() => setRevising(false)}>Cancel</Button>
              ) : invitation ? (
                <Button variant="ghost" busy={pendingKey === 'decline'} onClick={onDecline}>
                  Decline
                </Button>
              ) : null}
            </div>
          </>
        ) : null}

        {mode === 'closed' ? (
          quote ? (
            <div className="border-l-2 border-line-hi bg-raised px-3 py-2.5">
              <span className="label mb-0.5 block">Your final {verb}</span>
              <Amount
                value={quote.payload.price}
                symbol={p.quoteCurrency}
                className="text-2xl text-ink-2"
              />
              <span className="ml-2 text-xs text-ink-3">{p.quoteCurrency}</span>
            </div>
          ) : (
            <p className="text-xs text-ink-3">
              You did not price this RFQ before it closed.
            </p>
          )
        ) : null}

        {mode !== 'closed' && error && mode === 'live' ? (
          <Notice onDismiss={onDismissError}>{error}</Notice>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
