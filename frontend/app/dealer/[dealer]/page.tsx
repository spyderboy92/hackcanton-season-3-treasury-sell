import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DealerDesk } from '@/components/desks/DealerDesk';
import { DEALERS, dealerBySlug } from '@/lib/ledger/parties';

export function generateStaticParams() {
  return DEALERS.map((d) => ({ dealer: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ dealer: string }>;
}): Promise<Metadata> {
  const { dealer } = await params;
  const info = dealerBySlug(dealer);
  return { title: info ? `${info.label} desk — Treasury RFQ` : 'Dealer desk — Treasury RFQ' };
}

export default async function DealerPage({ params }: { params: Promise<{ dealer: string }> }) {
  const { dealer } = await params;
  const info = dealerBySlug(dealer);
  if (!info) notFound();
  return <DealerDesk info={info} />;
}
