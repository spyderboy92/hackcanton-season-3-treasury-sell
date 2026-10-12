import type { Metadata } from 'next';

import { TreasuryDesk } from '@/components/desks/TreasuryDesk';

export const metadata: Metadata = { title: 'Treasury desk — Canton TreasuryOS' };

export default function TreasuryPage() {
  return <TreasuryDesk />;
}
