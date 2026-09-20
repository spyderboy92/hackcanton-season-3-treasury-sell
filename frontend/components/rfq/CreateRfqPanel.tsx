'use client';

import { useState } from 'react';

import { Button } from '@/components/primitives/Button';
import { CheckRow, Field, Select, TextInput } from '@/components/primitives/Field';
import { Notice } from '@/components/primitives/Notice';
import { Panel, PanelBody, PanelHeader } from '@/components/primitives/Panel';
import { PartyId } from '@/components/primitives/PartyTag';
import { isDecimal, isPositive } from '@/lib/decimal';
import { DEALERS, institutionOf, partyLabel } from '@/lib/ledger/parties';
import type { CreateRfqCommand } from '@/lib/ledger/client';
import type { Side } from '@/lib/ledger/types';

const ASSETS = ['cETH', 'CBTC'];
const CURRENCIES = ['USD', 'EUR'];

export function CreateRfqPanel({
  onSubmit,
  busy,
  error,
  onDismissError,
}: {
  onSubmit: (command: CreateRfqCommand) => void;
  busy: boolean;
  error: string | null;
  onDismissError: () => void;
}) {
  const [side, setSide] = useState<Side>('Sell');
  const [asset, setAsset] = useState('cETH');
  const [currency, setCurrency] = useState('USD');
  const [quantity, setQuantity] = useState('10.0000');
  const [minutes, setMinutes] = useState('15');
  const [dealers, setDealers] = useState<string[]>(DEALERS.map((d) => d.party));

  const quantityValid = isDecimal(quantity) && isPositive(quantity);
  const ready = quantityValid && dealers.length > 0 && !busy;

  const submit = () => {
    if (!ready) return;
    const mins = Number.parseInt(minutes, 10);
    onSubmit({
      asset,
      quoteCurrency: currency,
      side,
      quantity,
      quoteDeadline:
        Number.isFinite(mins) && mins > 0
          ? new Date(Date.now() + mins * 60_000).toISOString()
          : null,
      invitedDealers: dealers,
    });
  };

  return (
    <Panel>
      <PanelHeader title="Raise an RFQ" meta="Terms go to every invited dealer" />
      <PanelBody className="space-y-3">
        <div>
          <span className="label mb-1 block">Direction</span>
          <div className="flex">
            {(['Sell', 'Buy'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSide(option)}
                aria-pressed={side === option}
                className={
                  'h-8 flex-1 border text-xs transition-colors ' +
                  (side === option
                    ? 'border-accent bg-accent-wash text-accent'
                    : 'border-line-hi text-ink-3 hover:text-ink') +
                  (option === 'Buy' ? ' -ml-px' : '')
                }
              >
                {option === 'Sell' ? 'Sell — dealers bid' : 'Buy — dealers offer'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Instrument">
            <Select value={asset} onChange={(e) => setAsset(e.target.value)}>
              {ASSETS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quoted in">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Size"
            hint={quantityValid ? undefined : <span className="text-neg">Enter a positive amount</span>}
          >
            <TextInput
              mono
              inputMode="decimal"
              value={quantity}
              suffix={asset}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
          <Field label="Quotes close in">
            <TextInput
              mono
              inputMode="numeric"
              value={minutes}
              suffix="min"
              onChange={(e) => setMinutes(e.target.value)}
            />
          </Field>
        </div>

        <div>
          <span className="label mb-1 block">Invite dealers</span>
          <div className="border border-line-hi">
            {DEALERS.map((d) => (
              <CheckRow
                key={d.party}
                checked={dealers.includes(d.party)}
                onChange={(next) =>
                  setDealers((prev) =>
                    next ? [...prev, d.party] : prev.filter((p) => p !== d.party),
                  )
                }
                primary={
                  <span className="flex items-baseline gap-2">
                    <span className="font-medium">{partyLabel(d.party)}</span>
                    <span className="text-mini text-ink-3">{institutionOf(d.party)}</span>
                  </span>
                }
                secondary={<PartyId party={d.party} keep={4} />}
              />
            ))}
          </div>
        </div>

        {error ? <Notice onDismiss={onDismissError}>{error}</Notice> : null}

        <Button variant="primary" size="md" className="w-full" busy={busy} onClick={submit} disabled={!ready}>
          Raise RFQ and issue invitations
        </Button>
        <p className="text-mini text-ink-3">
          One shared RFQ contract carrying terms only, plus one private invitation per dealer.
        </p>
      </PanelBody>
    </Panel>
  );
}
