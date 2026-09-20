import { Amount } from '@/components/primitives/Value';
import { Panel, PanelBody, PanelHeader } from '@/components/primitives/Panel';
import { Sealed } from '@/components/primitives/Sealed';
import { Spec, SpecStrip } from '@/components/primitives/Spec';
import { Timestamp } from '@/components/primitives/Timestamp';
import { multiply } from '@/lib/decimal';
import { partyLabel } from '@/lib/ledger/parties';
import type { RfqView } from '@/lib/ledger/view';

/** What a dealer learns when the RFQ ends — and what it never learns. */
export function DealerOutcome({ view }: { view: RfqView }) {
  const { rfq, trade, instruction, receipt } = view;
  const p = rfq.payload;
  const filled = trade ?? instruction ?? receipt;

  if (filled) {
    const price = trade?.payload.price ?? instruction?.payload.price ?? receipt?.payload.price ?? '0';
    return (
      <Panel>
        <PanelHeader
          title="You were filled"
          meta="AcceptedTrade contract created with the treasury"
          actions={<span className="num text-mini text-pos">WON</span>}
        />
        <PanelBody>
          <SpecStrip>
            <Spec label="Clearing price">
              <Amount value={price} symbol={p.quoteCurrency} className="text-lg text-pos" />
              <span className="ml-1 text-mini text-ink-3">{p.quoteCurrency}</span>
            </Spec>
            <Spec label="Size">
              <Amount value={p.quantity} symbol={p.asset} className="text-lg" />
              <span className="ml-1 text-mini text-ink-3">{p.asset}</span>
            </Spec>
            <Spec label="Notional">
              <Amount value={multiply(p.quantity, price)} dp={2} className="text-lg" />
              <span className="ml-1 text-mini text-ink-3">{p.quoteCurrency}</span>
            </Spec>
            <Spec label="Counterparty">{partyLabel(p.treasury)}</Spec>
            {trade ? (
              <Spec label="Accepted">
                <Timestamp iso={trade.payload.acceptedAt} className="text-xs" />
              </Spec>
            ) : null}
          </SpecStrip>
        </PanelBody>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader
        title="No fill"
        meta="The RFQ closed without a trade with this party"
        actions={<span className="num text-mini text-ink-4">CLOSED</span>}
      />
      <PanelBody className="space-y-3">
        <SpecStrip>
          <Spec label="Winning dealer">
            <Sealed width="w-28" label="outside your entitlement" />
          </Spec>
          <Spec label="Clearing price">
            <Sealed width="w-20" label="outside your entitlement" />
          </Spec>
          <Spec label="Settlement">
            <Sealed width="w-24" label="outside your entitlement" />
          </Spec>
        </SpecStrip>
        <p className="max-w-[62ch] text-mini leading-relaxed text-ink-3">
          The treasury accepted a quote and closed the RFQ as two sibling commands in one
          submission. This party is a stakeholder on the RFQ node only, so the close arrived and the
          acceptance did not. There is no AcceptedTrade, SettlementInstruction or SettlementReceipt
          in this party&rsquo;s active contract set to read.
        </p>
      </PanelBody>
    </Panel>
  );
}
