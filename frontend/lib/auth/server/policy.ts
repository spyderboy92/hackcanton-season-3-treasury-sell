/**
 * Which ledger parties a session may act as. SERVER ONLY.
 *
 * THIS is the privacy boundary between users of the app. The sandbox Ledger API
 * is unauthenticated and the server's ledger credential can act for every demo
 * party, so the only thing that stops a signed-in dealer from naming the
 * treasury as `asParty` is the check that uses this function in the
 * `/api/ledger/*` route handlers. Page routing in `middleware.ts` is UX on top.
 *
 * Kept pure (session + id table in, party list out) so it is unit-tested
 * without a server: `tests/auth.test.cjs`.
 */

import type { DemoRole } from '../../ledger/parties';
import type { Party } from '../../ledger/types';
import type { SessionUser } from '../access';

export class AuthError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

/**
 * The parties `user` may name as `asParty`.
 *
 * Every account acts as its own seat's party, and only that party — with ONE
 * deliberate exception: a Treasury session may also act as the three dealer
 * parties. The split "Compare views" screen (`components/demo/SplitDemo.tsx`)
 * is a treasury-side demonstration that reads a dealer desk next to the
 * treasury's and drives the whole trade from one screen, which means
 * submitting `allocateAsset`/`settle` as whichever side is the seller/buyer —
 * a dealer on a Buy, the treasury on a Sell — and reading the dealer's holdings
 * to pick a payment leg. Without the exception that screen cannot work; with
 * it, the treasury login is a demo operator over the dealer seats. That is a
 * conscious trade-off for the demo, and the reason `/demo` is Treasury-only.
 *
 * What the exception does NOT change: every read is still scoped by the
 * participant to the one acting party, so acting "as Dealer A" shows exactly
 * Dealer A's slice of the ledger and nothing the treasury could not already
 * get by asking Dealer A. The auditor and the registry are never reachable
 * through it, and dealers never act as anyone but themselves.
 */
export function allowedParties(user: SessionUser, ids: Record<DemoRole, Party>): Party[] {
  const own = ids[user.seat];
  if (user.userType === 'Treasury') return [own, ids.dealerA, ids.dealerB, ids.dealerC];
  return [own];
}

/** Throws a 403 unless `asParty` is one `user` may act as. */
export function assertMayActAs(user: SessionUser, ids: Record<DemoRole, Party>, asParty: Party): void {
  if (!allowedParties(user, ids).includes(asParty)) {
    throw new AuthError(403, `Signed in as ${user.username}: not permitted to act as that party.`);
  }
}
