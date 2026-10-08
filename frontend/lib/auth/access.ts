/**
 * Who may open what. CLIENT-SAFE: no secrets, no Node APIs, no party ids.
 *
 * This file is imported by `middleware.ts`, by server components and by the
 * shell in the browser, so it holds only the *shape* of an account and the
 * page-level routing policy. It deliberately knows nothing about Canton party
 * ids: a session names a SEAT (`dealerB`), and the seat is bound to whatever
 * party the participant currently holds for it at request time
 * (`lib/ledger/server/parties.ts`). That indirection is what keeps a session
 * valid across a re-seeded sandbox, where every party id changes.
 *
 * Page routing here is UX, not the privacy boundary. The boundary is the
 * `asParty` check in the `/api/ledger/*` route handlers (see
 * `lib/auth/server/policy.ts`) — a page shell without data shows nothing, and
 * the ledger itself still scopes every read to the acting party.
 */

/** The account kinds, spelled exactly as the Daml `UserType` enum serialises. */
export type UserType = 'Treasury' | 'Dealer' | 'Auditor';

export const USER_TYPES: readonly UserType[] = ['Treasury', 'Dealer', 'Auditor'];

/**
 * Seats an account can be bound to. These are the `DemoRole` keys of
 * `lib/ledger/parties.ts` and the `seat` texts of the Daml `PartyProfile` /
 * `UserAccount` — one vocabulary end to end. The registry is a seat in the
 * directory but nobody logs in as the token issuer, so it is not listed.
 */
export type AccountSeat = 'treasury' | 'dealerA' | 'dealerB' | 'dealerC' | 'auditor';

export const DEALER_SEATS = ['dealerA', 'dealerB', 'dealerC'] as const;
export type DealerSeat = (typeof DEALER_SEATS)[number];

/** The route slug of each dealer seat: `/dealer/<slug>`. Mirrors `parties.ts`. */
export const DEALER_SLUG: Record<DealerSeat, string> = { dealerA: 'a', dealerB: 'b', dealerC: 'c' };

/** What the signed-in user is. Carried in the session cookie; never a party id. */
export interface SessionUser {
  username: string;
  userType: UserType;
  seat: AccountSeat;
}

/**
 * The five seeded demo logins. Password == username, so these are public
 * credentials (see `Tests.Fixtures.demoAccounts` in daml-test) and safe to show
 * on the login page.
 */
export const DEMO_LOGINS: readonly SessionUser[] = [
  { username: 'treasury', userType: 'Treasury', seat: 'treasury' },
  { username: 'dealer-a', userType: 'Dealer', seat: 'dealerA' },
  { username: 'dealer-b', userType: 'Dealer', seat: 'dealerB' },
  { username: 'dealer-c', userType: 'Dealer', seat: 'dealerC' },
  { username: 'auditor', userType: 'Auditor', seat: 'auditor' },
];

/** Mirrors the Daml `seatMatches`, so a forged or stale cookie cannot pair a type with the wrong seat. */
export function seatMatches(userType: UserType, seat: string): seat is AccountSeat {
  switch (userType) {
    case 'Treasury':
      return seat === 'treasury';
    case 'Dealer':
      return (DEALER_SEATS as readonly string[]).includes(seat);
    case 'Auditor':
      return seat === 'auditor';
  }
}

export function isUserType(value: unknown): value is UserType {
  return typeof value === 'string' && (USER_TYPES as readonly string[]).includes(value);
}

/** The desk a user lands on after login. */
export function homeFor(user: Pick<SessionUser, 'seat'>): string {
  switch (user.seat) {
    case 'treasury':
      return '/treasury';
    case 'auditor':
      return '/auditor';
    default:
      return `/dealer/${DEALER_SLUG[user.seat]}`;
  }
}

/**
 * Whether `user` may open the page at `pathname`.
 *
 * Desk routes belong to exactly one seat. `/demo` (the split "Compare views"
 * screen) is Treasury-only because it reads and drives the dealer seats on the
 * treasury's behalf — see `allowedParties` in `lib/auth/server/policy.ts` for
 * the matching API-side exception. Anything that is not a desk route (`/`, a
 * 404) is open to any signed-in user.
 */
export function canOpen(user: SessionUser, pathname: string): boolean {
  if (pathname === '/treasury' || pathname.startsWith('/treasury/')) return user.seat === 'treasury';
  if (pathname === '/demo' || pathname.startsWith('/demo/')) return user.userType === 'Treasury';
  if (pathname === '/auditor' || pathname.startsWith('/auditor/')) return user.seat === 'auditor';
  if (pathname === '/dealer' || pathname.startsWith('/dealer/')) {
    if (user.userType !== 'Dealer') return false;
    const slug = pathname.split('/')[2] ?? '';
    return DEALER_SLUG[user.seat as DealerSeat] === slug;
  }
  return true;
}

export interface NavItem {
  href: string;
  label: string;
}

/** The desks a user may switch between, in presentation order. */
export function navFor(user: SessionUser, dealerLabel: (seat: DealerSeat) => string): NavItem[] {
  switch (user.userType) {
    case 'Treasury':
      return [
        { href: '/treasury', label: 'Treasury' },
        { href: '/demo', label: 'Compare views' },
      ];
    case 'Dealer':
      return [{ href: homeFor(user), label: dealerLabel(user.seat as DealerSeat) }];
    case 'Auditor':
      return [{ href: '/auditor', label: 'Auditor' }];
  }
}

/**
 * Where to send a user after login: the `next` they were bounced from if it is
 * a same-origin path they may open, otherwise their own desk. Rejecting
 * `//host` and `/\host` keeps `?next=` from becoming an open redirect.
 */
export function landingFor(user: SessionUser, next: string | null | undefined): string {
  if (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')) {
    const path = next.split(/[?#]/)[0] ?? '/';
    if (path !== '/login' && path !== '/signup' && path !== '/' && canOpen(user, path)) return next;
  }
  return homeFor(user);
}
