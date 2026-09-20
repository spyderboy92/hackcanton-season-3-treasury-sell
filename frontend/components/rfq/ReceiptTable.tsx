import { Amount } from '@/components/primitives/Value';
import { PartyId } from '@/components/primitives/PartyTag';
import { Table, Td, Th } from '@/components/primitives/Table';
import { Timestamp } from '@/components/primitives/Timestamp';
import { partyLabel } from '@/lib/ledger/parties';
import type { Contract, SettlementReceipt } from '@/lib/ledger/types';

import { RfqRef } from './RfqRef';

/** Immutable post-trade evidence. The only thing an auditor is on. */
export function ReceiptTable({ receipts }: { receipts: Contract<SettlementReceipt>[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Settled</Th>
          <Th>Reference</Th>
          <Th>Delivered</Th>
          <Th align="right">Price</Th>
          <Th align="right">Consideration</Th>
          <Th>Seller</Th>
          <Th>Buyer</Th>
          <Th className="hidden xl:table-cell">Contract</Th>
        </tr>
      </thead>
      <tbody>
        {receipts.map(({ contractId, payload }) => (
          <tr key={contractId} className="border-l-2 border-l-pos">
            <Td>
              <Timestamp iso={payload.settledAt} className="text-xs text-ink" />
            </Td>
            <Td>
              <RfqRef rfqId={payload.rfqId} />
            </Td>
            <Td num>
              <Amount value={payload.assetQuantity} symbol={payload.asset} />
              <span className="ml-1 text-ink-3">{payload.asset}</span>
            </Td>
            <Td align="right">
              <Amount value={payload.price} symbol={payload.quoteCurrency} emphasis="strong" />
            </Td>
            <Td align="right">
              <Amount value={payload.paymentAmount} dp={2} emphasis="strong" />
              <span className="ml-1 text-mini text-ink-3">{payload.quoteCurrency}</span>
            </Td>
            <Td>
              <div className="text-ink">{partyLabel(payload.seller)}</div>
              <PartyId party={payload.seller} keep={4} />
            </Td>
            <Td>
              <div className="text-ink">{partyLabel(payload.buyer)}</div>
              <PartyId party={payload.buyer} keep={4} />
            </Td>
            <Td className="hidden xl:table-cell">
              <span className="num text-mini text-ink-3" title={contractId}>
                {contractId.slice(0, 16)}…
              </span>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
