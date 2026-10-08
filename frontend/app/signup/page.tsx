import type { Metadata } from 'next';

import { AuthFrame } from '@/components/auth/AuthFrame';
import { SignupForm } from '@/components/auth/SignupForm';

export const metadata: Metadata = { title: 'Create account — Treasury RFQ' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  return (
    <AuthFrame
      eyebrow="Create account"
      title="Choose your desk"
      aside={
        <p className="max-w-[52ch] border-t border-line pt-5 text-mini leading-relaxed text-ink-3">
          A new account joins one of the demo seats — the treasury, one of three dealer desks, or
          the auditor — and sees exactly what that seat&apos;s party is entitled to on the ledger.
        </p>
      }
    >
      <SignupForm next={typeof next === 'string' ? next : null} />
    </AuthFrame>
  );
}
