'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/primitives/Button';
import { TextInput } from '@/components/primitives/Field';
import { Notice } from '@/components/primitives/Notice';
import { DEMO_LOGINS, landingFor, type SessionUser } from '@/lib/auth/access';
import { infoForRole } from '@/lib/ledger/parties';

import { AuthField } from './AuthField';
import { postJson } from './post';

export function LoginForm({ next, showTopUp = false }: { next: string | null; showTopUp?: boolean }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [topUpMessage, setTopUpMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [topUpBusy, setTopUpBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter a username and a password.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await postJson<{ user: SessionUser }>('/api/auth/login', { username, password });
    if (result.ok) {
      // Full navigation, not router.push: the root layout must re-render on the
      // server to pick up the new session cookie.
      window.location.assign(landingFor(result.data.user, next));
      return;
    }
    setBusy(false);
    setError(result.message);
    setPassword('');
    (formRef.current?.elements.namedItem('password') as HTMLInputElement | null)?.focus();
  };

  /** Fill a demo account. Password == username, by design of the seed. */
  const fillDemo = (name: string) => {
    setUsername(name);
    setPassword(name);
    setError(null);
  };

  const topUp = async () => {
    setTopUpBusy(true);
    setError(null);
    setTopUpMessage(null);
    const result = await postJson<{ message?: string }>('/api/auth/topup', {});
    setTopUpBusy(false);
    if (result.ok) {
      setTopUpMessage(result.data.message ?? 'Demo balances minted.');
      return;
    }
    setError(result.message);
  };

  return (
    <>
      <form ref={formRef} onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        {error ? <Notice onDismiss={() => setError(null)}>{error}</Notice> : null}
        {topUpMessage ? (
          <Notice tone="good" onDismiss={() => setTopUpMessage(null)}>
            {topUpMessage}
          </Notice>
        ) : null}
        <AuthField label="Username">
          <TextInput
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            mono
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </AuthField>
        <AuthField label="Password">
          <TextInput
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </AuthField>
        <Button type="submit" variant="primary" busy={busy} className="w-full">
          Sign in
        </Button>
        <p className="text-mini text-ink-3">
          No account?{' '}
          <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'} className="text-accent hover:text-accent-hi">
            Create one
          </Link>
          .
        </p>
      </form>

      <section aria-labelledby="demo-accounts" className="mt-8 border-t border-line pt-5">
        <h3 id="demo-accounts" className="text-xs font-medium text-ink">
          Demo accounts
        </h3>
        <p className="mt-1 text-mini text-ink-3">
          Password = username. Pick one to fill the form.
        </p>
        <ul className="mt-3 overflow-hidden rounded-md border border-line bg-surface">
          {DEMO_LOGINS.map((login) => {
            const info = infoForRole(login.seat);
            return (
              <li key={login.username} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => fillDemo(login.username)}
                  className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-2.5 text-left transition-colors hover:bg-raised"
                >
                  <span className="min-w-0">
                    <span className="num block text-xs text-ink">{login.username}</span>
                    <span className="block truncate text-micro text-ink-3">{info.institution}</span>
                  </span>
                  <span className="text-mini text-ink-2">{info.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {showTopUp ? (
        <section aria-labelledby="demo-topup" className="mt-6 border-t border-line pt-5">
          <h3 id="demo-topup" className="text-xs font-medium text-ink">
            DevNet faucet
          </h3>
          <p className="mt-1 text-mini text-ink-3">
            Mint another round of opening balances (Treasury 25 cETH; each dealer
            1,000,000 USD). Additive — prior holdings stay.
          </p>
          <Button
            type="button"
            variant="secondary"
            busy={topUpBusy}
            disabled={busy}
            className="mt-3 w-full"
            onClick={() => void topUp()}
          >
            Top up demo balances
          </Button>
        </section>
      ) : null}
    </>
  );
}
