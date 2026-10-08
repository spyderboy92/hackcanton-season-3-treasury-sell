import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

import { SessionProvider } from '@/lib/auth/SessionProvider';
import { currentSession } from '@/lib/auth/server/request';
import { LedgerProvider } from '@/lib/ledger/provider';
import { PartyBootstrap } from '@/lib/ledger/PartyBootstrap';
import { resolveDemoParties } from '@/lib/ledger/server/parties';
import './globals.css';

const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Treasury RFQ — private quote formation on Canton',
  description:
    'Institutional request-for-quote workflow where each dealer sees only its own price, enforced by the ledger.',
};

export const viewport: Viewport = {
  themeColor: '#0a0c10',
};

/** Applies the stored theme before paint so the canvas never flashes. */
const THEME_BOOT = `try{var t=localStorage.getItem('rfq.theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /**
   * On a live participant the demo roles must be bound to real party ids before
   * anything renders. Resolving here — server side, once per request — applies
   * them to the server's copy of the party directory and hands the same ids to
   * <PartyBootstrap> for the browser's copy — together with the labels and
   * institutions from the operator's on-ledger PartyProfiles. In mock mode
   * this is a pure function over the built-in fixture; if the participant is
   * unreachable it falls back to those same ids rather than failing the render.
   *
   * The session is verified here too, so the shell can show who is signed in
   * on the first paint without a client-side fetch. Reading the cookie makes
   * every page request-time rendered, which a signed-in app is anyway.
   */
  const [{ ids, directory }, session] = await Promise.all([resolveDemoParties(), currentSession()]);
  const user = session ? { username: session.username, userType: session.userType, seat: session.seat } : null;

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className={`${plexSans.variable} ${plexMono.variable} min-h-dvh bg-canvas text-ink`}>
        <PartyBootstrap ids={ids} directory={directory}>
          <SessionProvider user={user}>
            <LedgerProvider>{children}</LedgerProvider>
          </SessionProvider>
        </PartyBootstrap>
      </body>
    </html>
  );
}
