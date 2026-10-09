import type { Metadata } from 'next';

import { AuthFrame } from '@/components/auth/AuthFrame';
import { LoginForm } from '@/components/auth/LoginForm';
import { topUpEnabled } from '@/lib/ledger/server/topup';

export const metadata: Metadata = { title: 'Sign in — Treasury RFQ' };

/**
 * `next` is read from the server-side search params and handed down, rather
 * than through `useSearchParams` in the form — no Suspense boundary needed, and
 * the form validates it against the account's own desks before following it.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  return (
    <AuthFrame eyebrow="Sign in" title="Open your desk">
      <LoginForm next={typeof next === 'string' ? next : null} showTopUp={topUpEnabled()} />
    </AuthFrame>
  );
}
