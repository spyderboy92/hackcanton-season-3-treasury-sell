'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { cn } from '@/lib/cn';
import { Button } from '@/components/primitives/Button';
import { Select, TextInput } from '@/components/primitives/Field';
import { Notice } from '@/components/primitives/Notice';
import { landingFor, USER_TYPES, type SessionUser, type UserType } from '@/lib/auth/access';
import { PASSWORD_MAX, PASSWORD_MIN, validateSignup, type SignupField } from '@/lib/auth/validate';
import { AUDITOR, DEALERS, TREASURY } from '@/lib/ledger/parties';

import { AuthField } from './AuthField';
import { postJson } from './post';

const TYPE_COPY: Record<UserType, string> = {
  Treasury: 'Raise RFQs, compare every dealer’s price, accept and settle.',
  Dealer: 'Answer RFQs on one dealer desk with a private price.',
  Auditor: 'Read settlement receipts — nothing before them.',
};

type Errors = Partial<Record<SignupField, string>>;

/**
 * Signup: credentials plus the desk the account opens.
 *
 * A new account binds to an existing demo seat (Treasury, Dealer A/B/C,
 * Auditor) rather than getting a party of its own; the seeded RFQ invites the
 * three existing dealers and a fresh party would have nothing to quote on.
 * The same `validateSignup` runs here (for instant feedback) and on the server
 * (because a browser's verdict is not a check).
 */
export function SignupForm({ next }: { next: string | null }) {
  const [form, setForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    userType: '' as UserType | '',
    dealerDesk: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (field: keyof typeof form) => (value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    const local = validateSignup(form);
    if (!local.ok) {
      setErrors(local.fields);
      return;
    }
    setBusy(true);
    const result = await postJson<{ user: SessionUser }>('/api/auth/signup', form);
    if (result.ok) {
      window.location.assign(landingFor(result.data.user, next));
      return;
    }
    setBusy(false);
    setErrors(result.fields as Errors);
    setNotice(result.message);
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
      {notice ? <Notice onDismiss={() => setNotice(null)}>{notice}</Notice> : null}

      <AuthField
        label="Username"
        hint="3–32 characters: lowercase letters, digits, “.”, “_” or “-”."
        error={errors.username}
      >
        <TextInput
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          mono
          value={form.username}
          onChange={(e) => set('username')(e.target.value)}
          required
        />
      </AuthField>

      <AuthField label="Password" hint={`${PASSWORD_MIN}–${PASSWORD_MAX} characters.`} error={errors.password}>
        <TextInput
          name="password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => set('password')(e.target.value)}
          required
        />
      </AuthField>

      <AuthField label="Confirm password" error={errors.confirmPassword}>
        <TextInput
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(e) => set('confirmPassword')(e.target.value)}
          required
        />
      </AuthField>

      <fieldset aria-describedby={errors.userType ? 'user-type-error' : undefined}>
        <legend className="label mb-1 block">Account type</legend>
        <div className="overflow-hidden rounded-md border border-line bg-surface">
          {USER_TYPES.map((type) => {
            const checked = form.userType === type;
            const seat = type === 'Treasury' ? TREASURY : type === 'Auditor' ? AUDITOR : null;
            return (
              <label
                key={type}
                className={cn(
                  'flex min-h-11 cursor-pointer items-start gap-3 border-b border-line-quiet px-3 py-3 last:border-b-0',
                  checked ? 'bg-accent-wash' : 'hover:bg-raised',
                )}
              >
                <input
                  type="radio"
                  name="userType"
                  value={type}
                  checked={checked}
                  onChange={() => set('userType')(type)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-ink">
                    {type}
                    {seat ? <span className="ml-2 font-normal text-ink-3">{seat.institution}</span> : null}
                  </span>
                  <span className="block text-mini text-ink-3">{TYPE_COPY[type]}</span>
                </span>
              </label>
            );
          })}
        </div>
        {errors.userType ? (
          <span id="user-type-error" className="mt-1 block text-mini text-neg">
            {errors.userType}
          </span>
        ) : null}
      </fieldset>

      {form.userType === 'Dealer' ? (
        <AuthField label="Dealer desk" error={errors.dealerDesk}>
          <Select name="dealerDesk" value={form.dealerDesk} onChange={(e) => set('dealerDesk')(e.target.value)} required>
            <option value="">Choose desk A, B or C</option>
            {DEALERS.map((d) => (
              <option key={d.slug} value={d.slug.toUpperCase()}>
                {d.label} — {d.institution}
              </option>
            ))}
          </Select>
        </AuthField>
      ) : null}

      <Button type="submit" variant="primary" busy={busy} className="w-full">
        Create account
      </Button>
      <p className="text-mini text-ink-3">
        Already registered?{' '}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} className="text-accent hover:text-accent-hi">
          Sign in
        </Link>
        .
      </p>
    </form>
  );
}
