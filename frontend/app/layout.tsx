import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

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
   * <PartyBootstrap> for the browser's copy. In mock mode this is a pure
   * function over the built-in fixture ids and the app stays statically
   * renderable; if the participant is unreachable it falls back to those same
   * ids rather than failing the render.
   */
  const { ids } = await resolveDemoParties();

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className={`${plexSans.variable} ${plexMono.variable} min-h-dvh bg-canvas text-ink`}>
        <PartyBootstrap ids={ids}>
          <LedgerProvider>{children}</LedgerProvider>
        </PartyBootstrap>
      </body>
    </html>
  );
}
