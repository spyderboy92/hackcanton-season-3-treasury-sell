import type { Metadata } from 'next';

import { AuditorDesk } from '@/components/desks/AuditorDesk';

export const metadata: Metadata = { title: 'Auditor — Canton TreasuryOS' };

export default function AuditorPage() {
  return <AuditorDesk />;
}
