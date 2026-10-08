'use client';

import { useState } from 'react';

import { useSession } from '@/lib/auth/SessionProvider';

/**
 * Who is signed in, and the way out. Sign-out is a POST (so no stray link can
 * trigger it) followed by a full navigation, so the server re-renders the
 * layout without a session and every in-memory desk state is dropped with it.
 */
export function UserMenu() {
  const user = useSession();
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const signOut = async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' });
    } finally {
      window.location.assign('/login');
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className="flex min-w-0 flex-col items-end leading-tight">
        <span className="num max-w-[14ch] truncate text-mini text-ink" title={user.username}>
          {user.username}
        </span>
        <span className="text-micro text-ink-3">{user.userType}</span>
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={busy}
        aria-busy={busy}
        className="min-h-9 rounded-xs border border-line px-3 text-mini text-ink-2 transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
      >
        Sign out
      </button>
    </div>
  );
}
