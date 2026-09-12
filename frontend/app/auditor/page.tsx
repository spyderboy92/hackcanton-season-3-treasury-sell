import type { Metadata } from 'next';

import { AuditorDesk } from '@/components/desks/AuditorDesk';

export const metadata: Metadata = { title: 'Auditor — Treasury RFQ' };

export default function AuditorPage() {
  return <AuditorDesk />;
}
