'use client';

import { useState } from 'react';

import { cn } from '@/lib/cn';
import type { LedgerRecord } from '@/lib/ledger/types';

/**
 * The ledger transaction that settled a trade. The id is always shown; it is a
 * link only when the server named an explorer for this network (Lighthouse on
 * DevNet), so the sandbox never renders a link that goes nowhere.
 */
export function LedgerRecordRef({
  record,
  keep = 12,
  className,
}: {
  record: LedgerRecord | undefined;
  keep?: number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!record) return <span className={cn('text-mini text-ink-4', className)}>—</span>;

  const { updateId, explorerUrl } = record;
  const short = updateId.length > keep ? `${updateId.slice(0, keep)}…` : updateId;

  const copy = () => {
    void navigator.clipboard?.writeText(updateId).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  };

  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      {explorerUrl ? (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`${updateId} — open on the ledger explorer`}
          className="num text-mini text-accent hover:text-accent-hi"
          data-testid="ledger-tx-link"
        >
          {short}
          <span aria-hidden> ↗</span>
          <span className="sr-only"> (opens the ledger explorer in a new tab)</span>
        </a>
      ) : (
        <span className="num text-mini text-ink-2" title={updateId} data-testid="ledger-tx-id">
          {short}
        </span>
      )}
      <button
        type="button"
        onClick={copy}
        className="text-micro text-ink-4 hover:text-ink-2"
        aria-label="Copy ledger transaction id"
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </span>
  );
}
