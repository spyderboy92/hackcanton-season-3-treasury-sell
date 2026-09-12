'use client';

import { useLedger } from '@/lib/ledger/provider';

export function LedgerStatus() {
  const client = useLedger();
  return (
    <span className="hidden items-center gap-1.5 md:inline-flex" title={`Ledger: ${client.kind}`}>
      <span className="size-1.5 rounded-full bg-pos breathe" />
      <span className="num text-micro text-ink-3">{client.endpoint}</span>
    </span>
  );
}
