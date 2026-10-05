import { cn } from '@/lib/cn';
import { Sealed } from '@/components/primitives/Sealed';
import { Table, Td, Th } from '@/components/primitives/Table';
import type { LedgerTemplate } from '@/lib/ledger/client';

export interface EntitlementRow {
  template: LedgerTemplate;
  /** Number of active contracts of this template in the party's ACS. */
  count: number | null;
  /** True when the party is a signatory or observer on this template. */
  entitled: boolean;
  reason: string;
}

/**
 * A party's read entitlement, template by template. This is a statement about
 * the ledger's stakeholder sets, not about what the interface chooses to draw.
 */
export function EntitlementMatrix({ rows }: { rows: EntitlementRow[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Template</Th>
          <Th align="right" className="w-20">
            In ACS
          </Th>
          <Th>Stakeholder basis</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.template}
            className={cn(row.entitled && 'bg-pos-wash')}
          >
            <Td>
              <span className={cn('num text-xs', row.entitled ? 'text-ink' : 'text-ink-3')}>
                {row.template}
              </span>
            </Td>
            <Td align="right">
              {row.entitled ? (
                <span className="num text-xs text-pos">{row.count ?? 0}</span>
              ) : (
                <span className="flex justify-end">
                  <Sealed width="w-8" />
                </span>
              )}
            </Td>
            <Td className="text-mini text-ink-3">{row.reason}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
