'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { SessionUser } from './access';

const SessionContext = createContext<SessionUser | null>(null);

/**
 * The signed-in user, handed down from the root layout.
 *
 * The layout verifies the cookie on the server and passes only
 * `{ username, userType, seat }` — the cookie itself is HttpOnly and never
 * reaches script. Login and logout do a full navigation, so this value is
 * re-rendered from the server rather than patched in the browser.
 */
export function SessionProvider({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionUser | null {
  return useContext(SessionContext);
}
