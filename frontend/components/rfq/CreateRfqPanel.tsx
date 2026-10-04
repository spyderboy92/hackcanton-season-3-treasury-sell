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
  onCancel,
}: {
  onSubmit: (command: CreateRfqCommand) => void;
  busy: boolean;
  error: string | null;
  onDismissError: () => void;
  onCancel: () => void;
}) {
  const [side, setSide] = useState<Side>('Sell');
  const [asset, setAsset] = useState('cETH');
  const [currency, setCurrency] = useState('USD');
  const [quantity, setQuantity] = useState('10.0000');
  const [minutes, setMinutes] = useState('15');
  const [dealers, setDealers] = useState<string[]>(DEALERS.map((d) => d.party));

  const quantityValid = isDecimal(quantity) && isPositive(quantity);
  const deadlineMinutes = Number(minutes);
  const deadlineValid = /^\d+$/.test(minutes) && Number.isSafeInteger(deadlineMinutes) && deadlineMinutes >= 1 && deadlineMinutes <= 1440;
  const ready = quantityValid && deadlineValid && dealers.length > 0 && !busy;

  const submit = () => {
    if (!ready) return;
    onSubmit({
      asset,
      quoteCurrency: currency,
      side,
      quantity,
      quoteDeadline: new Date(Date.now() + deadlineMinutes * 60_000).toISOString(),
      invitedDealers: dealers,
    });
  };

  return (
    <Panel>
      <PanelHeader title="New quote request" meta="Choose your terms and dealer panel" />
      <PanelBody className="space-y-3">
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <fieldset disabled={busy} className="space-y-4">
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
                  'min-h-11 flex-1 rounded-xs border border-line-hi px-2 text-xs transition-colors ' +
                  (side === option
                    ? 'bg-raised font-medium text-ink'
                    : 'text-ink-3 hover:bg-raised hover:text-ink') +
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
              aria-invalid={!quantityValid}
              inputMode="decimal"
              value={quantity}
              suffix={asset}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
          <Field label="Quotes close in" hint={deadlineValid ? '1 to 1,440 minutes' : <span className="text-neg">Enter a whole number from 1 to 1,440</span>}>
            <TextInput
              mono
              inputMode="numeric"
              aria-invalid={!deadlineValid}
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
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{partyLabel(d.party)}</span>
                    <span className="text-mini text-ink-3">{institutionOf(d.party)}</span>
                  </span>
                }
                secondary={<span className="hidden sm:inline"><PartyId party={d.party} keep={4} /></span>}
              />
            ))}
          </div>
          {dealers.length === 0 ? <p className="mt-2 text-mini text-neg">Select at least one dealer.</p> : null}
        </div>
        </fieldset>

        {error ? <Notice onDismiss={onDismissError}>{error}</Notice> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" size="md" className="flex-1" busy={busy} disabled={!ready}>
            Send quote request
          </Button>
          <Button type="button" disabled={busy} onClick={onCancel}>Cancel</Button>
        </div>
        <p className="text-mini text-ink-3">
          Invited dealers see these terms. Each price is private between you and the dealer.
        </p>
        </form>
      </PanelBody>
    </Panel>
  );
}
