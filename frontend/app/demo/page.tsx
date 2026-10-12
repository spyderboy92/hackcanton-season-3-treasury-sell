import type { Metadata } from 'next';

import { SplitDemo } from '@/components/demo/SplitDemo';

export const metadata: Metadata = { title: 'Split view — Canton TreasuryOS' };

export default function DemoPage() {
  return <SplitDemo />;
}
