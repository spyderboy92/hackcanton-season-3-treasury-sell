import { cn } from '@/lib/cn';

/**
 * A desk-readable reference for an RFQ.
 *
 * Ids come from whoever raised the request, and the two sources in play look nothing
 * alike: the in-memory fixture mints UUIDs (`A6768FC6-1B2C-...`), while the sandbox
 * bootstrap mints sequential refs (`RFQ-2026-0001`). Quoting only the leading block is
 * right for the first and useless for the second -- every sequential ref would render as
 * `RFQ`. So: short ids are shown whole, long ones are cut to their leading block.
 */
const WHOLE_ID_MAX = 16;

export function RfqRef({ rfqId, className }: { rfqId: string; className?: string }) {
  const head = rfqId.length <= WHOLE_ID_MAX ? rfqId : (rfqId.split('-')[0] ?? rfqId);
  return (
    <span className={cn('num text-xs', className)} title={rfqId}>
      {head.toUpperCase()}
    </span>
  );
}
