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

type Mode = 'submit' | 'live' | 'revise' | 'closed' | 'declined';

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

  const mode: Mode = !open ? 'closed' : quote ? (revising ? 'revise' : 'live') : invitation ? 'submit' : 'declined';
  const valid = isDecimal(price) && isPositive(price);
  const preview = valid ? multiply(p.quantity, price) : null;
  const verb = p.side === 'Sell' ? 'bid' : 'offer';

  return (
    <Panel>
      <PanelHeader
        title={`Your ${verb}`}
        meta={
          open
            ? `Private between your desk and ${p.treasury.split('::')[0]}`
            : 'This RFQ is no longer accepting prices'
        }
      />
      <PanelBody className="space-y-3">
        {mode === 'live' && quote ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-xs bg-accent-wash px-4 py-4">
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
                  disabled={Boolean(pendingKey)}
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
                  disabled={Boolean(pendingKey)}
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
          <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            if (valid && !pendingKey) mode === 'revise' ? onRevise(price) : onSubmit(price);
          }}>
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
                  'Enter a positive unit price to see the total value.'
                )
              }
            >
              <TextInput
                mono
                inputMode="decimal"
                disabled={Boolean(pendingKey)}
                aria-invalid={price.length > 0 && !valid}
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
                type="submit"
                variant="primary"
                className="flex-1"
                disabled={!valid || Boolean(pendingKey)}
                busy={pendingKey === 'submit' || pendingKey === 'revise'}
              >
                {mode === 'revise' ? 'Replace standing price' : `Submit ${verb}`}
              </Button>
              {mode === 'revise' ? (
                <Button type="button" disabled={Boolean(pendingKey)} onClick={() => setRevising(false)}>Cancel</Button>
              ) : invitation ? (
                <Button type="button" variant="ghost" disabled={Boolean(pendingKey)} busy={pendingKey === 'decline'} onClick={onDecline}>
                  Decline
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}

        {mode === 'declined' ? <p className="text-xs text-ink-2">You declined this invitation. There is no active price to submit.</p> : null}

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
