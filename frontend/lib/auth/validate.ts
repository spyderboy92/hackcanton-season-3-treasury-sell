/**
 * Signup and login input rules. CLIENT-SAFE, and used on both sides: the signup
 * form runs it for instant field errors, and `/api/auth/signup` runs it again
 * because the browser's verdict is a courtesy, not a check.
 *
 * The username rule is a copy of `validUsername` in `TreasuryRfq.Accounts`
 * (daml/). The ledger's `ensure` is the last word — a username that slipped past
 * this file would still be refused by the participant — but failing here gives
 * a field-level message instead of a template-precondition rejection.
 */

import { DEALER_SEATS, isUserType, type AccountSeat, type DealerSeat, type UserType } from './access';

/**
 * 3–32 of [a-z0-9._-], starting with a letter or digit. Lowercase-only so
 * "Treasury" and "treasury" cannot be two accounts, and a restricted alphabet so
 * a username is safe in a cookie, a log line or a URL without escaping.
 */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export const PASSWORD_MIN = 8;
/** Upper bound so a megabyte "password" cannot be used to burn scrypt CPU. */
export const PASSWORD_MAX = 128;

/** Lookups are username-exact after this. Mirrors what the signup form stores. */
export function normalizeUsername(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export type SignupField = 'username' | 'password' | 'confirmPassword' | 'userType' | 'dealerDesk';

export interface SignupInput {
  username: string;
  password: string;
  userType: UserType;
  seat: AccountSeat;
}

export type SignupValidation =
  | { ok: true; value: SignupInput }
  | { ok: false; fields: Partial<Record<SignupField, string>> };

const DESK_SEAT: Record<string, DealerSeat> = { A: 'dealerA', B: 'dealerB', C: 'dealerC' };

/** `"A"`/`"a"`/`"dealerA"` → `dealerA`; anything else → undefined. */
function dealerSeat(raw: unknown): DealerSeat | undefined {
  if (typeof raw !== 'string') return undefined;
  if ((DEALER_SEATS as readonly string[]).includes(raw)) return raw as DealerSeat;
  return DESK_SEAT[raw.trim().toUpperCase()];
}

/**
 * Checks an untrusted signup body and returns either the normalised account
 * request or a message per offending field. Every field is checked, so the
 * form can show all of its problems at once rather than one per round trip.
 */
export function validateSignup(body: unknown): SignupValidation {
  const o = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const fields: Partial<Record<SignupField, string>> = {};

  const username = normalizeUsername(o.username);
  if (!username) fields.username = 'Choose a username.';
  else if (username.length < 3 || username.length > 32) fields.username = 'Use 3 to 32 characters.';
  else if (!USERNAME_PATTERN.test(username)) {
    fields.username = 'Use lowercase letters, digits, ".", "_" or "-", starting with a letter or digit.';
  }

  const password = typeof o.password === 'string' ? o.password : '';
  const passwordProblem = !password
    ? 'Choose a password.'
    : password.length < PASSWORD_MIN
      ? `Use at least ${PASSWORD_MIN} characters.`
      : password.length > PASSWORD_MAX
        ? `Use at most ${PASSWORD_MAX} characters.`
        : null;
  if (passwordProblem) fields.password = passwordProblem;

  const confirm = typeof o.confirmPassword === 'string' ? o.confirmPassword : '';
  if (!confirm) fields.confirmPassword = 'Repeat the password.';
  else if (password && confirm !== password) fields.confirmPassword = 'The passwords do not match.';

  let seat: AccountSeat | undefined;
  const userType = o.userType;
  if (!isUserType(userType)) {
    fields.userType = 'Choose Treasury, Dealer or Auditor.';
  } else if (userType === 'Dealer') {
    seat = dealerSeat(o.dealerDesk);
    if (!seat) fields.dealerDesk = 'Choose dealer desk A, B or C.';
  } else {
    seat = userType === 'Treasury' ? 'treasury' : 'auditor';
  }

  if (Object.keys(fields).length > 0 || !seat || !isUserType(userType)) return { ok: false, fields };
  return { ok: true, value: { username, password, userType, seat } };
}
