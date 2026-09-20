import { Amount } from '@/components/primitives/Value';
import { Panel, PanelBody, PanelHeader } from '@/components/primitives/Panel';
import type { Contract, TokenHolding } from '@/lib/ledger/types';

/** Mock CIP-56 holdings owned by the acting party. */
export function HoldingsPanel({ holdings }: { holdings: Contract<TokenHolding>[] }) {
  return (
    <Panel>
      <PanelHeader title="Holdings" meta="Registry-issued, CIP-56 shaped" />
      <PanelBody className="p-0">
        {holdings.length === 0 ? (
          <p className="px-3 py-3 text-mini text-ink-3">This party owns no holdings.</p>
        ) : (
          <ul>
            {holdings.map(({ contractId, payload }) => (
              <li
                key={contractId}
                className="flex items-baseline justify-between gap-3 border-b border-line-quiet px-3 py-2 last:border-b-0"
              >
                <span className="num text-xs text-ink-2">{payload.symbol}</span>
                <Amount
                  value={payload.amount}
                  symbol={payload.symbol}
                  emphasis="strong"
                  className="text-xs"
                />
              </li>
            ))}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}
